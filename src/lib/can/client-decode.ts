import { Dbc } from 'candied';
import type { DbcData, Message, Signal } from 'candied/lib/dbc/Dbc';

import { iterateFramesFromFileName } from '@/lib/can/iterate-log';
import type { CanFrame } from '@/lib/can/types';
import type {
  CachedSignalMeta,
  DecodedSignalValue,
  ParseCatalog,
  RawFrameRow,
  TraceRow,
} from '@/modules/analyses/types';

export type DiagnosticFrame = {
  timestamp: number;
  channel: number;
  arbitrationId: number;
  isExtended: boolean;
  isRemote: boolean;
  isFd: boolean;
  isBrs: boolean;
  isEsi: boolean;
  isError: boolean;
  data: Uint8Array;
};

function toHexData(data: Uint8Array): string {
  if (data.length === 0) return '';
  return Array.from(data)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export function diagnosticFrameToTraceRow(frame: DiagnosticFrame, t0: number): TraceRow {
  const timeUs = Math.max(0, Math.round((frame.timestamp - t0) * 1_000_000));
  return {
    timeUs,
    channel: frame.channel,
    arbitrationId: frame.arbitrationId,
    type: frame.isError ? 'ERR' : frame.isFd ? 'CAN FD' : 'CAN',
    dir: 'Rx',
    dlc: frame.data.length,
    data: toHexData(frame.data),
  };
}

/** Hard cap for browser memory — BLF files larger than this are rejected. */
export const CLIENT_MAX_FILE_BYTES = 150 * 1024 * 1024; // 150 MiB

export const CLIENT_MAX_POINTS_PER_SIGNAL = 50_000;
export const CLIENT_MAX_TRACE_ROWS = 10_000;
export const CLIENT_MAX_RAW_FRAME_ROWS = 120_000;

const CJK_RE = /[\u4e00-\u9fff]/;

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertClientFileSize(file: File | Blob) {
  if (file.size > CLIENT_MAX_FILE_BYTES) {
    throw new Error(
      `File is too large (${formatBytes(file.size)}). Browser parse supports up to ${formatBytes(CLIENT_MAX_FILE_BYTES)}.`
    );
  }
}

/**
 * OEM DBC files in China are often GBK/GB18030. `File.text()` always uses UTF-8
 * and produces mojibake for CM_/VAL_ strings — match Python's encoding sniff.
 */
export function decodeDbcBytes(bytes: Uint8Array): string {
  type Candidate = { text: string; score: number; replacements: number };
  const candidates: Candidate[] = [];

  const tryDecode = (encoding: string, fatal: boolean) => {
    try {
      const text = new TextDecoder(encoding, { fatal }).decode(bytes);
      let score = 0;
      for (const m of text.matchAll(/CM_\s+SG_[^;]*;/g)) {
        if (CJK_RE.test(m[0])) score += 1;
      }
      for (const m of text.matchAll(/VAL_\s+\d+\s+\w+\s+[^;]*;/g)) {
        if (CJK_RE.test(m[0])) score += 1;
      }
      const replacements = (text.match(/\uFFFD/g) ?? []).length;
      candidates.push({ text, score, replacements });
    } catch {
      // unsupported encoding or fatal decode failure
    }
  };

  tryDecode('utf-8', true);
  tryDecode('utf-8', false);
  tryDecode('gb18030', false);
  tryDecode('gbk', false);
  tryDecode('latin1', false);

  if (candidates.length === 0) {
    return new TextDecoder('latin1').decode(bytes);
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.replacements - b.replacements;
  });
  return candidates[0].text;
}

export async function readDbcFileText(file: File): Promise<string> {
  assertClientFileSize(file);
  const buf = new Uint8Array(await file.arrayBuffer());
  return decodeDbcBytes(buf);
}

