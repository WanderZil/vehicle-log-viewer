import { getClientSession, resetClientSession } from '@/modules/analyses/client-session';

export const WORKSPACE_STORAGE_KEY = 'blf-analysis-workspace-id';

export function clearWorkspaceId() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
  }
  resetClientSession();
}

/** Browser-only workspace — no server analysis row required. */
export async function ensureWorkspaceAnalysisId(): Promise<string> {
  const session = getClientSession();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(WORKSPACE_STORAGE_KEY, session.id);
  }
  return session.id;
}
