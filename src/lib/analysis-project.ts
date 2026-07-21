import type { ChannelMapping } from '@/modules/analyses/mapping';
import type { DbcItem, SignalItem } from '@/modules/analyses/types';

export const PROJECT_VERSION = 1 as const;
export const PROJECT_MIME = 'application/json';
export const PROJECT_FILE_SUFFIX = '.blfproject.json';

export type ProjectViewMode = 'overlay' | 'stacked';
export type ProjectZoomMode = 'cursor' | 'box' | 'x' | 'y' | 'pan';
export type ProjectAnalyzeTab = 'graph' | 'trace';

export type ProjectYRange = { min: number; max: number };
export type ProjectViewWindow = { tMin: number; tMax: number };

/** Stable key: channel:messageName:signalName */
export type SignalKey = string;

export type AnalysisProjectFile = {
  version: typeof PROJECT_VERSION;
  app: 'vehicle-log-viewer';
  exportedAt: string;
  session: {
    name: string;
    logFileName: string | null;
    logFileSize: number | null;
    channelMapping: Record<string, string[]>;
    dbcFiles: Array<{ fileName: string; fileSize: number }>;
  };
  workspace: {
    addedSignalKeys: SignalKey[];
    visibleSignalKeys: SignalKey[];
    groups: Array<{
      id: string;
      name: string;
      signalKeys: SignalKey[];
      viewMode: ProjectViewMode;
    }>;
    viewMode: ProjectViewMode;
    zoomMode: ProjectZoomMode;
    viewWindow: ProjectViewWindow | null;
    yRanges: Record<SignalKey, ProjectYRange>;
    overlayYRange: ProjectYRange | null;
    mainCursorTime: number | null;
    diffOn: boolean;
    diffCursorTime: number | null;
  };
  viewer: {
    tab: ProjectAnalyzeTab;
  };
};

export type WorkspaceLayoutSnapshot = AnalysisProjectFile['workspace'] & {
  viewer: AnalysisProjectFile['viewer'];
};

export function signalKey(
  signal: Pick<SignalItem, 'channel' | 'messageName' | 'signalName'>
): SignalKey {
  return `${signal.channel}:${signal.messageName ?? ''}:${signal.signalName}`;
}

export function buildSignalKeyIndex(signals: SignalItem[]): Map<SignalKey, SignalItem> {
  const index = new Map<SignalKey, SignalItem>();
  for (const signal of signals) {
    index.set(signalKey(signal), signal);
  }
  return index;
}

export function channelMappingToFileNames(
  mapping: ChannelMapping,
  dbcItems: DbcItem[]
): Record<string, string[]> {
  const byId = new Map(dbcItems.map((d) => [d.id, d.fileName]));
  const out: Record<string, string[]> = {};
  for (const [channel, ids] of Object.entries(mapping)) {
    const names = ids
      .map((id) => byId.get(id))
      .filter((name): name is string => !!name);
    if (names.length) out[channel] = names;
  }
  return out;
}

export function channelMappingFromFileNames(
  mappingByFileName: Record<string, string[]>,
  dbcItems: DbcItem[]
): ChannelMapping {
  const byName = new Map<string, string>();
  for (const dbc of dbcItems) {
    if (!byName.has(dbc.fileName)) byName.set(dbc.fileName, dbc.id);
  }
  const out: ChannelMapping = {};
  for (const [channel, fileNames] of Object.entries(mappingByFileName)) {
    const ids = fileNames
      .map((name) => byName.get(name))
      .filter((id): id is string => !!id);
    if (ids.length) out[channel] = ids;
  }
  return out;
}

