import { signalKey, type SignalKey } from '@/lib/analysis-project';
import type { CachedSignalMeta } from '@/modules/analyses/types';

export const CSV_EXPORT_MIME = 'text/csv;charset=utf-8';
export const CSV_EXPORT_MAX_ROWS = 2_000_000;

const CSV_HEADER = 'time_s,time_us,channel,message,signal,value,unit\n';

export type CsvExportScope = 'loaded' | 'all';

export type SignalCsvExportResult = {
  csv: string;
  signalCount: number;
  rowCount: number;
  scope: CsvExportScope;
};

function escapeCsvField(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatTimeSeconds(timeUs: number): string {
  return (timeUs / 1_000_000).toFixed(6);
}

export function buildSignalsCsv(
  catalog: CachedSignalMeta[],
  getPoints: (signalId: string) => Array<[number, number]>,
  options?: {
    signalKeys?: SignalKey[] | null;
    maxRows?: number;
  }
): SignalCsvExportResult {
  const maxRows = options?.maxRows ?? CSV_EXPORT_MAX_ROWS;
  const keyFilter =
    options?.signalKeys && options.signalKeys.length > 0
      ? new Set(options.signalKeys)
      : null;

  const signals = keyFilter
    ? catalog.filter((meta) => keyFilter.has(signalKey(meta)))
    : catalog;

  if (signals.length === 0) {
    return { csv: CSV_HEADER, signalCount: 0, rowCount: 0, scope: keyFilter ? 'loaded' : 'all' };
  }

  const chunks: string[] = [CSV_HEADER];
  let rowCount = 0;

  for (const meta of signals) {
    const points = getPoints(meta.id);
    if (!points.length) continue;

    const channel = meta.channel;
    const message = meta.messageName ?? '';
    const signal = meta.signalName;
    const unit = meta.unit ?? '';

    for (const [timeUs, value] of points) {
      if (rowCount >= maxRows) {
        throw new Error(`CSV export exceeds ${maxRows.toLocaleString()} rows — export fewer signals`);
      }
      chunks.push(
        [
          formatTimeSeconds(timeUs),
          timeUs,
          channel,
          escapeCsvField(message),
          escapeCsvField(signal),
          value,
          escapeCsvField(unit),
        ].join(',')
      );
      chunks.push('\n');
      rowCount += 1;
    }
  }

  return {
    csv: chunks.join(''),
    signalCount: signals.length,
    rowCount,
    scope: keyFilter ? 'loaded' : 'all',
  };
}

export function csvExportFileName(sessionName: string, scope: CsvExportScope): string {
  const base = sessionName.trim() || 'signals';
  const safe = base.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  return scope === 'loaded' ? `${safe}-loaded-signals.csv` : `${safe}-signals.csv`;
}

export function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([csv], { type: CSV_EXPORT_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
