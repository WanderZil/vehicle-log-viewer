import { Spinner } from '@/components/ui/spinner';
import { useClientAnalysisSession } from '@/hooks/use-client-analysis-session';
import { m } from '@/paraglide/messages.js';

export function ParsingOverlay() {
  const snap = useClientAnalysisSession();
  const progress =
    snap.status === 'parsing'
      ? Math.min(1, Math.max(0, snap.parseProgress ?? 0))
      : 0;
  const pct = Math.round(progress * 100);

  return (
    <div
      className="bg-background/75 fixed inset-0 z-100 flex items-center justify-center backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={m['analyses.auto_parsing']()}
    >
      <div className="bg-card border-border mx-4 w-full max-w-sm rounded-md border p-5 shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <Spinner className="text-primary size-5" aria-hidden />
          <p className="text-sm font-medium">{m['analyses.auto_parsing']()}</p>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {m['analyses.parse_wait_hint']()}
        </p>
        <div className="bg-muted mt-4 h-1 w-full overflow-hidden rounded-sm">
          <div
            className="bg-primary h-full transition-[width] duration-150 ease-out"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
        <p className="text-muted-foreground mt-2 font-mono text-[11px] tabular-nums">
          {pct}%
        </p>
      </div>
    </div>
  );
}
