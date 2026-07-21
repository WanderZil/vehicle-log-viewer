/**
 * Browser-side Vector BLF (CAN/CAN FD) reader.
 * Layout constants match python-can's BLFReader.
 */

import { inflate } from 'pako';

import { type CanFrame, LogParseError } from '@/lib/can/types';

export type { CanFrame } from '@/lib/can/types';

export class BlfParseError extends LogParseError {
  constructor(message: string) {
    super(message);
    this.name = 'BlfParseError';
  }
}

const FILE_HEADER_SIZE = 144;
const OBJ_HEADER_BASE = 16;
const OBJ_HEADER_V1 = 16; // <LHHQ
const OBJ_HEADER_V2 = 24; // <LBxHQ8x
const LOG_CONTAINER_HDR = 16; // <H6xL4x

const CAN_MESSAGE = 1;
const LOG_CONTAINER = 10;
const CAN_ERROR_EXT = 73;
const CAN_MESSAGE2 = 86;
const CAN_FD_MESSAGE = 100;
const CAN_FD_MESSAGE_64 = 101;
const NO_COMPRESSION = 0;
const ZLIB_DEFLATE = 2;
const CAN_MSG_EXT = 0x80000000;
const REMOTE_FLAG = 0x80;
/** CAN_FD_MESSAGE fdFlags */
const FD_EDL = 0x1;
const FD_BRS = 0x2;
const FD_ESI = 0x4;
/** CAN_FD_MESSAGE_64 flags */
const FD64_REMOTE = 0x0010;
const FD64_EDL = 0x1000;
const FD64_BRS = 0x2000;
const FD64_ESI = 0x4000;

function u16(view: DataView, o: number) {
  return view.getUint16(o, true);
}
function u32(view: DataView, o: number) {
  return view.getUint32(o, true);
}
function u64(view: DataView, o: number) {
  const lo = view.getUint32(o, true);
  const hi = view.getUint32(o + 4, true);
  return hi * 0x1_0000_0000 + lo;
}

function systemTimeToUnix(view: DataView, offset: number): number {
  const year = u16(view, offset);
  const month = u16(view, offset + 2);
  const day = u16(view, offset + 6);
  const hour = u16(view, offset + 8);
  const minute = u16(view, offset + 10);
  const second = u16(view, offset + 12);
  const ms = u16(view, offset + 14);
  if (!year) return 0;
  try {
    return Date.UTC(year, month - 1, day, hour, minute, second, ms) / 1000;
  } catch {
    return 0;
  }
}

import { dlcToLen as dlc2len } from '@/lib/can/types';

function findLobj(data: Uint8Array, from: number, maxScan = 8): number {
  const end = Math.min(data.length - 4, from + maxScan - 1);
  for (let i = from; i <= end; i += 1) {
    if (
      data[i] === 0x4c &&
      data[i + 1] === 0x4f &&
      data[i + 2] === 0x42 &&
      data[i + 3] === 0x4a
    ) {
      return i;
    }
  }
  return -1;
}

function advancePastObject(filePos: number, objSize: number) {
  return filePos + objSize + (objSize % 4);
}

/**
 * Iterate CAN frames from a BLF ArrayBuffer.
 * Channels are CANoe 1-based (as stored in BLF).
 */
export function* iterateBlfFrames(buffer: ArrayBuffer): Generator<CanFrame> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < FILE_HEADER_SIZE) {
    throw new BlfParseError('File too small for BLF header');
  }
  const view = new DataView(buffer);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'LOGG') {
    throw new BlfParseError('Unexpected file format (not LOGG)');
  }

  const headerSize = u32(view, 4);
  // SYSTEMTIME start at offset 40 in FILE_HEADER_STRUCT
  const startTimestamp = systemTimeToUnix(view, 40);
  let filePos = Math.max(headerSize, FILE_HEADER_SIZE);
  let tail = new Uint8Array(0);

  while (filePos + OBJ_HEADER_BASE <= bytes.length) {
    if (
      bytes[filePos] !== 0x4c ||
      bytes[filePos + 1] !== 0x4f ||
      bytes[filePos + 2] !== 0x42 ||
      bytes[filePos + 3] !== 0x4a
    ) {
      const next = findLobj(bytes, filePos, 256);
      if (next < 0) break;
      filePos = next;
      continue;
    }

    const objSize = u32(view, filePos + 8);
    const objType = u32(view, filePos + 12);
    if (objSize < OBJ_HEADER_BASE || filePos + objSize > bytes.length) break;

    if (objType === LOG_CONTAINER) {
      const method = u16(view, filePos + OBJ_HEADER_BASE);
      const compressed = bytes.subarray(
        filePos + OBJ_HEADER_BASE + LOG_CONTAINER_HDR,
        filePos + objSize
      );
      let data: Uint8Array | null = null;
      if (method === NO_COMPRESSION) {
        data = compressed;
      } else if (method === ZLIB_DEFLATE) {
        try {
          data = new Uint8Array(inflate(compressed));
        } catch {
          data = null;
        }
      }

      if (data) {
        const merged =
          tail.length > 0
            ? (() => {
                const out = new Uint8Array(tail.length + data.length);
                out.set(tail);
                out.set(data, tail.length);
                return out;
              })()
            : data;
        const { frames, remainder } = parseContainer(merged, startTimestamp);
        for (const f of frames) yield f;
        tail = remainder;
      }
    }

    filePos = advancePastObject(filePos, objSize);
  }
}

