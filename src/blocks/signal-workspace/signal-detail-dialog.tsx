import type { SignalItem } from '@/modules/analyses/types';
import { m } from '@/paraglide/messages.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { parseSignalChoices } from './use-signal-workspace';

export function SignalDetailDialog({
  signal,
  color,
  open,
  onOpenChange,
}: {
  signal: SignalItem | null;
  color: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!signal) return null;

  const choices = parseSignalChoices(signal);
  const choiceEntries = choices ? Object.entries(choices).sort(([a], [b]) => Number(a) - Number(b)) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span
              className="size-3 shrink-0 rounded-sm border"
              style={{ backgroundColor: color, borderColor: color }}
              aria-hidden
            />
            <span className="truncate">{signal.signalName}</span>
          </DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{m['analyses.col_signal']()}</dt>
          <dd className="font-mono text-xs break-all">{signal.signalName}</dd>

          <dt className="text-muted-foreground">{m['analyses.col_message']()}</dt>
          <dd className="font-mono text-xs break-all">{signal.messageName || '—'}</dd>

          <dt className="text-muted-foreground">{m['analyses.signal_detail_channel']()}</dt>
          <dd className="font-mono text-xs">{signal.channel ?? '—'}</dd>

          <dt className="text-muted-foreground">{m['analyses.col_unit']()}</dt>
          <dd className="text-xs">{signal.unit || '—'}</dd>

          <dt className="text-muted-foreground">{m['analyses.col_description']()}</dt>
          <dd className="text-xs break-words">{signal.description || '—'}</dd>

          <dt className="text-muted-foreground">{m['analyses.signal_detail_points']()}</dt>
          <dd className="font-mono text-xs tabular-nums">
            {signal.pointCount != null ? signal.pointCount.toLocaleString() : '—'}
          </dd>

          <dt className="text-muted-foreground">{m['analyses.signal_detail_color']()}</dt>
          <dd className="flex items-center gap-2 font-mono text-xs">
            <span
              className="size-3 rounded-sm border"
              style={{ backgroundColor: color, borderColor: color }}
            />
            {color}
          </dd>
        </dl>

        {choiceEntries.length > 0 && (
          <div className="border-border/60 border-t pt-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium">
              {m['analyses.signal_detail_choices']()}
            </p>
            <div className="max-h-40 overflow-y-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">{m['analyses.col_hex']()}</th>
                    <th className="px-2 py-1 text-left font-medium">{m['analyses.signal_detail_label']()}</th>
                  </tr>
                </thead>
                <tbody>
                  {choiceEntries.map(([value, label]) => (
                    <tr key={value} className="border-border/40 border-t">
                      <td className="px-2 py-1 font-mono tabular-nums">{value}</td>
                      <td className="px-2 py-1">{label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
