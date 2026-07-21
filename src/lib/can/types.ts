/** Shared CAN frame + log format types for browser-side readers. */

export type CanFrame = {
  /** Absolute unix timestamp (seconds), or relative seconds from file start. */
  timestamp: number;
  /** CANoe 1-based channel */
  channel: number;
  arbitrationId: number;
  isExtended: boolean;
  isRemote: boolean;
  isFd: boolean;
  /** CAN FD Bit Rate Switch */
  isBrs?: boolean;
  /** CAN FD Error State Indicator */
  isEsi?: boolean;
  isError?: boolean;
  data: Uint8Array;
};

export type LogFormat = 'blf' | 'asc' | 'csv' | 'log' | 'mf4';

export const LOG_ACCEPT =
  '.blf,.asc,.csv,.log,.mf4,.BLF,.ASC,.CSV,.LOG,.MF4';

export const LOG_EXTENSIONS = ['.blf', '.asc', '.csv', '.log', '.mf4'] as const;

export class LogParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogParseError';
  }
}

export function detectLogFormat(fileName: string): LogFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.blf')) return 'blf';
  if (lower.endsWith('.asc')) return 'asc';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.log')) return 'log';
  if (lower.endsWith('.mf4') || lower.endsWith('.mdf')) return 'mf4';
  return null;
}

export function stripLogExtension(fileName: string): string {
  return fileName.replace(/\.(blf|asc|csv|log|mf4|mdf)$/i, '') || fileName;
}

/** Map DLC code to payload length (classic + CAN FD). */
export function dlcToLen(dlc: number): number {
  if (dlc <= 8) return dlc;
  const map = [12, 16, 20, 24, 32, 48, 64];
  return map[Math.min(dlc, 15) - 9] ?? 64;
}