function signalId(channel: number, messageName: string, signalName: string) {
  const key = `${channel}:${messageName}:${signalName}`;
  // FNV-1a 32-bit → 8 hex chars (stable, sync, good enough for local catalog ids)
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function downsample(
  points: Array<[number, number]>,
  maxPoints: number
): Array<[number, number]> {
  if (maxPoints <= 0 || points.length <= maxPoints) return points;
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  const sampled = points.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }
  return sampled;
}

function signalDescription(sig: Signal): string | null {
  const comment =
    (typeof sig.description === 'string' && sig.description) ||
    (typeof (sig as { comment?: string }).comment === 'string' &&
      (sig as { comment?: string }).comment);
  if (comment && String(comment).trim()) return String(comment).trim();
  return null;
}

function signalChoices(sig: Signal): Record<string, string> | null {
  const table = sig.valueTable;
  if (!table || !(table instanceof Map) || table.size === 0) return null;
  const out: Record<string, string> = {};
  for (const [key, label] of table.entries()) {
    const text = String(label).trim();
    if (text) out[String(key)] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * candied peg grammar rejects scientific-notation factors/offsets in SG_ lines
 * (e.g. `6.1035125E-005`), which drops HeadingAg / curvature — lanes never resolve.
 * Expand E-notation only on SG_ definition lines.
 */
function normalizeDbcScientificNotation(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!/^\s*SG_\s/.test(line)) return line;
      return line.replace(
        /([+-]?(?:\d+\.\d*|\d*\.\d+|\d+))[eE]([+-]?\d+)/g,
        (_match, base: string, exp: string) => {
          const n = Number(`${base}e${exp}`);
          if (!Number.isFinite(n)) return `${base}e${exp}`;
          let s = n.toFixed(16);
          if (s.includes('.')) {
            s = s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
          }
          if (s === '-0') return '0';
          return s;
        }
      );
    })
    .join('\n');
}

/**
 * candied peg grammar only matches a single DLC digit (`[0-9]`), so CAN FD
 * lengths 12/16/20/24/32/48/64 are truncated (24 → 2). Patch from the source
 * BO_ lines after load.
 */
function patchMessageDlcsFromSource(data: DbcData, source: string) {
  for (const line of source.split(/\r?\n/)) {
    const m = /^\s*BO_\s+(\d+)\s+\S+\s*:\s*(\d+)\s+/.exec(line);
    if (!m) continue;
    const id = Number(m[1]);
    const dlc = Number(m[2]);
    if (!Number.isFinite(id) || !Number.isFinite(dlc)) continue;
    for (const msg of data.messages.values()) {
      if (msg.id === id) {
        msg.dlc = dlc;
        break;
      }
    }
  }
}

export function formatCycleTimeMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '-';
  if (ms >= 1000) {
    const sec = ms / 1000;
    return Number.isInteger(sec) ? `${sec} s` : `${sec.toFixed(3).replace(/\.?0+$/, '')} s`;
  }
  return Number.isInteger(ms) ? `${ms} ms` : `${ms.toFixed(3).replace(/\.?0+$/, '')} ms`;
}

export function loadDbcText(text: string): DbcData {
  const normalized = normalizeDbcScientificNotation(text);
  const dbc = new Dbc();
  const data = dbc.load(normalized);
  patchMessageDlcsFromSource(data, normalized);
  return data;
}

type ChannelDb = { data: DbcData; messagesById: Map<number, Message> };

function buildChannelDb(text: string): ChannelDb {
  const data = loadDbcText(text);
  const messagesById = new Map<number, Message>();
  for (const msg of data.messages.values()) {
    messagesById.set(msg.id, msg);
    // DBC extended IDs often set bit 31; BLF arbitrationId is the 29-bit value.
    const bareId = msg.id & 0x1fffffff;
    if (!messagesById.has(bareId)) messagesById.set(bareId, msg);
  }
  return { data, messagesById };
}

