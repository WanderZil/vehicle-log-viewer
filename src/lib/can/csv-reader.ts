/**
 * CAN CSV reader.
 * Supports:
 *  1) python-can CSVWriter format (timestamp,arbitration_id,extended,remote,error,dlc,data base64)
 *  2) Common engineering exports with Time / ID / Data / Channel columns
 */

import { type CanFrame, LogParseError } from '@/lib/can/types';

export class CsvParseError extends LogParseError {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';' || ch === '\t') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, '');
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function parseHexData(raw: string): Uint8Array {
  const s = raw.trim().replace(/^0x/i, '');
  if (!s) return new Uint8Array(0);
  // "01 02 03" or "010203" or "01-02-03"
  if (/[\s-]/.test(s)) {
    const parts = s.split(/[\s-]+/).filter(Boolean);
    return new Uint8Array(parts.map((p) => parseInt(p, 16)));
  }
  const hex = s.replace(/^0x/i, '');
  const bytes: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
}

function parseArbId(raw: string): { id: number; extendedHint?: boolean } {
  const t = raw.trim();
  if (/^0x/i.test(t) || /[a-f]/i.test(t)) {
    const id = parseInt(t, 16);
    return { id, extendedHint: id > 0x7ff };
  }
  if (/x$/i.test(t)) {
    return { id: parseInt(t.slice(0, -1), 16), extendedHint: true };
  }
  const id = Number(t);
  return { id, extendedHint: id > 0x7ff };
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, '_');
}

type ColMap = {
  time?: number;
  id?: number;
  data?: number;
  channel?: number;
  extended?: number;
  remote?: number;
  error?: number;
  dlc?: number;
  fd?: number;
  brs?: number;
  esi?: number;
};

function mapHeaders(headers: string[]): ColMap | 'python-can' | null {
  const norm = headers.map(normalizeHeader);
  if (
    norm[0] === 'timestamp' &&
    norm[1] === 'arbitration_id' &&
    norm.includes('extended') &&
    norm.includes('data')
  ) {
    return 'python-can';
  }

  const find = (...names: string[]) => {
    for (const n of names) {
      const i = norm.indexOf(n);
      if (i >= 0) return i;
    }
    return undefined;
  };

  const time = find(
    'timestamp',
    'time',
    'time_s',
    'times',
    't',
    'abstime',
    'reltime',
    'time_stamp'
  );
  const id = find('arbitration_id', 'can_id', 'canid', 'id', 'msgid', 'message_id', 'frame_id');
  const data = find('data', 'data_bytes', 'databbytes', 'payload', 'data_hex', 'bytes');
  if (time == null || id == null || data == null) return null;

  return {
    time,
    id,
    data,
    channel: find('channel', 'bus', 'buschannel', 'canoe_channel', 'ch'),
    extended: find('extended', 'ide', 'is_extended', 'ext'),
    remote: find('remote', 'rtr', 'is_remote'),
    error: find('error', 'is_error', 'err'),
    dlc: find('dlc', 'data_length', 'len', 'length'),
    fd: find('fd', 'is_fd', 'edl', 'can_fd'),
    brs: find('brs', 'bitrate_switch'),
    esi: find('esi', 'error_state_indicator'),
  };
}

function* iteratePythonCanCsv(lines: string[]): Generator<CanFrame> {
  let any = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 7) continue;
    const [timestamp, arbitrationId, extended, remote, error, dlc, data] = cols;
    let payload: Uint8Array;
    try {
      payload = base64ToBytes(data ?? '');
    } catch {
      payload = parseHexData(data ?? '');
    }
    const { id, extendedHint } = parseArbId(arbitrationId ?? '0');
    any = true;
    yield {
      timestamp: Number(timestamp),
      channel: 1,
      arbitrationId: id & 0x1fffffff,
      isExtended: extended === '1' || Boolean(extendedHint),
      isRemote: remote === '1',
      isFd: payload.length > 8,
      isError: error === '1',
      data: payload.slice(0, Number(dlc) || payload.length),
    };
  }
  if (!any) throw new CsvParseError('No CAN frames found in CSV (python-can format)');
}

function flagAt(cols: string[], index: number | undefined): boolean {
  if (index == null) return false;
  const v = (cols[index] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'x' || v === 'ext';
}

function* iterateGenericCsv(lines: string[], map: ColMap): Generator<CanFrame> {
  let any = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const timeRaw = cols[map.time!] ?? '';
    const idRaw = cols[map.id!] ?? '';
    const dataRaw = cols[map.data!] ?? '';
    if (!timeRaw || !idRaw) continue;

    const timestamp = Number(timeRaw);
    if (!Number.isFinite(timestamp)) continue;

    const { id, extendedHint } = parseArbId(idRaw);
    let payload = parseHexData(dataRaw);
    if (map.dlc != null) {
      const dlc = Number(cols[map.dlc]);
      if (Number.isFinite(dlc) && dlc >= 0) payload = payload.slice(0, dlc);
    }

    let channel = 1;
    if (map.channel != null) {
      const ch = Number(cols[map.channel]);
      if (Number.isFinite(ch)) channel = ch >= 1 ? ch : ch + 1;
    }

    any = true;
    yield {
      timestamp,
      channel,
      arbitrationId: id & 0x1fffffff,
      isExtended: flagAt(cols, map.extended) || Boolean(extendedHint),
      isRemote: flagAt(cols, map.remote),
      isFd: flagAt(cols, map.fd) || payload.length > 8,
      isBrs: flagAt(cols, map.brs),
      isEsi: flagAt(cols, map.esi),
      isError: flagAt(cols, map.error),
      data: payload,
    };
  }
  if (!any) throw new CsvParseError('No CAN frames found in CSV');
}

export function* iterateCsvFrames(buffer: ArrayBuffer): Generator<CanFrame> {
  const text = decodeText(buffer);
  const lines = text.split(/\r?\n/).filter((l, idx, arr) => {
    // keep empties out but preserve structure via filter of blank-only
    void idx;
    void arr;
    return true;
  });

  let start = 0;
  while (start < lines.length && !lines[start]!.trim()) start += 1;
  if (start >= lines.length) throw new CsvParseError('CSV file is empty');

  const headerLine = lines[start]!;
  const headers = parseCsvLine(headerLine);
  const mapped = mapHeaders(headers);
  if (!mapped) {
    throw new CsvParseError(
      'Unrecognized CSV header. Expected python-can columns or Time/ID/Data[/Channel].'
    );
  }

  const body = lines.slice(start + 1);
  if (mapped === 'python-can') {
    yield* iteratePythonCanCsv(body);
  } else {
    yield* iterateGenericCsv(body, mapped);
  }
}
