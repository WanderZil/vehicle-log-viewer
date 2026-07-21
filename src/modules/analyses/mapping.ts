import type { DbcItem } from '@/modules/analyses/types';

/** channel (string) -> one or more DBC file ids */
export type ChannelMapping = Record<string, string[]>;

export function normalizeChannelMapping(raw: unknown): ChannelMapping {
  if (!raw || typeof raw !== 'object') return {};
  const out: ChannelMapping = {};
  for (const [ch, val] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      const ids = val.filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (ids.length > 0) out[ch] = ids;
    } else if (typeof val === 'string' && val) {
      out[ch] = [val];
    }
  }
  return out;
}

export function mappedChannelCount(mapping: ChannelMapping) {
  return Object.values(mapping).filter((ids) => ids.length > 0).length;
}

export function formatDbcSelection(
  ids: string[],
  dbcItems: DbcItem[],
  placeholder: string
) {
  if (ids.length === 0) return placeholder;
  const names = ids
    .map((id) => dbcItems.find((d) => d.id === id)?.fileName)
    .filter((name): name is string => !!name);
  if (names.length === 0) return placeholder;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

export function toggleChannelDbc(
  mapping: ChannelMapping,
  channel: string | number,
  dbcId: string,
  checked: boolean
): ChannelMapping {
  const key = String(channel);
  const current = mapping[key] ?? [];
  const next = { ...mapping };
  if (checked) {
    if (!current.includes(dbcId)) {
      next[key] = [...current, dbcId];
    }
  } else {
    const filtered = current.filter((id) => id !== dbcId);
    if (filtered.length === 0) {
      delete next[key];
    } else {
      next[key] = filtered;
    }
  }
  return next;
}