export function buildChannelDbIndex(
  channelMapping: ChannelMappingDraft,
  dbcsById: Record<string, ClientDbcFile>
): Map<number, ChannelDb[]> {
  const channelDbs = new Map<number, ChannelDb[]>();
  for (const [chStr, dbcIds] of Object.entries(channelMapping)) {
    const ch = Number(chStr);
    if (!Number.isFinite(ch) || !dbcIds?.length) continue;
    const list: ChannelDb[] = [];
    for (const id of dbcIds) {
      const file = dbcsById[id];
      if (!file) continue;
      list.push(buildChannelDb(file.text));
    }
    if (list.length) channelDbs.set(ch, list);
  }
  return channelDbs;
}

/** DBC Motorola start bit → network bit (MSB of byte0 = 0). Matches cantools. */
function motorolaStartToNetworkBit(start: number): number {
  return 8 * Math.floor(start / 8) + (7 - (start % 8));
}

/**
 * Extract raw integer matching cantools/bitstruct — candied's Motorola path is wrong.
 */
function extractRawSignal(
  data: Uint8Array,
  start: number,
  length: number,
  endian: 'Motorola' | 'Intel',
  signed: boolean
): number | null {
  if (length <= 0 || length > 64) return null;

  let raw = 0n;
  if (endian === 'Intel') {
    for (let i = 0; i < length; i += 1) {
      const bit = start + i;
      const byteIndex = Math.floor(bit / 8);
      const shift = bit % 8;
      if (byteIndex >= data.length) return null;
      if ((data[byteIndex]! >> shift) & 1) {
        raw |= 1n << BigInt(i);
      }
    }
  } else {
    const networkStart = motorolaStartToNetworkBit(start);
    for (let i = 0; i < length; i += 1) {
      const bit = networkStart + i;
      const byteIndex = Math.floor(bit / 8);
      const shift = 7 - (bit % 8);
      if (byteIndex >= data.length) return null;
      if ((data[byteIndex]! >> shift) & 1) {
        raw |= 1n << BigInt(length - 1 - i);
      }
    }
  }

  if (signed && length < 64) {
    const signBit = 1n << BigInt(length - 1);
    if (raw & signBit) {
      raw -= 1n << BigInt(length);
    }
  }

  return Number(raw);
}

function decodeSignalValue(data: Uint8Array, signal: Signal): number | null {
  const endian = signal.endian === 'Intel' ? 'Intel' : 'Motorola';
  const raw = extractRawSignal(
    data,
    signal.startBit,
    signal.length,
    endian,
    Boolean(signal.signed)
  );
  if (raw === null || !Number.isFinite(raw)) return null;
  const factor = typeof signal.factor === 'number' ? signal.factor : 1;
  const offset = typeof signal.offset === 'number' ? signal.offset : 0;
  return raw * factor + offset;
}

/** Multiplex child selector from DBC `mN` field; null = always active. */
function multiplexSelector(signal: Signal): number | null {
  if (!signal.multiplex) return null;
  const match = /^m(\d+)$/i.exec(signal.multiplex.trim());
  return match ? Number(match[1]) : null;
}

function decodeFrame(
  message: Message,
  data: Uint8Array
): Map<string, number> | undefined {
  const need = Math.max(message.dlc || 0, data.length);
  if (need <= 0) return undefined;
  const payload =
    data.length >= need
      ? data
      : (() => {
          const out = new Uint8Array(need);
          out.set(data);
          return out;
        })();

  let muxValue: number | null = null;
  for (const [, signal] of message.signals) {
    if (!signal.multiplexer) continue;
    const raw = decodeSignalValue(payload, signal);
    if (raw !== null && Number.isFinite(raw)) muxValue = Math.round(raw);
    break;
  }

  const values = new Map<string, number>();
  for (const [name, signal] of message.signals) {
    const sel = multiplexSelector(signal);
    // Skip multiplex children that are not selected by the current mux ID.
    if (sel !== null && (muxValue === null || sel !== muxValue)) continue;
    const value = decodeSignalValue(payload, signal);
    if (value !== null && Number.isFinite(value)) values.set(name, value);
  }
  return values.size > 0 ? values : undefined;
}

