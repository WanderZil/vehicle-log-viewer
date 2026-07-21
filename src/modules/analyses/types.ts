import type { ChannelMapping } from '@/modules/analyses/mapping';

export type AnalysisStatus =
  | 'created'
  | 'uploaded'
  | 'parsing'
  | 'ready'
  | 'failed';

export interface AnalysisItem {
  id: string;
  name: string;
  status: AnalysisStatus;
  blfFileName?: string | null;
  blfFileSize?: number | null;
  channelMapping?: ChannelMapping | null;
  channels?: string | null;
  errorMessage?: string | null;
  createdAt?: string | number | Date;
  updatedAt?: string | number | Date;
}

export interface DbcItem {
  id: string;
  analysisId: string;
  fileName: string;
  fileKey?: string | null;
  fileSize?: number | null;
  createdAt?: string | number | Date;
}

export interface SignalItem {
  id: string;
  signalName: string;
  messageName?: string | null;
  unit?: string | null;
  description?: string | null;
  choices?: Record<string, string> | null;
  pointCount?: number;
  channel?: number;
}

export interface SignalPointsResult {
  points: Array<[number, number]>;
}

/** Browser / catalog signal metadata (shared by client decode + AI chat). */
export interface CachedSignalMeta {
  id: string;
  signalName: string;
  messageName?: string | null;
  unit?: string | null;
  description?: string | null;
  choices?: Record<string, string> | null;
  channel: number;
  pointCount: number;
}

export interface ParseCatalog {
  signals: CachedSignalMeta[];
  messageCount: number;
  decodedMessages: number;
  durationUs?: number;
  parsedAt: number;
}

export interface TraceRow {
  timeUs: number;
  channel: number;
  arbitrationId: number;
  type: 'CAN' | 'CAN FD' | 'ERR';
  dir: 'Rx' | 'Tx';
  dlc: number;
  data: string;
}

export interface RawFrameRow {
  rowId: number;
  timeUs: number;
  channel: number;
  arbitrationId: number;
  messageName?: string | null;
  nodeName?: string | null;
  type: 'CAN' | 'CAN FD' | 'ERR';
  dir: 'Rx' | 'Tx';
  dlc: number;
  data: string;
  dataBytes: number[];
  isExtended: boolean;
  isRemote: boolean;
  isError: boolean;
  isFd: boolean;
  /** CAN FD Bit Rate Switch */
  isBrs: boolean;
  /** CAN FD Error State Indicator */
  isEsi: boolean;
}

export interface DecodedSignalValue {
  name: string;
  value: number;
  unit?: string | null;
  description?: string | null;
  choiceLabel?: string | null;
}
