import type { RawFrameRow } from '@/modules/analyses/types';

export type FrameFilterState = {
  idQuery: string;
  channel: string;
  type: 'all' | 'CAN' | 'CAN FD' | 'ERR';
  dataQuery: string;
  /** Seconds relative to log start; empty = data min */
  timeFromSec: string;
  /** Seconds relative to log start; empty = data max */
  timeToSec: string;
};

export type FrameTimeDomain = {
  minUs: number;
  maxUs: number;
};

export function getFrameTimeDomain(rows: RawFrameRow[]): FrameTimeDomain | null {
  if (rows.length === 0) return null;
  let minUs = rows[0]!.timeUs;
  let maxUs = rows[0]!.timeUs;
  for (let i = 1; i < rows.length; i += 1) {
    const t = rows[i]!.timeUs;
    if (t < minUs) minUs = t;
    if (t > maxUs) maxUs = t;
  }
  return { minUs, maxUs };
}

function parseTimeBoundSec(raw: string, fallbackUs: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallbackUs;
  const sec = Number(trimmed);
  if (!Number.isFinite(sec)) return fallbackUs;
  return Math.round(sec * 1_000_000);
}

export function resolveTimeFilterUs(
  filter: Pick<FrameFilterState, 'timeFromSec' | 'timeToSec'>,
  domain: FrameTimeDomain
): { fromUs: number; toUs: number } {
  let fromUs = parseTimeBoundSec(filter.timeFromSec, domain.minUs);
  let toUs = parseTimeBoundSec(filter.timeToSec, domain.maxUs);
  fromUs = Math.min(Math.max(fromUs, domain.minUs), domain.maxUs);
  toUs = Math.min(Math.max(toUs, domain.minUs), domain.maxUs);
  if (fromUs > toUs) {
    const tmp = fromUs;
    fromUs = toUs;
    toUs = tmp;
  }
  return { fromUs, toUs };
}

export type FrameSearchState = {
  idQuery: string;
  dataQuery: string;
};

function normalizeHex(input: string): string {
  return input.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '').toUpperCase();
}

function parseByteNeedle(input: string): number[] {
  const normalized = normalizeHex(input);
  if (normalized.length < 2) return [];
  const out: number[] = [];
  for (let i = 0; i + 1 < normalized.length; i += 2) {
    out.push(Number.parseInt(normalized.slice(i, i + 2), 16));
  }
  return out.filter((n) => Number.isFinite(n));
}

function includesBytes(haystack: number[], needle: number[]): boolean {
  if (needle.length === 0) return true;
  if (needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function applyFrameFilters(rows: RawFrameRow[], filter: FrameFilterState): RawFrameRow[] {
  const idSegs = filter.idQuery
    .split(',')
    .map((s) => normalizeHex(s.trim()))
    .filter(Boolean);
  const channelNum = Number(filter.channel);
  const hasChannelFilter = Number.isFinite(channelNum);
  const needle = parseByteNeedle(filter.dataQuery);
  const domain = getFrameTimeDomain(rows);
  const timeRange = domain ? resolveTimeFilterUs(filter, domain) : null;

  return rows.filter((row) => {
    if (filter.type !== 'all' && row.type !== filter.type) return false;
    if (hasChannelFilter && row.channel !== channelNum) return false;
    if (idSegs.length > 0) {
      const idHex = row.arbitrationId.toString(16).toUpperCase();
      if (!idSegs.some((seg) => idHex.includes(seg))) return false;
    }
    if (!includesBytes(row.dataBytes, needle)) return false;
    if (timeRange && (row.timeUs < timeRange.fromUs || row.timeUs > timeRange.toUs)) {
      return false;
    }
    return true;
  });
}

export function buildSearchMatches(
  rows: RawFrameRow[],
  search: FrameSearchState
): number[] {
  const idNeedle = normalizeHex(search.idQuery);
  const byteNeedle = parseByteNeedle(search.dataQuery);
  if (!idNeedle && byteNeedle.length === 0) return [];

  const matches: number[] = [];
  rows.forEach((row, index) => {
    const idMatched =
      !idNeedle || row.arbitrationId.toString(16).toUpperCase().includes(idNeedle);
    const bytesMatched = includesBytes(row.dataBytes, byteNeedle);
    if (idMatched && bytesMatched) matches.push(index);
  });
  return matches;
}