export type ChannelMappingDraft = Record<string, string[]>;

export type ClientDbcFile = {
  id: string;
  fileName: string;
  fileSize: number;
  text: string;
};

export type ClientParseResult = {
  catalog: ParseCatalog;
  points: Record<string, Array<[number, number]>>;
  channels: number[];
  signalCount: number;
  messageCount: number;
  decodedMessages: number;
  diagnostics?: DiagnosticFrame[];
  rawFrames?: RawFrameRow[];
};

export function decodeRowWithDbcs(params: {
  row: RawFrameRow;
  channelDbs: Map<number, ChannelDb[]>;
}): { messageName: string; signals: DecodedSignalValue[] } | null {
  const dbs = params.channelDbs.get(params.row.channel);
  if (!dbs?.length || params.row.isRemote || params.row.isError) return null;
  const data = new Uint8Array(params.row.dataBytes);

  for (const db of dbs) {
    const message =
      db.messagesById.get(params.row.arbitrationId) ??
      (params.row.isExtended
        ? db.messagesById.get(params.row.arbitrationId | 0x80000000)
        : undefined);
    if (!message) continue;

    const need = Math.max(message.dlc || 0, data.length);
    const payload =
      data.length >= need
        ? data
        : (() => {
            const out = new Uint8Array(need);
            out.set(data);
            return out;
          })();

    const signals: DecodedSignalValue[] = [];
    let muxValue: number | null = null;
    for (const [, sig] of message.signals) {
      if (!sig.multiplexer) continue;
      const raw = decodeSignalValue(payload, sig);
      if (raw !== null && Number.isFinite(raw)) muxValue = Math.round(raw);
      break;
    }

    for (const [sigName, sig] of message.signals) {
      const choices = signalChoices(sig);
      const sel = multiplexSelector(sig);
      const inactive = sel !== null && (muxValue === null || sel !== muxValue);
      if (inactive) {
        signals.push({
          name: sigName,
          value: Number.NaN,
          unit: sig.unit ?? null,
          description: signalDescription(sig),
          choiceLabel: null,
        });
        continue;
      }

      const value = decodeSignalValue(payload, sig);
      if (value !== null && Number.isFinite(value)) {
        const rounded = Number.isInteger(value) ? value : Math.round(value * 1e6) / 1e6;
        const choiceLabel = choices?.[String(Math.round(value))] ?? null;
        signals.push({
          name: sigName,
          value: rounded,
          unit: sig.unit ?? null,
          description: signalDescription(sig),
          choiceLabel,
        });
      } else {
        signals.push({
          name: sigName,
          value: Number.NaN,
          unit: sig.unit ?? null,
          description: signalDescription(sig),
          choiceLabel: null,
        });
      }
    }
    return { messageName: message.name, signals };
  }
  return null;
}

/** DBC BO_ transmitter; Vector__XXX / empty means no real node. */
function resolveSendingNode(message: Message): string | null {
  const node = message.sendingNode?.trim();
  if (!node) return null;
  if (/^Vector__XXX$/i.test(node)) return null;
  return node;
}

function lookupMessageName(
  channelDbs: Map<number, ChannelDb[]>,
  channel: number,
  arbitrationId: number,
  isExtended: boolean,
  isRemote: boolean,
  isError: boolean
): { messageName: string | null; nodeName: string | null } {
  if (isRemote || isError) return { messageName: null, nodeName: null };
  const dbs = channelDbs.get(channel);
  if (!dbs?.length) return { messageName: null, nodeName: null };
  for (const db of dbs) {
    const matched =
      db.messagesById.get(arbitrationId) ??
      (isExtended ? db.messagesById.get(arbitrationId | 0x80000000) : undefined);
    if (!matched) continue;
    return { messageName: matched.name, nodeName: resolveSendingNode(matched) };
  }
  return { messageName: null, nodeName: null };
}

