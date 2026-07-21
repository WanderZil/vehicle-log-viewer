/**
 * Minimal ASAM MDF4 (.mf4) reader for CAN bus logging groups.
 * Supports sorted/unsorted records, DT/DV/DL/HL/DZ (deflate + transpose).
 * Structure aligned with python-can / asammdf CAN_DataFrame bus logging.
 */

import { inflate } from 'pako';

import { type CanFrame, dlcToLen, LogParseError } from '@/lib/can/types';

export class Mf4ParseError extends LogParseError {
  constructor(message: string) {
    super(message);
    this.name = 'Mf4ParseError';
  }
}

const COMMON_HEADER = 24;
const MAX_DATA_BYTES = 256 * 1024 * 1024;

type Conversion = { kind: number; values: number[] };

type Channel = {
  name: string;
  channelType: number;
  syncType: number;
  dataType: number;
  bitOffset: number;
  byteOffset: number;
  bitCount: number;
  flags: number;
  invalidationBit: number;
  conversion: Conversion;
};

type ChannelGroup = {
  recordId: number;
  cycles: number;
  flags: number;
  sampleSize: number;
  invalidationSize: number;
  isCanBus: boolean;
  channels: Channel[];
};

type DataGroup = {
  dataAddress: number;
  recordIdSize: number;
  groups: ChannelGroup[];
};

type Block = {
  offset: number;
  length: number;
  linkCount: number;
  dataOffset: number;
  id: string;
};

type RawPlan = {
  kind: 'data' | 'remote' | 'error';
  time: Channel;
  id: Channel;
  ide?: Channel;
  dlc: Channel;
  dataLength?: Channel;
  dataBytes?: Channel;
  edl?: Channel;
  brs?: Channel;
  esi?: Channel;
  busChannel?: Channel;
};

function u16(bytes: Uint8Array, o: number) {
  return bytes[o]! | (bytes[o + 1]! << 8);
}
function u32(bytes: Uint8Array, o: number) {
  return (
    (bytes[o]! |
      (bytes[o + 1]! << 8) |
      (bytes[o + 2]! << 16) |
      (bytes[o + 3]! << 24)) >>>
    0
  );
}
function u64(bytes: Uint8Array, o: number): number {
  const lo = u32(bytes, o);
  const hi = u32(bytes, o + 4);
  return hi * 0x1_0000_0000 + lo;
}

function readBlock(bytes: Uint8Array, address: number): Block {
  const offset = address;
  if (offset + COMMON_HEADER > bytes.length) {
    throw new Mf4ParseError('Truncated MDF4 block');
  }
  const length = u64(bytes, offset + 8);
  const linkCount = u64(bytes, offset + 16);
  const linkBytes = linkCount * 8;
  const dataOffset = offset + COMMON_HEADER + linkBytes;
  const end = offset + length;
  if (length < COMMON_HEADER || dataOffset > end || end > bytes.length) {
    throw new Mf4ParseError('Invalid MDF4 block length');
  }
  return {
    offset,
    length,
    linkCount,
    dataOffset,
    id: String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!
    ),
  };
}

function blockLink(bytes: Uint8Array, block: Block, index: number): number {
  if (index >= block.linkCount) throw new Mf4ParseError('Invalid MDF4 link');
  return u64(bytes, block.offset + COMMON_HEADER + index * 8);
}

function blockData(bytes: Uint8Array, block: Block): Uint8Array {
  return bytes.subarray(block.dataOffset, block.offset + block.length);
}

function readText(bytes: Uint8Array, address: number): string {
  if (!address) return '';
  const block = readBlock(bytes, address);
  if (block.id !== '##TX' && block.id !== '##MD') return '';
  const data = blockData(bytes, block);
  let end = data.indexOf(0);
  if (end < 0) end = data.length;
  return new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(0, end));
}

function parseConversion(bytes: Uint8Array, address: number): Conversion {
  if (!address) return { kind: 0, values: [] };
  const block = readBlock(bytes, address);
  if (block.id !== '##CC') return { kind: 0, values: [] };
  const data = blockData(bytes, block);
  if (data.length < 8) return { kind: 0, values: [] };
  const kind = data[0]!;
  const valueCount = u16(data, 6);
  const hasRanges = data.length >= 8 + 16 + valueCount * 8;
  const valuesOffset = 8 + (hasRanges ? 16 : 0);
  const values: number[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < valueCount; i += 1) {
    values.push(view.getFloat64(valuesOffset + i * 8, true));
  }
  return { kind, values };
}

