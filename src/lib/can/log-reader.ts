/**
 * can-utils / candump -L ASCII log (.log) reader.
 * Also accepts Vector ASC content saved with a .log extension.
 */

import { isAscText, iterateAscFrames } from '@/lib/can/asc-reader';
import { type CanFrame, LogParseError } from '@/lib/can/types';

export class LogAsciiParseError extends LogParseError {
  constructor(message: string) {
    super(message);
    this.name = 'LogAsciiParseError';
  }
}

const CAN_ERR_FLAG = 0x20000000;
const CAN_ERR_BUSERROR = 0x00000080;
const CANFD_BRS = 0x01;
const CANFD_ESI = 0x02;

function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

/** Map can0 / 0 / vcan1 → CANoe 1-based channel. */
export function normalizeLogChannel(channel: string): number {
  const canMatch = channel.match(/^can(\d+)$/i) ?? channel.match(/^vcan(\d+)$/i);
  if (canMatch) return Number(canMatch[1]) + 1;
  if (/^\d+$/.test(channel)) {
    const n = Number(channel);
    return n >= 1 ? n : n + 1;
  }
  // Unknown interface name — hash stably into 1..8
  let h = 0;
  for (let i = 0; i < channel.length; i += 1) h = (h * 31 + channel.charCodeAt(i)) >>> 0;
  return (h % 8) + 1;
}

export function isCanutilsLogText(text: string): boolean {
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) continue;
    return /^\(\d+(?:\.\d+)?\)\s+\S+\s+[0-9A-Fa-f]+#/.test(t);
  }
  return false;
}

export function* iterateCanutilsLogFrames(buffer: ArrayBuffer): Generator<CanFrame> {
  const text = decodeText(buffer);
  let any = false;

  for (const raw of text.split(/\r?\n/)) {
    const temp = raw.trim();
    if (!temp || temp.startsWith('#') || temp.startsWith('//')) continue;

    let timestampString: string;
    let channelString: string;
    let frame: string;

    const tokens = temp.split(/\s+/);
    if (tokens.length < 3) continue;

    if (tokens.length >= 4 && /^(r|t)$/i.test(tokens[tokens.length - 1]!)) {
      timestampString = tokens[0]!;
      channelString = tokens[1]!;
      frame = tokens[2]!;
    } else {
      timestampString = tokens[0]!;
      channelString = tokens[1]!;
      frame = tokens[2]!;
    }

    if (!timestampString.startsWith('(') || !timestampString.endsWith(')')) continue;

    const timestamp = Number(timestampString.slice(1, -1));
    if (!Number.isFinite(timestamp)) continue;

    const hash = frame.indexOf('#');
    if (hash < 0) continue;
    const canIdString = frame.slice(0, hash);
    let data = frame.slice(hash + 1);

    const channel = normalizeLogChannel(channelString);
    const isExtended = canIdString.length > 3;
    let canId = parseInt(canIdString, 16);
    if (!Number.isFinite(canId)) continue;

    let isFd = false;
    let brs = false;
    let esi = false;

    if (data.startsWith('#')) {
      isFd = true;
      const fdFlags = parseInt(data[1] ?? '0', 16);
      brs = Boolean(fdFlags & CANFD_BRS);
      esi = Boolean(fdFlags & CANFD_ESI);
      data = data.slice(2);
    }

    let isRemote = false;
    let payload = new Uint8Array(0);

    if (data && data[0]?.toLowerCase() === 'r') {
      isRemote = true;
    } else if (data) {
      const bytes: number[] = [];
      for (let i = 0; i + 1 < data.length; i += 2) {
        bytes.push(parseInt(data.slice(i, i + 2), 16));
      }
      payload = new Uint8Array(bytes);
    }

    if (canId & CAN_ERR_FLAG && canId & CAN_ERR_BUSERROR) {
      any = true;
      yield {
        timestamp,
        channel,
        arbitrationId: 0,
        isExtended: false,
        isRemote: false,
        isFd: false,
        isError: true,
        data: new Uint8Array(0),
      };
      continue;
    }

    any = true;
    yield {
      timestamp,
      channel,
      arbitrationId: canId & 0x1fffffff,
      isExtended,
      isRemote,
      isFd,
      isBrs: brs,
      isEsi: esi,
      data: payload,
    };
  }

  if (!any) {
    throw new LogAsciiParseError('No CAN frames found in .log file');
  }
}

/**
 * Iterate frames from a .log file: Vector ASC if header matches, else candump -L.
 */
export function* iterateLogFrames(buffer: ArrayBuffer): Generator<CanFrame> {
  const text = decodeText(buffer);
  if (isAscText(text)) {
    yield* iterateAscFrames(buffer);
    return;
  }
  if (isCanutilsLogText(text)) {
    yield* iterateCanutilsLogFrames(buffer);
    return;
  }
  // Prefer ASC attempt (common when engineers rename .asc → .log)
  try {
    let count = 0;
    for (const frame of iterateAscFrames(buffer)) {
      count += 1;
      yield frame;
    }
    if (count > 0) return;
  } catch {
    // fall through
  }
  yield* iterateCanutilsLogFrames(buffer);
}
