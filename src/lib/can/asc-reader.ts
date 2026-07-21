/**
 * Vector ASC (CANalyzer/CANoe ASCII) reader.
 * Compatible with python-can's ASCReader; channels stay CANoe 1-based.
 */

import { type CanFrame, dlcToLen, LogParseError } from '@/lib/can/types';

export class AscParseError extends LogParseError {
  constructor(message: string) {
    super(message);
    this.name = 'AscParseError';
  }
}

const ASC_TRIGGER_RE =
  /^begin\s+triggerblock\s+\w+\s+(.+)/i;
const ASC_MESSAGE_RE =
  /^\d+\.\d+\s+(\d+\s+(\w+\s+(Tx|Rx)|ErrorFrame)|CANFD)/i;

const MONTH_MAP: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
  Mär: '03',
  Mai: '05',
  Okt: '10',
  Dez: '12',
};

function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

function parseAscDate(datetimeString: string): number {
  let s = datetimeString.trim();
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    s = s.replace(name, num);
  }
  const formats: Array<(v: string) => number | null> = [
    (v) => {
      // m d I:M:S.f p Y  or  m d H:M:S.f Y
      const m = v.match(
        /^(\d{1,2})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s+(?:(AM|PM)\s+)?(\d{4})$/i
      );
      if (!m) return null;
      let hour = Number(m[3]);
      const ampm = m[7]?.toUpperCase();
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      const ms = m[6] ? Number(m[6].padEnd(3, '0').slice(0, 3)) : 0;
      return Date.UTC(Number(m[8]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[4]), Number(m[5]), ms) / 1000;
    },
  ];
  for (const fmt of formats) {
    const ts = fmt(s);
    if (ts != null && Number.isFinite(ts)) return ts;
  }
  return 0;
}

function extractCanId(
  strCanId: string,
  base: number
): { arbitrationId: number; isExtended: boolean } {
  if (strCanId.slice(-1).toLowerCase() === 'x') {
    return {
      arbitrationId: parseInt(strCanId.slice(0, -1), base),
      isExtended: true,
    };
  }
  return {
    arbitrationId: parseInt(strCanId, base),
    isExtended: false,
  };
}

function parseDataBytes(dataStr: string, length: number, base: number): Uint8Array {
  const parts = dataStr.trim().split(/\s+/).filter(Boolean);
  const out = new Uint8Array(Math.min(length, parts.length));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(parts[i]!, base);
  }
  return out;
}

function looksLikeAsc(text: string): boolean {
  const head = text.slice(0, 4000);
  return (
    /^date\s+/im.test(head) ||
    /^base\s+(hex|dec)/im.test(head) ||
    /begin\s+triggerblock/i.test(head) ||
    ASC_MESSAGE_RE.test(head)
  );
}

export function isAscText(text: string): boolean {
  return looksLikeAsc(text);
}