function applyConversion(conv: Conversion, raw: number): number {
  switch (conv.kind) {
    case 0:
      return raw;
    case 1:
      return conv.values.length >= 2 ? conv.values[0]! + conv.values[1]! * raw : raw;
    case 2: {
      if (conv.values.length < 6) return raw;
      const [a, b, c, d, e, f] = conv.values;
      const num = a! * raw * raw + b! * raw + c!;
      const den = d! * raw * raw + e! * raw + f!;
      return Math.abs(den!) > Number.EPSILON ? num / den! : raw;
    }
    default:
      return raw;
  }
}

function isCanSource(bytes: Uint8Array, address: number): boolean {
  if (!address) return false;
  try {
    const block = readBlock(bytes, address);
    const data = blockData(bytes, block);
    return block.id === '##SI' && data.length >= 2 && data[0] === 2 && data[1] === 2;
  } catch {
    return false;
  }
}

function parseChannel(bytes: Uint8Array, block: Block): Channel {
  const data = blockData(bytes, block);
  return {
    name: readText(bytes, blockLink(bytes, block, 2)),
    channelType: data[0]!,
    syncType: data[1]!,
    dataType: data[2]!,
    bitOffset: data[3]!,
    byteOffset: u32(data, 4),
    bitCount: u32(data, 8),
    flags: u32(data, 12),
    invalidationBit: u32(data, 16),
    conversion: parseConversion(bytes, blockLink(bytes, block, 4)),
  };
}

function parseChannelChain(
  bytes: Uint8Array,
  address: number,
  seen: Set<number>,
  out: Channel[]
) {
  let addr = address;
  while (addr) {
    if (seen.has(addr)) throw new Mf4ParseError('MDF4 channel link cycle');
    seen.add(addr);
    const block = readBlock(bytes, addr);
    if (block.id !== '##CN') throw new Mf4ParseError('Invalid MDF4 channel');
    out.push(parseChannel(bytes, block));
    const component = blockLink(bytes, block, 1);
    if (component) {
      const cBlock = readBlock(bytes, component);
      if (cBlock.id === '##CN') parseChannelChain(bytes, component, seen, out);
    }
    addr = blockLink(bytes, block, 0);
  }
}

function parseChannelGroup(bytes: Uint8Array, block: Block): ChannelGroup {
  if (block.id !== '##CG') throw new Mf4ParseError('Invalid channel group');
  const data = blockData(bytes, block);
  const channels: Channel[] = [];
  parseChannelChain(bytes, blockLink(bytes, block, 1), new Set(), channels);
  return {
    recordId: u64(data, 0),
    cycles: u64(data, 8),
    flags: u16(data, 16),
    sampleSize: u32(data, 24),
    invalidationSize: u32(data, 28),
    isCanBus: isCanSource(bytes, blockLink(bytes, block, 3)),
    channels,
  };
}

function parseDataGroups(bytes: Uint8Array, first: number): DataGroup[] {
  const out: DataGroup[] = [];
  let address = first;
  const seen = new Set<number>();
  while (address) {
    if (seen.has(address)) throw new Mf4ParseError('MDF4 data-group link cycle');
    seen.add(address);
    const block = readBlock(bytes, address);
    if (block.id !== '##DG') throw new Mf4ParseError('Invalid data group');
    const groups: ChannelGroup[] = [];
    let groupAddr = blockLink(bytes, block, 1);
    const gSeen = new Set<number>();
    while (groupAddr) {
      if (gSeen.has(groupAddr)) throw new Mf4ParseError('MDF4 CG link cycle');
      gSeen.add(groupAddr);
      const gBlock = readBlock(bytes, groupAddr);
      groups.push(parseChannelGroup(bytes, gBlock));
      groupAddr = blockLink(bytes, gBlock, 0);
    }
    const dgData = blockData(bytes, block);
    out.push({
      dataAddress: blockLink(bytes, block, 2),
      recordIdSize: dgData[0] ?? 0,
      groups,
    });
    address = blockLink(bytes, block, 0);
  }
  return out;
}

