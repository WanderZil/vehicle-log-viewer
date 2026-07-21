import type {
  AnalysisProjectFile,
  WorkspaceLayoutSnapshot,
} from '@/lib/analysis-project';

type LayoutListener = () => void;

type WorkspaceOnlySnapshot = AnalysisProjectFile['workspace'];
type ViewerSnapshot = AnalysisProjectFile['viewer'];

let workspaceSnapshot: WorkspaceOnlySnapshot | null = null;
let viewerSnapshot: ViewerSnapshot = {
  tab: 'graph',
};
let pendingProject: AnalysisProjectFile | null = null;
const listeners = new Set<LayoutListener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeWorkspaceLayout(listener: LayoutListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWorkspaceLayoutSnapshot(): WorkspaceLayoutSnapshot | null {
  if (!workspaceSnapshot) return null;
  return {
    ...workspaceSnapshot,
    viewer: viewerSnapshot,
  };
}

export function setWorkspaceOnlySnapshot(snapshot: WorkspaceOnlySnapshot) {
  workspaceSnapshot = snapshot;
  emit();
}

export function setViewerLayoutSnapshot(snapshot: ViewerSnapshot) {
  viewerSnapshot = snapshot;
  emit();
}

export function patchViewerLayoutSnapshot(patch: Partial<ViewerSnapshot>) {
  viewerSnapshot = { ...viewerSnapshot, ...patch };
  emit();
}

export function setPendingProjectImport(project: AnalysisProjectFile | null) {
  pendingProject = project;
  emit();
}

export function getPendingProjectImport(): AnalysisProjectFile | null {
  return pendingProject;
}

export function consumePendingWorkspaceLayout(): AnalysisProjectFile['workspace'] | null {
  if (!pendingProject) return null;
  return pendingProject.workspace;
}

export function consumePendingViewerLayout(): AnalysisProjectFile['viewer'] | null {
  if (!pendingProject) return null;
  return pendingProject.viewer;
}

export function clearPendingProjectImport() {
  pendingProject = null;
  emit();
}
