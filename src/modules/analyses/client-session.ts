import {
  annotateRawFramesWithDbcs,
  assertClientFileSize,
  buildChannelDbIndex,
  CLIENT_MAX_FILE_BYTES,
  decodeLogWithDbcs,
  decodeRowWithDbcs,
  diagnosticFrameToTraceRow,
  extractRawFramesFromLog,
  formatBytes,
  readDbcFileText,
  type ChannelMappingDraft,
  type ClientDbcFile,
  type ClientParseResult,
} from '@/lib/can/client-decode';
import {
  detectLogFormat,
  LOG_ACCEPT,
  stripLogExtension,
} from '@/lib/can/iterate-log';
import {
  channelMappingFromFileNames,
  type AnalysisProjectFile,
} from '@/lib/analysis-project';
import type { ChannelMapping } from '@/modules/analyses/mapping';
import type {
  CachedSignalMeta,
  DecodedSignalValue,
  ParseCatalog,
  RawFrameRow,
  TraceRow,
} from '@/modules/analyses/types';
import type { AnalysisItem, AnalysisStatus, DbcItem, SignalItem } from '@/modules/analyses/types';

export { CLIENT_MAX_FILE_BYTES, formatBytes, LOG_ACCEPT };

export type ClientSessionSnapshot = {
  id: string;
  name: string;
  status: AnalysisStatus;
  blfFileName: string | null;
  blfFileSize: number | null;
  channels: number[];
  channelMapping: ChannelMapping;
  errorMessage: string | null;
  catalog: ParseCatalog | null;
  dbcItems: DbcItem[];
  traceRows: TraceRow[];
  rawFrames: RawFrameRow[];
  /** 0–1 while status === 'parsing'; otherwise 0. */
  parseProgress: number;
};