function untranspose(data: Uint8Array, rowSize: number): Uint8Array {
  if (!rowSize) throw new Mf4ParseError('Invalid transposed DZ block');
  const output = new Uint8Array(data.length);
  const matrixSize = data.length - (data.length % rowSize);
  const rowCount = matrixSize / rowSize || 0;
  for (let column = 0; column < rowSize; column += 1) {
    for (let row = 0; row < rowCount; row += 1) {
      output[row * rowSize + column] = data[column * rowCount + row]!;
    }
  }
  output.set(data.subarray(matrixSize), matrixSize);
  return output;
}

function inflateExact(input: Uint8Array, expected: number): Uint8Array {
  const inflated = inflate(input);
  if (inflated.length === expected) return inflated;
  if (inflated.length > expected) return inflated.subarray(0, expected);
  const out = new Uint8Array(expected);
  out.set(inflated);
  return out;
}

function collectDataAt(
  bytes: Uint8Array,
  address: number,
  seen: Set<number>,
  chunks: Uint8Array[]
): number {
  if (!address) return 0;
  if (seen.has(address)) throw new Mf4ParseError('MDF4 data link cycle');
  seen.add(address);
  const block = readBlock(bytes, address);
  const data = blockData(bytes, block);

  if (block.id === '##DT' || block.id === '##DV') {
    if (data.length > MAX_DATA_BYTES) {
      throw new Mf4ParseError('MF4 data exceeds browser memory limit');
    }
    chunks.push(data);
    return data.length;
  }

  if (block.id === '##DZ') {
    if (data.length < 24) throw new Mf4ParseError('Invalid compressed data block');
    const method = data[2]!;
    const rowSize = u32(data, 4);
    const originalSize = u64(data, 8);
    const compressedSize = u64(data, 16);
    if (originalSize > MAX_DATA_BYTES) {
      throw new Mf4ParseError('MF4 data exceeds browser memory limit');
    }
    const compressed = data.subarray(24, 24 + compressedSize);
    let materialized = inflateExact(compressed, originalSize);
    if (method === 1) materialized = untranspose(materialized, rowSize);
    else if (method !== 0) throw new Mf4ParseError(`Unsupported MF4 compression ${method}`);
    chunks.push(materialized);
    return materialized.length;
  }

  if (block.id === '##DL') {
    let size = 0;
    for (let i = 1; i < block.linkCount; i += 1) {
      const frag = blockLink(bytes, block, i);
      if (frag) size += collectDataAt(bytes, frag, seen, chunks);
    }
    const next = blockLink(bytes, block, 0);
    if (next) size += collectDataAt(bytes, next, seen, chunks);
    return size;
  }

  if (block.id === '##HL') {
    let next = 0;
    for (let i = 0; i < block.linkCount; i += 1) {
      const link = blockLink(bytes, block, i);
      if (link) {
        next = link;
        break;
      }
    }
    if (!next && data.length >= 8) next = u64(data, 0);
    if (!next) throw new Mf4ParseError('Invalid header list block');
    return collectDataAt(bytes, next, seen, chunks);
  }

  throw new Mf4ParseError(`Unsupported MF4 data block ${block.id}`);
}

function collectData(bytes: Uint8Array, address: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  const size = collectDataAt(bytes, address, new Set(), chunks);
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function masterChannel(group: ChannelGroup): Channel | undefined {
  return group.channels.find(
    (c) => c.channelType === 2 && c.syncType === 1 && c.dataType <= 5
  );
}

function member(group: ChannelGroup, prefix: string, name: string): Channel | undefined {
  return group.channels.find((c) => c.name === `${prefix}${name}`);
}

function rawPlan(group: ChannelGroup): RawPlan | null {
  if ((group.flags & 0x0002) === 0 && !group.isCanBus) return null;
  const kindChannel = group.channels.find((c) =>
    ['CAN_DataFrame', 'CAN_RemoteFrame', 'CAN_ErrorFrame'].includes(c.name)
  );
  if (!kindChannel) return null;
  const kind =
    kindChannel.name === 'CAN_RemoteFrame'
      ? 'remote'
      : kindChannel.name === 'CAN_ErrorFrame'
        ? 'error'
        : 'data';
  const prefix = `${kindChannel.name}.`;
  const time = masterChannel(group);
  const id = member(group, prefix, 'ID');
  const dlc = member(group, prefix, 'DLC');
  if (!time || !id || !dlc) return null;
  return {
    kind,
    time,
    id,
    ide: member(group, prefix, 'IDE'),
    dlc,
    dataLength: member(group, prefix, 'DataLength'),
    dataBytes: member(group, prefix, 'DataBytes'),
    edl: member(group, prefix, 'EDL'),
    brs: member(group, prefix, 'BRS'),
    esi: member(group, prefix, 'ESI'),
    busChannel: member(group, prefix, 'BusChannel'),
  };
}

function channelValid(record: Uint8Array, group: ChannelGroup, ch: Channel): boolean {
  if (ch.flags & 0x01) return false;
  if ((ch.flags & 0x02) === 0) return true;
  const byteIndex = group.sampleSize + (ch.invalidationBit >>> 3);
  const bitIndex = ch.invalidationBit & 0x07;
  const b = record[byteIndex];
  if (b == null) return true;
  return (b & (1 << bitIndex)) === 0;
}

function decodeRaw(record: Uint8Array, ch: Channel): number {
  const size = Math.ceil((ch.bitOffset + ch.bitCount) / 8);
  const bytes = record.subarray(ch.byteOffset, ch.byteOffset + size);
  const le = ch.dataType === 0 || ch.dataType === 2 || ch.dataType === 4;
  let raw = 0;
  if (le) {
    for (let i = 0; i < bytes.length; i += 1) {
      raw += bytes[i]! * 256 ** i;
    }
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      raw = raw * 256 + bytes[i]!;
    }
  }
  const shifted = Math.floor(raw / 2 ** ch.bitOffset);
  if (ch.bitCount >= 53) return shifted;
  return shifted & (2 ** ch.bitCount - 1);
}

