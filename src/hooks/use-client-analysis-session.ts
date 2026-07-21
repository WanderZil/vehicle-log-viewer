import { useSyncExternalStore } from 'react';

import {
  getClientSession,
  type ClientSessionSnapshot,
} from '@/modules/analyses/client-session';

export function useClientAnalysisSession(): ClientSessionSnapshot {
  const session = getClientSession();
  return useSyncExternalStore(
    (onStoreChange) => session.subscribe(onStoreChange),
    () => session.snapshot(),
    () => session.snapshot()
  );
}