function frameToRawRow(
  frame: CanFrame,
  rowId: number,
  t0: number,
  names: { messageName: string | null; nodeName: string | null }
): RawFrameRow {
  return {
    rowId,
    timeUs: Math.max(0, Math.round((frame.timestamp - t0) * 1_000_000)),
    channel: frame.channel,
    arbitrationId: frame.arbitrationId,
    messageName: names.messageName,
    nodeName: names.nodeName,
    type: frame.isError ? 'ERR' : frame.isFd ? 'CAN FD' : 'CAN',
    dir: 'Rx',
    dlc: frame.data.length,
    data: toHexData(frame.data),
    dataBytes: Array.from(frame.data),
    isExtended: frame.isExtended,
    isRemote: frame.isRemote,
    isError: Boolean(frame.isError),
    isFd: frame.isFd,
    isBrs: Boolean(frame.isBrs),
    isEsi: Boolean(frame.isEsi),
  };
}

/** Yield to the event loop so loading UI (CSS spin) can paint during long decode. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Scan a log into Trace rows without DBC — Node/Frame stay empty until annotate/parse.
 */
export async function extractRawFramesFromLog(params: {
  buffer: ArrayBuffer;
  fileName: string;
  onProgress?: (ratio: number) => void;
}): Promise<{
  rawFrames: RawFrameRow[];
  channels: number[];
  messageCount: number;
  truncated: boolean;
}> {
  const yieldEvery = 8_000;
  const totalBytes = Math.max(1, params.buffer.byteLength);
  const counts = new Map<number, number>();
  // Keep absolute timestamps first — MF4 bus-logging groups are not globally
  // time-ordered, so the first yielded frame is not always the earliest.
  const pending: CanFrame[] = [];
  let messageCount = 0;
  let truncated = false;
  let lastProgressEmit = 0;

  params.onProgress?.(0.02);

  for (const frame of iterateFramesFromFileName(params.buffer, params.fileName)) {
    messageCount += 1;
    counts.set(frame.channel, (counts.get(frame.channel) ?? 0) + 1);

    if (pending.length < CLIENT_MAX_RAW_FRAME_ROWS) {
      pending.push(frame);
    } else {
      truncated = true;
    }

    if (messageCount % yieldEvery === 0) {
      const ratio = Math.min(0.95, 0.02 + (messageCount * 64) / (totalBytes + messageCount * 64));
      if (ratio - lastProgressEmit >= 0.01) {
        lastProgressEmit = ratio;
        params.onProgress?.(ratio);
      }
      await yieldToBrowser();
    }
  }

  let t0 = pending[0]?.timestamp ?? 0;
  for (const frame of pending) {
    if (frame.timestamp < t0) t0 = frame.timestamp;
  }
  const rawFrames = pending.map((frame, rowId) =>
    frameToRawRow(frame, rowId, t0, {
      messageName: null,
      nodeName: null,
    })
  );

  params.onProgress?.(1);

  return {
    rawFrames,
    channels: [...counts.keys()].sort((a, b) => a - b),
    messageCount,
    truncated: truncated || rawFrames.length >= CLIENT_MAX_RAW_FRAME_ROWS,
  };
}

/** @deprecated Use extractRawFramesFromLog */
export async function extractRawFramesFromBlf(params: {
  blf: ArrayBuffer;
  onProgress?: (ratio: number) => void;
}) {
  return extractRawFramesFromLog({
    buffer: params.blf,
    fileName: 'log.blf',
    onProgress: params.onProgress,
  });
}