export function* iterateAscFrames(buffer: ArrayBuffer): Generator<CanFrame> {
  const text = decodeText(buffer);
  if (!text.trim()) {
    throw new AscParseError('ASC file is empty');
  }

  const lines = text.split(/\r?\n/);
  let base = 16;
  let startTime = 0;
  let headerDone = false;
  let i = 0;

  // Header
  for (; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const dateMatch = line.match(/^date\s+\w+\s+(.+)/i);
    if (dateMatch) {
      startTime = parseAscDate(dateMatch[1]!);
      continue;
    }

    const baseMatch = line.match(
      /^base\s+(hex|dec)(?:\s+timestamps\s+(absolute|relative))?/i
    );
    if (baseMatch) {
      base = baseMatch[1]!.toLowerCase() === 'dec' ? 10 : 16;
      continue;
    }

    if (/^\/\//.test(line)) continue;
    if (/^(no)?\s*internal\s+events\s+logged/i.test(line)) {
      headerDone = true;
      i += 1;
      break;
    }

    // First data-looking line — stop header scan
    if (ASC_MESSAGE_RE.test(line) || ASC_TRIGGER_RE.test(line)) {
      headerDone = true;
      break;
    }

    // Unknown header line — keep scanning a bit
    if (i > 40) break;
  }

  if (!headerDone && i === 0) {
    // Allow header-less ASC fragments
  }

  for (; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const trigger = line.match(ASC_TRIGGER_RE);
    if (trigger) {
      const abs = parseAscDate(trigger[1]!);
      if (abs) startTime = abs;
      continue;
    }

    if (/^\d+\.\d+\s+Start of measurement/i.test(line)) continue;
    if (!ASC_MESSAGE_RE.test(line)) continue;

    let timestampStr: string;
    let channelToken: string;
    let rest: string;
    try {
      const parts = line.split(/\s+/);
      timestampStr = parts[0]!;
      channelToken = parts[1]!;
      rest = parts.slice(2).join(' ');
    } catch {
      continue;
    }

    const timestamp = Number(timestampStr) + startTime;
    if (!Number.isFinite(timestamp)) continue;

    if (channelToken.toUpperCase() === 'CANFD') {
      yield* [parseFdFrame(rest, timestamp, base)];
      continue;
    }

    if (!/^\d+$/.test(channelToken)) continue;
    const channel = Number(channelToken); // CANoe 1-based as stored
    const classic = parseClassicFrame(rest, timestamp, channel, base);
    if (classic) yield classic;
  }
}

function parseClassicFrame(
  rest: string,
  timestamp: number,
  channel: number,
  base: number
): CanFrame | null {
  if (rest.slice(0, 10).toLowerCase() === 'errorframe') {
    return {
      timestamp,
      channel,
      arbitrationId: 0,
      isExtended: false,
      isRemote: false,
      isFd: false,
      isError: true,
      data: new Uint8Array(0),
    };
  }

  const parts = rest.split(/\s+/);
  if (parts.length < 2) return null;

  const idStr = parts[0]!;
  const direction = parts[1]!;
  void direction;
  const { arbitrationId, isExtended } = extractCanId(idStr, base);

  const afterDir = parts.slice(2);
  if (afterDir[0]?.toLowerCase().startsWith('r')) {
    let dlc = 0;
    if (afterDir.length > 1 && /^\d+$/.test(afterDir[1]!)) {
      dlc = parseInt(afterDir[1]!, base);
    }
    return {
      timestamp,
      channel,
      arbitrationId,
      isExtended,
      isRemote: true,
      isFd: false,
      data: new Uint8Array(dlc),
    };
  }

  // Classic: d <dlc> <data...>  or just dlc data
  let idx = 0;
  if (afterDir[0]?.toLowerCase() === 'd') idx = 1;
  const dlcStr = afterDir[idx];
  if (!dlcStr) return null;
  // Classic ASC normally stores DLC 0–8. Some tools export CAN FD frames in
  // classic line syntax with either a DLC code (9–15) or the raw byte length
  // (12/16/20/24/32/48/64). Do not clamp to 8 — that zeroes FD signal fields.
  const rawDlc = parseInt(dlcStr, base);
  if (!Number.isFinite(rawDlc) || rawDlc < 0) return null;
  const dataLength =
    rawDlc <= 8 ? rawDlc : rawDlc <= 15 ? dlcToLen(rawDlc) : rawDlc;
  const dataStr = afterDir.slice(idx + 1).join(' ');
  return {
    timestamp,
    channel,
    arbitrationId,
    isExtended,
    isRemote: false,
    isFd: dataLength > 8,
    data: parseDataBytes(dataStr, dataLength, base),
  };
}

function parseFdFrame(rest: string, timestamp: number, base: number): CanFrame {
  const parts = rest.split(/\s+/);
  // channel dir id [name] brs esi dlc data_length data...
  const channel = Number(parts[0]);
  // parts[1] = Rx/Tx
  let p = 2;
  const { arbitrationId, isExtended } = extractCanId(parts[p++]!, base);

  // Optional symbolic name (non-digit token before BRS)
  if (parts[p] && !/^\d+$/.test(parts[p]!) && parts[p]!.toLowerCase() !== 'errorframe') {
    // Could be symbolic name OR brs already
    if (!['0', '1'].includes(parts[p]!)) {
      p += 1;
    }
  }

  if (parts.slice(p).join(' ').toLowerCase().startsWith('errorframe')) {
    return {
      timestamp,
      channel,
      arbitrationId: 0,
      isExtended: false,
      isRemote: false,
      isFd: true,
      isError: true,
      data: new Uint8Array(0),
    };
  }

  const brs = parts[p++] === '1';
  const esi = parts[p++] === '1';
  const dlcCode = parseInt(parts[p++] ?? '0', base);
  const dataLength = Number(parts[p++] ?? 0);
  const dataStr = parts.slice(p).join(' ');

  if (dataLength === 0) {
    return {
      timestamp,
      channel,
      arbitrationId,
      isExtended,
      isRemote: true,
      isFd: true,
      isBrs: brs,
      isEsi: esi,
      data: new Uint8Array(dlcCode),
    };
  }

  return {
    timestamp,
    channel,
    arbitrationId,
    isExtended,
    isRemote: false,
    isFd: true,
    isBrs: brs,
    isEsi: esi,
    data: parseDataBytes(dataStr, dataLength, base),
  };
}
