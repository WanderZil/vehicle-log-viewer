import type { SignalItem } from '@/modules/analyses/types';

import type { SignalGroup } from './use-signal-workspace';

export type SignalTableRow =
  | { kind: 'group'; id: string; group: SignalGroup; groupIndex: number }
  | { kind: 'signal'; id: string; sig: SignalItem; index: number; grouped: boolean };

export function buildSignalTableRows(
  added: SignalItem[],
  groups: SignalGroup[],
  groupedSignalIds: Set<string>
): SignalTableRow[] {
  const rows: SignalTableRow[] = [];
  const indexById = new Map(added.map((sig, index) => [sig.id, index]));

  for (const sig of added) {
    if (!groupedSignalIds.has(sig.id)) {
      const index = indexById.get(sig.id);
      if (index !== undefined) {
        rows.push({ kind: 'signal', id: sig.id, sig, index, grouped: false });
      }
    }
  }

  groups.forEach((group, groupIndex) => {
    rows.push({ kind: 'group', id: `group-${group.id}`, group, groupIndex });
    for (const id of group.signalIds) {
      const sig = added.find((item) => item.id === id);
      const index = indexById.get(id);
      if (sig !== undefined && index !== undefined) {
        rows.push({ kind: 'signal', id: sig.id, sig, index, grouped: true });
      }
    }
  });

  return rows;
}