/** Fill Node/Frame names on existing Trace rows using the current DBC mapping. */
export function annotateRawFramesWithDbcs(
  rows: RawFrameRow[],
  channelMapping: ChannelMappingDraft,
  dbcsById: Record<string, ClientDbcFile>
): RawFrameRow[] {
  const channelDbs = buildChannelDbIndex(channelMapping, dbcsById);
  if (channelDbs.size === 0) {
    return rows.map((row) =>
      row.messageName || row.nodeName
        ? { ...row, messageName: null, nodeName: null }
        : row
    );
  }

  return rows.map((row) => {
    const names = lookupMessageName(
      channelDbs,
      row.channel,
      row.arbitrationId,
      row.isExtended,
      row.isRemote,
      row.isError
    );
    if (row.messageName === names.messageName && row.nodeName === names.nodeName) {
      return row;
    }
    return { ...row, ...names };
  });
}

/**
 * Decode a CAN log against mapped DBCs. Async so the UI can keep animating —
 * yields every ~8k frames (approx.) instead of blocking the main thread solid.
 */
export async function decodeLogWithDbcs(params: {
  buffer: ArrayBuffer;
  fileName: string;
  channelMapping: ChannelMappingDraft;
  dbcsById: Record<string, ClientDbcFile>;
  maxPoints?: number;
  onProgress?: (ratio: number) => void;
  includeDiagnostics?: boolean;
  includeRawFrames?: boolean;
}): Promise<ClientParseResult> {
  const maxPoints = params.maxPoints ?? CLIENT_MAX_POINTS_PER_SIGNAL;
  const yieldEvery = 8_000;

  const channelDbs = buildChannelDbIndex(params.channelMapping, params.dbcsById);

  if (channelDbs.size === 0) {
    throw new Error('Assign at least one DBC to a channel before parsing');
  }

  const totalBytes = Math.max(1, params.buffer.byteLength);
  let lastProgressEmit = 0;

  const includeDiagnostics = params.includeDiagnostics ?? false;
  const includeRawFrames = params.includeRawFrames ?? false;
  const signalsMeta = new Map<string, CachedSignalMeta>();
  const signalPoints = new Map<string, Array<[number, number]>>();
  const diagnostics: DiagnosticFrame[] = [];
  const pendingRaw: CanFrame[] = [];
  const pendingRawNames: Array<{
    messageName: string | null;
    nodeName: string | null;
  }> = [];
  let messageCount = 0;
  let decodedMessages = 0;
  let t0: number | null = null;
  let durationUs = 0;
  let seen = 0;
  // Absolute-time points first — MF4 channel groups are not globally ordered.
  const pendingPoints: Array<{ sid: string; absTs: number; value: number }> = [];

  params.onProgress?.(0.02);

  for (const frame of iterateFramesFromFileName(params.buffer, params.fileName)) {
    seen += 1;

    if (seen % yieldEvery === 0) {
      // Prefer byte-offset proxy via frame count vs file size (stable UI).
      const ratio = Math.min(0.95, 0.02 + (seen * 64) / (totalBytes + seen * 64));
      if (ratio - lastProgressEmit >= 0.01) {
        lastProgressEmit = ratio;
        params.onProgress?.(ratio);
      }
      await yieldToBrowser();
    }

    if (includeDiagnostics && diagnostics.length < CLIENT_MAX_TRACE_ROWS) {
      diagnostics.push({
        timestamp: frame.timestamp,
        channel: frame.channel,
        arbitrationId: frame.arbitrationId,
        isExtended: frame.isExtended,
        isRemote: frame.isRemote,
        isFd: frame.isFd,
        isBrs: Boolean(frame.isBrs),
        isEsi: Boolean(frame.isEsi),
        isError: Boolean(frame.isError),
        data: frame.data,
      });
    }
    if (includeRawFrames && pendingRaw.length < CLIENT_MAX_RAW_FRAME_ROWS) {
      const names = lookupMessageName(
        channelDbs,
        frame.channel,
        frame.arbitrationId,
        frame.isExtended,
        frame.isRemote,
        Boolean(frame.isError)
      );
      pendingRaw.push(frame);
      pendingRawNames.push(names);
    }

    const dbs = channelDbs.get(frame.channel);
    if (!dbs?.length || frame.isRemote || frame.isError) continue;

    let values: Map<string, number> | undefined;
    let message: Message | undefined;
    for (const db of dbs) {
      message =
        db.messagesById.get(frame.arbitrationId) ??
        (frame.isExtended
          ? db.messagesById.get(frame.arbitrationId | 0x80000000)
          : undefined);
      if (!message) continue;
      values = decodeFrame(message, frame.data);
      if (values) break;
    }
    if (!values || !message) continue;

    messageCount += 1;
    if (t0 === null || frame.timestamp < t0) t0 = frame.timestamp;
    decodedMessages += 1;

    for (const [sigName, val] of values.entries()) {
      const sid = signalId(frame.channel, message.name, sigName);
      if (!signalsMeta.has(sid)) {
        const sig = message.signals.get(sigName);
        const entry: CachedSignalMeta = {
          id: sid,
          signalName: sigName,
          messageName: message.name,
          unit: sig?.unit || null,
          description: sig ? signalDescription(sig) : null,
          choices: sig ? signalChoices(sig) : null,
          channel: frame.channel,
          pointCount: 0,
        };
        signalsMeta.set(sid, entry);
        signalPoints.set(sid, []);
      }
      pendingPoints.push({
        sid,
        absTs: frame.timestamp,
        value: Math.round(val * 1e6) / 1e6,
      });
      const meta = signalsMeta.get(sid)!;
      meta.pointCount += 1;
    }
  }

  const baseTs = t0 ?? 0;
  for (const pt of pendingPoints) {
    const relUs = Math.round((pt.absTs - baseTs) * 1_000_000);
    if (relUs > durationUs) durationUs = relUs;
    signalPoints.get(pt.sid)!.push([relUs, pt.value]);
  }

  let t0Raw = pendingRaw[0]?.timestamp ?? baseTs;
  for (const frame of pendingRaw) {
    if (frame.timestamp < t0Raw) t0Raw = frame.timestamp;
  }
  const rawFrames = pendingRaw.map((frame, rowId) =>
    frameToRawRow(frame, rowId, t0Raw, pendingRawNames[rowId]!)
  );

  params.onProgress?.(0.97);
  await yieldToBrowser();

  const points: Record<string, Array<[number, number]>> = {};
  const catalogSignals: CachedSignalMeta[] = [];
  for (const meta of [...signalsMeta.values()].sort(
    (a, b) => b.pointCount - a.pointCount || a.signalName.localeCompare(b.signalName)
  )) {
    const pts = downsample(signalPoints.get(meta.id) ?? [], maxPoints);
    meta.pointCount = pts.length;
    points[meta.id] = pts;
    catalogSignals.push(meta);
  }

  params.onProgress?.(1);

  return {
    catalog: {
      signals: catalogSignals,
      messageCount,
      decodedMessages,
      durationUs,
      parsedAt: Date.now(),
    },
    points,
    channels: [...channelDbs.keys()].sort((a, b) => a - b),
    signalCount: catalogSignals.length,
    messageCount,
    decodedMessages,
    diagnostics: includeDiagnostics ? diagnostics : undefined,
    rawFrames: includeRawFrames ? rawFrames : undefined,
  };
}

/** @deprecated Use decodeLogWithDbcs */
export async function decodeBlfWithDbcs(params: {
  blf: ArrayBuffer;
  channelMapping: ChannelMappingDraft;
  dbcsById: Record<string, ClientDbcFile>;
  maxPoints?: number;
  onProgress?: (ratio: number) => void;
  includeDiagnostics?: boolean;
  includeRawFrames?: boolean;
}): Promise<ClientParseResult> {
  return decodeLogWithDbcs({
    buffer: params.blf,
    fileName: 'log.blf',
    channelMapping: params.channelMapping,
    dbcsById: params.dbcsById,
    maxPoints: params.maxPoints,
    onProgress: params.onProgress,
    includeDiagnostics: params.includeDiagnostics,
    includeRawFrames: params.includeRawFrames,
  });
}