export function buildAnalysisProjectFile(input: {
  session: {
    name: string;
    logFileName: string | null;
    logFileSize: number | null;
    channelMapping: ChannelMapping;
    dbcItems: DbcItem[];
  };
  layout: WorkspaceLayoutSnapshot;
}): AnalysisProjectFile {
  return {
    version: PROJECT_VERSION,
    app: 'vehicle-log-viewer',
    exportedAt: new Date().toISOString(),
    session: {
      name: input.session.name,
      logFileName: input.session.logFileName,
      logFileSize: input.session.logFileSize,
      channelMapping: channelMappingToFileNames(
        input.session.channelMapping,
        input.session.dbcItems
      ),
      dbcFiles: input.session.dbcItems.map((d) => ({
        fileName: d.fileName,
        fileSize: d.fileSize,
      })),
    },
    workspace: {
      addedSignalKeys: input.layout.addedSignalKeys,
      visibleSignalKeys: input.layout.visibleSignalKeys,
      groups: input.layout.groups,
      viewMode: input.layout.viewMode,
      zoomMode: input.layout.zoomMode,
      viewWindow: input.layout.viewWindow,
      yRanges: input.layout.yRanges,
      overlayYRange: input.layout.overlayYRange,
      mainCursorTime: input.layout.mainCursorTime,
      diffOn: input.layout.diffOn,
      diffCursorTime: input.layout.diffCursorTime,
    },
    viewer: input.layout.viewer,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isYRange(value: unknown): value is ProjectYRange {
  return (
    isRecord(value) &&
    typeof value.min === 'number' &&
    Number.isFinite(value.min) &&
    typeof value.max === 'number' &&
    Number.isFinite(value.max)
  );
}

function isViewWindow(value: unknown): value is ProjectViewWindow {
  return (
    isRecord(value) &&
    typeof value.tMin === 'number' &&
    Number.isFinite(value.tMin) &&
    typeof value.tMax === 'number' &&
    Number.isFinite(value.tMax)
  );
}

export function parseAnalysisProjectFile(raw: unknown): AnalysisProjectFile {
  if (!isRecord(raw)) throw new Error('Invalid project file');
  if (raw.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${String(raw.version)}`);
  }
  const app = raw.app;
  if (app !== 'vehicle-log-viewer' && app !== 'blf-analyze-online') {
    throw new Error('Not a Vehicle Log Viewer project file');
  }
  if (!isRecord(raw.session) || !isRecord(raw.workspace) || !isRecord(raw.viewer)) {
    throw new Error('Invalid project file structure');
  }

  const session = raw.session;
  const workspace = raw.workspace;
  const viewer = raw.viewer;

  if (typeof session.name !== 'string') throw new Error('Invalid session name');
  if (
    session.logFileName !== null &&
    typeof session.logFileName !== 'string'
  ) {
    throw new Error('Invalid log file name');
  }
  if (
    session.logFileSize !== null &&
    (typeof session.logFileSize !== 'number' || !Number.isFinite(session.logFileSize))
  ) {
    throw new Error('Invalid log file size');
  }
  if (!isRecord(session.channelMapping)) throw new Error('Invalid channel mapping');
  for (const value of Object.values(session.channelMapping)) {
    if (!isStringArray(value)) throw new Error('Invalid channel mapping entry');
  }
  if (!Array.isArray(session.dbcFiles)) throw new Error('Invalid DBC file list');

  const viewMode = workspace.viewMode;
  if (viewMode !== 'overlay' && viewMode !== 'stacked') {
    throw new Error('Invalid view mode');
  }
  const zoomMode = workspace.zoomMode;
  if (!['cursor', 'box', 'x', 'y', 'pan'].includes(zoomMode as string)) {
    throw new Error('Invalid zoom mode');
  }
  if (workspace.viewWindow !== null && !isViewWindow(workspace.viewWindow)) {
    throw new Error('Invalid view window');
  }
  if (workspace.overlayYRange !== null && !isYRange(workspace.overlayYRange)) {
    throw new Error('Invalid overlay Y range');
  }

  const tab = viewer.tab;
  if (tab !== 'graph' && tab !== 'trace') throw new Error('Invalid viewer tab');

  return raw as AnalysisProjectFile;
}

export function projectFileNameFromSessionName(name: string): string {
  const base = name.trim() || 'analysis-project';
  const safe = base.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  return `${safe}${PROJECT_FILE_SUFFIX}`;
}

export function downloadProjectFile(project: AnalysisProjectFile) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: PROJECT_MIME,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = projectFileNameFromSessionName(project.session.name);
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file: File): Promise<AnalysisProjectFile> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Project file is not valid JSON');
  }
  return parseAnalysisProjectFile(parsed);
}

export type ProjectImportHints = {
  missingLog: boolean;
  logNameMismatch: boolean;
  missingDbcs: string[];
  mappingPartial: boolean;
  layoutPending: boolean;
};

export function collectImportHints(
  project: AnalysisProjectFile,
  state: {
    logFileName: string | null;
    dbcFileNames: string[];
    channelMapping: ChannelMapping;
  }
): ProjectImportHints {
  const expectedDbcs = project.session.dbcFiles.map((d) => d.fileName);
  const loadedSet = new Set(state.dbcFileNames);
  const missingDbcs = expectedDbcs.filter((name) => !loadedSet.has(name));

  const expectedMappingCount = Object.keys(project.session.channelMapping).length;
  const appliedMappingCount = Object.keys(state.channelMapping).length;

  return {
    missingLog: !state.logFileName && !!project.session.logFileName,
    logNameMismatch:
      !!state.logFileName &&
      !!project.session.logFileName &&
      state.logFileName !== project.session.logFileName,
    missingDbcs,
    mappingPartial: expectedMappingCount > 0 && appliedMappingCount < expectedMappingCount,
    layoutPending: project.workspace.addedSignalKeys.length > 0,
  };
}
