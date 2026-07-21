/**
 * Dispatch CAN frame iteration by log format / file extension.
 */

import { iterateAscFrames } from '@/lib/can/asc-reader';
import { iterateBlfFrames } from '@/lib/can/blf-reader';
import { iterateCsvFrames } from '@/lib/can/csv-reader';
import { iterateLogFrames as iterateAsciiLogFrames } from '@/lib/can/log-reader';
import { iterateMf4Frames } from '@/lib/can/mf4-reader';
import {
  type CanFrame,
  detectLogFormat,
  type LogFormat,
  LogParseError,
} from '@/lib/can/types';

export type { CanFrame, LogFormat } from '@/lib/can/types';
export {
  detectLogFormat,
  LOG_ACCEPT,
  LOG_EXTENSIONS,
  LogParseError,
  stripLogExtension,
} from '@/lib/can/types';

export function iterateFrames(
  buffer: ArrayBuffer,
  format: LogFormat
): Generator<CanFrame> {
  switch (format) {
    case 'blf':
      return iterateBlfFrames(buffer);
    case 'asc':
      return iterateAscFrames(buffer);
    case 'csv':
      return iterateCsvFrames(buffer);
    case 'log':
      return iterateAsciiLogFrames(buffer);
    case 'mf4':
      return iterateMf4Frames(buffer);
    default: {
      const _exhaustive: never = format;
      throw new LogParseError(`Unsupported log format: ${_exhaustive}`);
    }
  }
}

export function iterateFramesFromFileName(
  buffer: ArrayBuffer,
  fileName: string
): Generator<CanFrame> {
  const format = detectLogFormat(fileName);
  if (!format) {
    throw new LogParseError(
      `Unsupported file type "${fileName}". Supported: .blf, .asc, .csv, .log, .mf4`
    );
  }
  return iterateFrames(buffer, format);
}