function parseContainer(
  data: Uint8Array,
  startTimestamp: number
): { frames: CanFrame[]; remainder: Uint8Array } {
  const frames: CanFrame[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;
  const maxPos = data.length;

  while (true) {
    const checkpoint = pos;
    if (pos + OBJ_HEADER_BASE > maxPos) {
      return { frames, remainder: data.subarray(checkpoint) };
    }

    const lobj = findLobj(data, pos, 8);
    if (lobj < 0) {
      if (pos + 8 > maxPos) return { frames, remainder: data.subarray(checkpoint) };
      return { frames, remainder: new Uint8Array(0) };
    }
    pos = lobj;

    const headerVersion = u16(view, pos + 6);
    const objSize = u32(view, pos + 8);
    const objType = u32(view, pos + 12);
    const nextPos = pos + objSize;
    if (nextPos > maxPos) return { frames, remainder: data.subarray(checkpoint) };

    let flags = 0;
    let timestampRaw = 0;
    let body = pos + OBJ_HEADER_BASE;

    if (headerVersion === 1) {
      flags = u32(view, body);
      timestampRaw = u64(view, body + 8);
      body += OBJ_HEADER_V1;
    } else if (headerVersion === 2) {
      flags = u32(view, body);
      timestampRaw = u64(view, body + 8);
      body += OBJ_HEADER_V2;
    } else {
      pos = nextPos;
      continue;
    }

    const factor = flags === 1 ? 1e-5 : 1e-9;
    const timestamp = timestampRaw * factor + startTimestamp;

    if (objType === CAN_MESSAGE || objType === CAN_MESSAGE2) {
      const channel = u16(view, body);
      const msgFlags = view.getUint8(body + 2);
      const dlc = view.getUint8(body + 3);
      const canId = u32(view, body + 4);
      const nbytes = Math.min(dlc, 8);
      frames.push({
        timestamp,
        channel,
        arbitrationId: canId & 0x1fffffff,
        isExtended: Boolean(canId & CAN_MSG_EXT),
        isRemote: Boolean(msgFlags & REMOTE_FLAG),
        isFd: false,
        data: data.subarray(body + 8, body + 8 + nbytes).slice(),
      });
    } else if (objType === CAN_ERROR_EXT) {
      const channel = u16(view, body);
      const dlc = view.getUint8(body + 10);
      const canId = u32(view, body + 16);
      const nbytes = Math.min(dlc, 8);
      frames.push({
        timestamp,
        channel,
        arbitrationId: canId & 0x1fffffff,
        isExtended: Boolean(canId & CAN_MSG_EXT),
        isRemote: false,
        isFd: false,
        isError: true,
        data: data.subarray(body + 24, body + 24 + nbytes).slice(),
      });
    } else if (objType === CAN_FD_MESSAGE) {
      const channel = u16(view, body);
      const msgFlags = view.getUint8(body + 2);
      const dlc = view.getUint8(body + 3);
      const canId = u32(view, body + 4);
      const fdFlags = view.getUint8(body + 16);
      const validBytes = view.getUint8(body + 17);
      const nbytes = Math.min(validBytes, dlc2len(dlc), 64);
      frames.push({
        timestamp,
        channel,
        arbitrationId: canId & 0x1fffffff,
        isExtended: Boolean(canId & CAN_MSG_EXT),
        isRemote: Boolean(msgFlags & REMOTE_FLAG),
        isFd: Boolean(fdFlags & FD_EDL),
        isBrs: Boolean(fdFlags & FD_BRS),
        isEsi: Boolean(fdFlags & FD_ESI),
        data: data.subarray(body + 24, body + 24 + nbytes).slice(),
      });
    } else if (objType === CAN_FD_MESSAGE_64) {
      const channel = view.getUint8(body);
      const dlc = view.getUint8(body + 1);
      const validBytes = view.getUint8(body + 2);
      const canId = u32(view, body + 4);
      const fdFlags = u32(view, body + 12);
      const structSize = 40;
      const nbytes = Math.min(validBytes, dlc2len(dlc), 64);
      frames.push({
        timestamp,
        channel,
        arbitrationId: canId & 0x1fffffff,
        isExtended: Boolean(canId & CAN_MSG_EXT),
        isRemote: Boolean(fdFlags & FD64_REMOTE),
        isFd: Boolean(fdFlags & FD64_EDL),
        isBrs: Boolean(fdFlags & FD64_BRS),
        isEsi: Boolean(fdFlags & FD64_ESI),
        data: data.subarray(body + structSize, body + structSize + nbytes).slice(),
      });
    }

    pos = nextPos;
  }

  return { frames, remainder: new Uint8Array(0) };
}

export function listBlfChannels(
  buffer: ArrayBuffer,
  limit = 500_000
): { channels: number[]; messageCount: number; truncated: boolean } {
  const counts = new Map<number, number>();
  let messageCount = 0;
  let truncated = false;
  for (const frame of iterateBlfFrames(buffer)) {
    counts.set(frame.channel, (counts.get(frame.channel) ?? 0) + 1);
    messageCount += 1;
    if (limit > 0 && messageCount >= limit) {
      truncated = true;
      break;
    }
  }
  return {
    channels: [...counts.keys()].sort((a, b) => a - b),
    messageCount,
    truncated,
  };
}
