import type { Attribute, DbcData, Message, Signal } from 'candied/lib/dbc/Dbc';

import {
  formatCycleTimeMs,
  loadDbcText,
} from '@/lib/can/client-decode';

export type DbcAttrRow = {
  name: string;
  type: string;
  dataType: string;
  value: string;
  defaultValue: string;
  min: string;
  max: string;
  options: string;
};

export type DbcChoiceRow = {
  value: string;
  label: string;
};

export type DbcSignalRow = {
  name: string;
  startBit: number;
  length: number;
  endian: string;
  signed: boolean;
  valueType: string;
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  multiplex: string;
  multiplexer: boolean;
  receivingNodes: string[];
  description: string;
  choices: DbcChoiceRow[];
  attributes: DbcAttrRow[];
  dataType: string;
};

export type DbcMessageRow = {
  name: string;
  id: number;
  idHex: string;
  isExtended: boolean;
  dlc: number;
  sendingNode: string;
  description: string;
  cycleTimeMs: number | null;
  cycleLabel: string;
  frameFormat: string;
  signalCount: number;
  signals: DbcSignalRow[];
  attributes: DbcAttrRow[];
};

export type DbcNodeRow = {
  name: string;
  description: string;
  attributes: DbcAttrRow[];
  txCount: number;
  rxCount: number;
};

export type DbcCatalog = {
  version: string;
  description: string;
  busSpeed: string;
  messageCount: number;
  signalCount: number;
  nodeCount: number;
  messages: DbcMessageRow[];
  nodes: DbcNodeRow[];
  globalAttributes: DbcAttrRow[];
  globalValueTables: { name: string; choices: DbcChoiceRow[] }[];
};

function attrValue(attr: Attribute | undefined): string {
  if (!attr) return '';
  const v = attr.value ?? attr.defaultValue;
  return v == null ? '' : String(v);
}

