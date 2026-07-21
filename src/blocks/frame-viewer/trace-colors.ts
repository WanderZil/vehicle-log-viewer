/** Shared semantic colors for Trace table + detail panel. */

export function channelTone(channel: number): string {
  const tones = [
    'text-sky-600 dark:text-sky-400',
    'text-violet-600 dark:text-violet-400',
    'text-teal-600 dark:text-teal-400',
    'text-rose-600 dark:text-rose-400',
    'text-indigo-600 dark:text-indigo-400',
    'text-fuchsia-600 dark:text-fuchsia-400',
  ];
  return tones[Math.abs(channel) % tones.length]!;
}

export function channelBadgeClass(channel: number): string {
  const tones = [
    'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    'border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    'border-teal-500/35 bg-teal-500/10 text-teal-700 dark:text-teal-300',
    'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    'border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    'border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  ];
  return tones[Math.abs(channel) % tones.length]!;
}

export const TRACE = {
  time: 'text-teal-700/80 dark:text-teal-400/90',
  id: 'text-sky-700 dark:text-sky-300',
  node: 'text-amber-700 dark:text-amber-400',
  frame: 'text-amber-600 dark:text-amber-400',
  data: 'text-violet-700/85 dark:text-violet-300/90',
  dlc: 'text-foreground/80',
  rx: 'text-emerald-700 dark:text-emerald-400',
  tx: 'text-sky-700 dark:text-sky-400',
  rxBadge:
    'border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  txBadge: 'border-sky-500/40 bg-sky-500/12 text-sky-700 dark:text-sky-300',
  fdBadge: 'border-amber-500/40 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  brsBadge:
    'border-orange-500/40 bg-orange-500/12 text-orange-700 dark:text-orange-300',
  esiBadge:
    'border-rose-500/40 bg-rose-500/12 text-rose-700 dark:text-rose-300',
  errBadge:
    'border-destructive/40 bg-destructive/10 text-destructive',
  canBadge: 'border-border bg-muted/60 text-muted-foreground',
  enum: 'text-amber-700 dark:text-amber-400',
  value: 'text-sky-700 dark:text-sky-300',
  signal: 'text-foreground',
  hex: 'text-violet-700 dark:text-violet-300',
  section: 'text-primary',
} as const;