function decodePhysical(record: Uint8Array, ch: Channel): number {
  let raw: number;
  if (ch.dataType <= 1) {
    raw = decodeRaw(record, ch);
  } else if (ch.dataType <= 3) {
    const unsigned = decodeRaw(record, ch);
    const sign = 2 ** (ch.bitCount - 1);
    raw = unsigned & sign ? unsigned - 2 ** ch.bitCount : unsigned;
  } else if (ch.dataType <= 5) {
    const bits = decodeRaw(record, ch);
    const view = new DataView(new ArrayBuffer(8));
    if (ch.bitCount === 32) {
      view.setUint32(0, bits >>> 0, true);
      raw = view.getFloat32(0, true);
    } else {
      const lo = bits % 0x1_0000_0000;
      const hi = Math.floor(bits / 0x1_0000_0000);
      view.setUint32(0, lo >>> 0, true);
      view.setUint32(4, hi >>> 0, true);
      raw = view.getFloat64(0, true);
    }
  } else {
    throw new Mf4ParseError(`Unsupported channel type ${ch.name}`);
  }
  return applyConversion(ch.conversion, raw);
}

function decodeByteField(record: Uint8Array, ch: Channel, length: number): Uint8Array {
  if (ch.dataType !== 10 || ch.bitOffset !== 0) {
    throw new Mf4ParseError(`Unsupported byte channel ${ch.name}`);
  }
  return record.subarray(ch.byteOffset, ch.byteOffset + length);
}

function recordSize(group: ChannelGroup): number {
  return group.sampleSize + group.invalidationSize;
}

function* walkRecords(
  dataGroup: DataGroup,
  data: Uint8Array
): Generator<{ groupIndex: number; record: Uint8Array }> {
  if (dataGroup.recordIdSize === 0) {
    if (dataGroup.groups.length !== 1) throw new Mf4ParseError('Invalid MF4 data group');
    const group = dataGroup.groups[0]!;
    const size = recordSize(group);
    if (!size) return;
    const count = Math.min(
      group.cycles || Math.floor(data.length / size),
      Math.floor(data.length / size)
    );
    for (let i = 0; i < count; i += 1) {
      yield { groupIndex: 0, record: data.subarray(i * size, (i + 1) * size) };
    }
    return;
  }

  const idSize = dataGroup.recordIdSize;
  if (![1, 2, 4, 8].includes(idSize)) {
    throw new Mf4ParseError(`Unsupported record id size ${idSize}`);
  }
  let pos = 0;
  while (pos + idSize <= data.length) {
    let recordId = 0;
    for (let i = 0; i < idSize; i += 1) {
      recordId += data[pos + i]! * 256 ** i;
    }
    pos += idSize;
    const groupIndex = dataGroup.groups.findIndex((g) => g.recordId === recordId);
    if (groupIndex < 0) throw new Mf4ParseError('Unknown MF4 record id');
    const group = dataGroup.groups[groupIndex]!;
    const size = recordSize(group);
    if (pos + size > data.length) break;
    yield { groupIndex, record: data.subarray(pos, pos + size) };
    pos += size;
  }
}