function formatAttrs(attrs: Map<string, Attribute> | undefined | null): DbcAttrRow[] {
  if (!attrs || attrs.size === 0) return [];
  return [...attrs.entries()]
    .map(([name, attr]) => ({
      name,
      type: attr.type ?? '',
      dataType: attr.dataType ?? '',
      value: attr.value == null ? '' : String(attr.value),
      defaultValue: attr.defaultValue == null ? '' : String(attr.defaultValue),
      min: attr.min == null ? '' : String(attr.min),
      max: attr.max == null ? '' : String(attr.max),
      options: attr.options?.join(', ') ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatChoices(table: Map<number, string> | null | undefined): DbcChoiceRow[] {
  if (!table || table.size === 0) return [];
  return [...table.entries()]
    .map(([value, label]) => ({
      value: String(value),
      label: label || String(value),
    }))
    .sort((a, b) => Number(a.value) - Number(b.value));
}

function messageCycleFromAttrs(msg: Message): number | null {
  const raw = attrValue(msg.attributes?.get('GenMsgCycleTime'));
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function frameFormat(msg: Message): string {
  const raw = attrValue(msg.attributes?.get('VFrameFormat'));
  if (raw) return raw;
  // Heuristic: DLC > 8 implies CAN FD payload capacity
  if (msg.dlc > 8) return 'CAN_FD';
  return (msg.id & 0x80000000) !== 0 ? 'Extended' : 'Standard';
}

function isExtendedId(id: number): boolean {
  return (id & 0x80000000) !== 0 || id > 0x7ff;
}

function idHex(id: number): string {
  const bare = id & 0x1fffffff;
  const width = bare > 0x7ff || (id & 0x80000000) !== 0 ? 8 : 3;
  return `0x${bare.toString(16).toUpperCase().padStart(width, '0')}`;
}

function valueTypeLabel(sig: Signal): string {
  if (sig.dataType) return String(sig.dataType);
  return sig.signed ? 'Signed' : 'Unsigned';
}

function multiplexLabel(sig: Signal): string {
  if (sig.multiplexer) return 'Mux';
  if (sig.multiplex) return String(sig.multiplex);
  return '';
}

function transmitterLabel(node: string | null | undefined): string {
  if (!node) return '';
  if (/^Vector__XXX$/i.test(node)) return '';
  return node;
}

function toSignalRow(sig: Signal): DbcSignalRow {
  return {
    name: sig.name,
    startBit: sig.startBit,
    length: sig.length,
    endian: sig.endian === 'Motorola' ? 'Motorola' : 'Intel',
    signed: Boolean(sig.signed),
    valueType: valueTypeLabel(sig),
    factor: sig.factor,
    offset: sig.offset,
    min: sig.min,
    max: sig.max,
    unit: sig.unit || '',
    multiplex: multiplexLabel(sig),
    multiplexer: Boolean(sig.multiplexer),
    receivingNodes: [...(sig.receivingNodes ?? [])],
    description: sig.description?.trim() || '',
    choices: formatChoices(sig.valueTable),
    attributes: formatAttrs(sig.attributes),
    dataType: sig.dataType ? String(sig.dataType) : '',
  };
}

function toMessageRow(msg: Message): DbcMessageRow {
  const signals = [...msg.signals.values()]
    .map(toSignalRow)
    .sort((a, b) => a.startBit - b.startBit || a.name.localeCompare(b.name));
  const cycleTimeMs = messageCycleFromAttrs(msg);
  return {
    name: msg.name,
    id: msg.id,
    idHex: idHex(msg.id),
    isExtended: isExtendedId(msg.id),
    dlc: msg.dlc,
    sendingNode: transmitterLabel(msg.sendingNode),
    description: msg.description?.trim() || '',
    cycleTimeMs,
    cycleLabel: formatCycleTimeMs(cycleTimeMs),
    frameFormat: frameFormat(msg),
    signalCount: signals.length,
    signals,
    attributes: formatAttrs(msg.attributes),
  };
}

export function buildDbcCatalog(text: string): DbcCatalog {
  const data: DbcData = loadDbcText(text);
  const messages = [...data.messages.values()]
    .map(toMessageRow)
    .sort((a, b) => (a.id & 0x1fffffff) - (b.id & 0x1fffffff) || a.name.localeCompare(b.name));

  const txCount = new Map<string, number>();
  const rxCount = new Map<string, number>();
  for (const msg of messages) {
    if (msg.sendingNode) {
      txCount.set(msg.sendingNode, (txCount.get(msg.sendingNode) ?? 0) + 1);
    }
    for (const sig of msg.signals) {
      for (const node of sig.receivingNodes) {
        if (!node || /^Vector__XXX$/i.test(node)) continue;
        rxCount.set(node, (rxCount.get(node) ?? 0) + 1);
      }
    }
  }

  const nodes: DbcNodeRow[] = [...data.nodes.values()]
    .map((node) => ({
      name: node.name,
      description: node.description?.trim() || '',
      attributes: formatAttrs(node.attributes),
      txCount: txCount.get(node.name) ?? 0,
      rxCount: rxCount.get(node.name) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Include transmitters that appear on BO_ but missing from BU_
  for (const [name, count] of txCount) {
    if (!nodes.some((n) => n.name === name)) {
      nodes.push({
        name,
        description: '',
        attributes: [],
        txCount: count,
        rxCount: rxCount.get(name) ?? 0,
      });
    }
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name));

  const globalValueTables: DbcCatalog['globalValueTables'] = [];
  if (data.valueTables) {
    for (const [name, table] of data.valueTables) {
      globalValueTables.push({ name, choices: formatChoices(table) });
    }
    globalValueTables.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    version: data.version?.trim() || '',
    description: data.description?.trim() || '',
    busSpeed: data.busSpeed == null ? '' : String(data.busSpeed),
    messageCount: messages.length,
    signalCount: messages.reduce((n, msg) => n + msg.signalCount, 0),
    nodeCount: nodes.length,
    messages,
    nodes,
    globalAttributes: formatAttrs(data.attributes),
    globalValueTables,
  };
}

export function formatCanIdDisplay(msg: Pick<DbcMessageRow, 'idHex' | 'id'>): string {
  return `${msg.idHex} (${msg.id & 0x1fffffff})`;
}

export function formatNumberCompact(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(8)));
}