type Listener = () => void;

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}`;
}

class ClientAnalysisSession {
  id = makeId();
  name = 'Local analysis';
  status: AnalysisStatus = 'created';
  blfFileName: string | null = null;
  blfFileSize: number | null = null;
  blfBuffer: ArrayBuffer | null = null;
  channels: number[] = [];
  channelMapping: ChannelMapping = {};
  errorMessage: string | null = null;
  dbcs = new Map<string, ClientDbcFile>();
  catalog: ParseCatalog | null = null;
  points = new Map<string, Array<[number, number]>>();
  traceRows: TraceRow[] = [];
  rawFrames: RawFrameRow[] = [];
  parseProgress = 0;
  private channelDbIndex: ReturnType<typeof buildChannelDbIndex> | null = null;
  private listeners = new Set<Listener>();
  private lastProgressEmitAt = 0;
  /** Stable for useSyncExternalStore — rebuilt only in emit(). */
  private cachedSnapshot: ClientSessionSnapshot = this.buildSnapshot();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.cachedSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  /** Cached reference; must be Object.is-stable until the next mutation. */
  snapshot(): ClientSessionSnapshot {
    return this.cachedSnapshot;
  }

  private buildSnapshot(): ClientSessionSnapshot {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      blfFileName: this.blfFileName,
      blfFileSize: this.blfFileSize,
      channels: [...this.channels],
      channelMapping: { ...this.channelMapping },
      errorMessage: this.errorMessage,
      catalog: this.catalog,
      parseProgress: this.parseProgress,
      dbcItems: [...this.dbcs.values()].map((d) => ({
        id: d.id,
        analysisId: this.id,
        fileName: d.fileName,
        fileSize: d.fileSize,
      })),
      // Keep array identity stable for large frame lists (avoid O(n) copy on every emit).
      traceRows: this.traceRows,
      rawFrames: this.rawFrames,
    };
  }

  asAnalysisItem(): AnalysisItem {
    const snap = this.snapshot();
    return {
      id: snap.id,
      name: snap.name,
      status: snap.status,
      blfFileName: snap.blfFileName,
      blfFileSize: snap.blfFileSize,
      channelMapping: snap.channelMapping,
      channels: JSON.stringify(snap.channels),
      errorMessage: snap.errorMessage,
    };
  }

  async loadBlf(file: File) {
    return this.loadLog(file);
  }

  async loadLog(file: File) {
    assertClientFileSize(file);
    const format = detectLogFormat(file.name);
    if (!format) {
      throw new Error(
        'Unsupported file type. Use .blf, .asc, .csv, .log (Vector ASCII / candump), or .mf4'
      );
    }
    const buffer = await file.arrayBuffer();
    const extracted = await extractRawFramesFromLog({
      buffer,
      fileName: file.name,
    });
    this.blfBuffer = buffer;
    this.blfFileName = file.name;
    this.blfFileSize = file.size;
    this.name = stripLogExtension(file.name);
    this.channels = extracted.channels;
    this.channelMapping = {};
    this.catalog = null;
    this.points.clear();
    this.traceRows = [];
    this.rawFrames = extracted.rawFrames;
    this.errorMessage = null;
    this.channelDbIndex = null;
    this.status = 'uploaded';
    this.emit();
    return {
      channels: extracted.channels,
      messageCount: extracted.messageCount,
      truncated: extracted.truncated,
      format,
    };
  }

  clearBlf() {
    this.blfBuffer = null;
    this.blfFileName = null;
    this.blfFileSize = null;
    this.channels = [];
    this.channelMapping = {};
    this.catalog = null;
    this.points.clear();
    this.traceRows = [];
    this.rawFrames = [];
    this.status = 'created';
    this.errorMessage = null;
    this.channelDbIndex = null;
    this.emit();
  }

  async addDbc(file: File) {
    const text = await readDbcFileText(file);
    const id = makeId();
    this.dbcs.set(id, {
      id,
      fileName: file.name,
      fileSize: file.size,
      text,
    });
    this.channelDbIndex = null;
    this.emit();
    return id;
  }

  removeDbc(dbcId: string) {
    this.dbcs.delete(dbcId);
    const next: ChannelMapping = {};
    for (const [ch, ids] of Object.entries(this.channelMapping)) {
      const filtered = ids.filter((id) => id !== dbcId);
      if (filtered.length) next[ch] = filtered;
    }
    this.channelMapping = next;
    this.channelDbIndex = null;
    this.emit();
  }

  setChannelMapping(mapping: ChannelMappingDraft | ChannelMapping) {
    this.channelMapping = { ...mapping };
    this.channelDbIndex = null;
    this.emit();
  }

  /** Restore session fields from an imported project (layout applied separately). */
  applyProjectSession(project: AnalysisProjectFile['session']) {
    this.name = project.name.trim() || this.name;
    const dbcItems = [...this.dbcs.values()].map((d) => ({
      id: d.id,
      analysisId: this.id,
      fileName: d.fileName,
      fileSize: d.fileSize,
    }));
    this.channelMapping = channelMappingFromFileNames(project.channelMapping, dbcItems);
    this.channelDbIndex = null;
    this.emit();
  }

  async parse(mapping?: ChannelMappingDraft) {
    if (!this.blfBuffer || !this.blfFileName) {
      throw new Error('Upload a CAN log file first (.blf / .asc / .csv / .log / .mf4)');
    }
    if (mapping) this.channelMapping = { ...mapping };

    const dbcsById: Record<string, ClientDbcFile> = {};
    for (const [id, file] of this.dbcs) dbcsById[id] = file;

    this.status = 'parsing';
    this.errorMessage = null;
    this.parseProgress = 0;
    this.lastProgressEmitAt = 0;
    this.emit();

    try {
      // Double rAF + timeout: paint overlay and start CSS spin before decode.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setTimeout(resolve, 40));
        });
      });

      const result: ClientParseResult = await decodeLogWithDbcs({
        buffer: this.blfBuffer,
        fileName: this.blfFileName,
        channelMapping: this.channelMapping,
        dbcsById,
        includeDiagnostics: true,
        // Prefer annotating frames from upload so Trace stays available and rowIds stay stable.
        includeRawFrames: this.rawFrames.length === 0,
        onProgress: (ratio) => {
          this.parseProgress = ratio;
          const now = Date.now();
          // Throttle React updates so we don't re-render every chunk.
          if (now - this.lastProgressEmitAt >= 120 || ratio >= 1) {
            this.lastProgressEmitAt = now;
            this.emit();
          }
        },
      });
      this.catalog = result.catalog;
      this.points = new Map(Object.entries(result.points));
      const diagnostics = result.diagnostics ?? [];
      const t0 = diagnostics[0]?.timestamp ?? 0;
      this.traceRows = diagnostics.map((frame) => diagnosticFrameToTraceRow(frame, t0));
      this.rawFrames =
        this.rawFrames.length > 0
          ? annotateRawFramesWithDbcs(this.rawFrames, this.channelMapping, dbcsById)
          : (result.rawFrames ?? []);
      this.channelDbIndex = buildChannelDbIndex(this.channelMapping, dbcsById);
      this.parseProgress = 1;
      this.status = 'ready';
      this.emit();
      return result;
    } catch (error) {
      this.status = 'failed';
      this.parseProgress = 0;
      this.errorMessage =
        error instanceof Error ? error.message : 'Parse failed';
      this.emit();
      throw error;
    }
  }

  listSignals(search?: string, page = 1, pageSize = 100) {
    const all = this.catalog?.signals ?? [];
    let items = all;
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      items = all.filter(
        (s) =>
          s.signalName.toLowerCase().includes(q) ||
          (s.messageName?.toLowerCase().includes(q) ?? false) ||
          (s.description?.toLowerCase().includes(q) ?? false) ||
          (s.unit?.toLowerCase().includes(q) ?? false)
      );
    }
    const sorted = [...items].sort(
      (a, b) => b.pointCount - a.pointCount || a.signalName.localeCompare(b.signalName)
    );
    const total = sorted.length;
    const offset = (page - 1) * pageSize;
    return {
      items: sorted.slice(offset, offset + pageSize).map(metaToSignalItem),
      total,
    };
  }

  getPoints(signalId: string): Array<[number, number]> {
    return this.points.get(signalId) ?? [];
  }

  getCatalogMeta(): CachedSignalMeta[] {
    return this.catalog?.signals ?? [];
  }

  getTraceRows() {
    return this.traceRows;
  }

  getRawFrames() {
    return this.rawFrames;
  }

  decodeFrame(row: RawFrameRow): { messageName: string; signals: DecodedSignalValue[] } | null {
    const dbcsById: Record<string, ClientDbcFile> = {};
    for (const [id, file] of this.dbcs) dbcsById[id] = file;
    // Rebuild when missing; otherwise reuse parse-time index.
    if (!this.channelDbIndex) {
      this.channelDbIndex = buildChannelDbIndex(this.channelMapping, dbcsById);
    }
    return decodeRowWithDbcs({ row, channelDbs: this.channelDbIndex });
  }
}

function metaToSignalItem(meta: CachedSignalMeta): SignalItem {
  return {
    id: meta.id,
    signalName: meta.signalName,
    messageName: meta.messageName,
    unit: meta.unit,
    description: meta.description,
    choices: meta.choices,
    pointCount: meta.pointCount,
    channel: meta.channel,
  };
}

const globalKey = '__blf_client_analysis_session__';

export function getClientSession(): ClientAnalysisSession {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: ClientAnalysisSession;
  };
  if (!g[globalKey]) g[globalKey] = new ClientAnalysisSession();
  return g[globalKey]!;
}

export function resetClientSession() {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: ClientAnalysisSession;
  };
  g[globalKey] = new ClientAnalysisSession();
  return g[globalKey]!;
}