function frameFromRecord(
  group: ChannelGroup,
  plan: RawPlan,
  record: Uint8Array
): CanFrame | null {
  if (!channelValid(record, group, plan.time)) return null;
  const timestamp = decodePhysical(record, plan.time);
  const rawId = decodeRaw(record, plan.id);
  const arbitrationId = rawId & 0x1fffffff;
  const isExtended = plan.ide
    ? decodeRaw(record, plan.ide) !== 0
    : arbitrationId > 0x7ff;
  const dlc = Math.min(decodeRaw(record, plan.dlc), 15);

  let channel = 1;
  if (plan.busChannel) {
    const ch = decodeRaw(record, plan.busChannel);
    channel = ch >= 1 ? ch : ch + 1;
  }

  if (plan.kind === 'remote') {
    return {
      timestamp,
      channel,
      arbitrationId,
      isExtended,
      isRemote: true,
      isFd: false,
      data: new Uint8Array(0),
    };
  }

  if (plan.kind === 'error') {
    return {
      timestamp,
      channel,
      arbitrationId,
      isExtended,
      isRemote: false,
      isFd: false,
      isError: true,
      data: new Uint8Array(0),
    };
  }

  const dataLength = plan.dataLength ? decodeRaw(record, plan.dataLength) : undefined;
  const edl = plan.edl ? decodeRaw(record, plan.edl) : undefined;
  const isFd =
    edl != null ? edl !== 0 : dlc > 8 || (dataLength != null && dataLength > 8);
  const payloadLen =
    dataLength != null
      ? Math.min(dataLength, 64)
      : isFd
        ? dlcToLen(dlc)
        : Math.min(dlc, 8);

  let data = new Uint8Array(0);
  if (payloadLen > 0) {
    if (!plan.dataBytes) throw new Mf4ParseError('Missing CAN_DataFrame.DataBytes');
    data = new Uint8Array(decodeByteField(record, plan.dataBytes, payloadLen));
  }

  return {
    timestamp,
    channel,
    arbitrationId,
    isExtended,
    isRemote: false,
    isFd,
    isBrs: plan.brs ? decodeRaw(record, plan.brs) !== 0 : undefined,
    isEsi: plan.esi ? decodeRaw(record, plan.esi) !== 0 : undefined,
    data,
  };
}

export function* iterateMf4Frames(buffer: ArrayBuffer): Generator<CanFrame> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 64 + COMMON_HEADER) {
    throw new Mf4ParseError('File too small for MF4 header');
  }
  const sig = String.fromCharCode(...bytes.subarray(0, 8));
  if (sig === 'UnFinMF ') {
    throw new Mf4ParseError('Unfinalized MF4 is not supported');
  }
  if (sig !== 'MDF     ') {
    throw new Mf4ParseError('Not an ASAM MDF4 file');
  }
  const version = new TextDecoder()
    .decode(bytes.subarray(8, 16))
    .replace(/\0/g, '')
    .trim();
  if (!version.startsWith('4')) {
    throw new Mf4ParseError(`Unsupported MDF version ${version || '(unknown)'}`);
  }

  const header = readBlock(bytes, 64);
  if (header.id !== '##HD') throw new Mf4ParseError('Invalid MF4 HD block');

  const startNs = u64(blockData(bytes, header), 0);
  const startSeconds = startNs ? startNs / 1e9 : 0;

  const dataGroups = parseDataGroups(bytes, blockLink(bytes, header, 0));
  let yielded = 0;

  for (const dg of dataGroups) {
    const plans = dg.groups.map(rawPlan);
    if (plans.every((p) => !p)) continue;
    const data = collectData(bytes, dg.dataAddress);
    for (const { groupIndex, record } of walkRecords(dg, data)) {
      const plan = plans[groupIndex];
      if (!plan) continue;
      const frame = frameFromRecord(dg.groups[groupIndex]!, plan, record);
      if (!frame) continue;
      if (startSeconds > 0 && frame.timestamp < 1e9) {
        frame.timestamp += startSeconds;
      }
      yielded += 1;
      yield frame;
    }
  }

  if (yielded === 0) {
    throw new Mf4ParseError(
      'No CAN bus frames found in MF4 (need CAN_DataFrame channel groups)'
    );
  }
}
