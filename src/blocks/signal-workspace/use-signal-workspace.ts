import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import { useClientAnalysisSession } from '@/hooks/use-client-analysis-session';
import {
  buildSignalKeyIndex,
  signalKey,
  type AnalysisProjectFile,
  type SignalKey,
} from '@/lib/analysis-project';
import {
  consumePendingWorkspaceLayout,
  clearPendingProjectImport,
  getPendingProjectImport,
  setWorkspaceOnlySnapshot,
  subscribeWorkspaceLayout,
} from '@/lib/analysis-workspace-layout';
import { getUuid } from '@/lib/hash';
import { getClientSession } from '@/modules/analyses/client-session';
import type { SignalItem } from '@/modules/analyses/types';

export type Points = Array<[number, number]>;

export const PALETTE = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

/** Extended palette for manual color picks (includes defaults). */
export const SIGNAL_COLOR_OPTIONS = [
  ...PALETTE,
  '#f97316',
  '#eab308',
  '#14b8a6',
  '#6366f1',
  '#d946ef',
  '#64748b',
  '#0ea5e9',
  '#10b981',
] as const;

export function defaultSignalColor(index: number): string {
  return PALETTE[index % PALETTE.length]!;
}

export function resolveSignalColor(
  signalId: string,
  index: number,
  colors: Record<string, string>
): string {
  return colors[signalId] ?? defaultSignalColor(index);
}

export const PAD_TOP = 18;
export const PAD_BOTTOM = 26;

export const STACK_Y_AXIS_W = 88;
export const STACK_TIME_AXIS_H = 26;
export const STACK_PANEL_MIN_H = 48;
export const STACK_INNER_PAD = 4;
export const STACK_LABEL_COL_W = 30;

export function valueAt(points: Points, t: number): number | null {
  if (!points.length) return null;
  if (t <= points[0][0]) return points[0][1];
  let lo = 0;
  let hi = points.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return points[ans][1];
}

export function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

export function parseSignalChoices(
  signal: Pick<SignalItem, 'choices'>
): Record<number, string> | null {
  if (!signal.choices) return null;
  const out: Record<number, string> = {};
  for (const [key, label] of Object.entries(signal.choices)) {
    const num = Number(key);
    if (Number.isFinite(num) && label) out[num] = label;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function formatSignalDisplayValue(
  value: number,
  signal: Pick<SignalItem, 'choices'>
): string {
  const choices = parseSignalChoices(signal);
  if (choices) {
    const label = choices[Math.round(value)];
    if (label) return label;
  }
  return formatValue(value);
}

export function getDefaultSignalYRange(s: Series): YRange {
  const span = s.yMax - s.yMin || 1;
  if (s.yMin === s.yMax) {
    const choices = parseSignalChoices(s.signal);
    const pad = choices ? 0.5 : Math.max(span * 0.05, 0.5);
    return { min: s.yMin - pad, max: s.yMax + pad };
  }
  return { min: s.yMin - span * 0.05, max: s.yMax + span * 0.05 };
}

export function formatHex(value: number): string {
  const n = Math.round(value);
  const unsigned = n < 0 ? n >>> 0 : n;
  const hex = unsigned.toString(16).toUpperCase();
  if (unsigned <= 0xff) return hex.padStart(2, '0');
  return hex;
}

export function formatTimeUs(deltaUs: number): string {
  const ms = deltaUs / 1000;
  if (Math.abs(ms) >= 1000) return `${(ms / 1000).toFixed(3)} s`;
  return `${ms.toFixed(2)} ms`;
}

export function formatCursorTime(deltaUs: number): string {
  const ms = deltaUs / 1000;
  if (Math.abs(ms) >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(2)} ms`;
}

function visibleIdsForSignals(signals: SignalItem[]): Record<string, true> {
  const next: Record<string, true> = {};
  for (const signal of signals) next[signal.id] = true;
  return next;
}

export type ViewMode = 'overlay' | 'stacked';
export type DragTarget = 'main' | 'diff' | null;
export type ZoomMode = 'cursor' | 'box' | 'x' | 'y' | 'pan';

export interface YRange {
  min: number;
  max: number;
}

export interface ViewWindow {
  tMin: number;
  tMax: number;
}

/** Minimum visible time span when box-zooming (avoids tSpan=0 blank chart). */
const MIN_ZOOM_TIME_FRAC = 0.0001;
const MIN_ZOOM_TIME_US = 1;
const MIN_ZOOM_Y_FRAC = 0.001;

function clampTimeWindow(
  rawMin: number,
  rawMax: number,
  fullTMin: number,
  fullTMax: number
): ViewWindow | null {
  const fullSpan = fullTMax - fullTMin;
  if (!(fullSpan > 0)) return null;

  let lo = Math.min(rawMin, rawMax);
  let hi = Math.max(rawMin, rawMax);
  const minSpan = Math.max(MIN_ZOOM_TIME_US, fullSpan * MIN_ZOOM_TIME_FRAC);

  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }

  lo = Math.max(fullTMin, lo);
  hi = Math.min(fullTMax, hi);

  if (hi - lo < minSpan) {
    if (lo <= fullTMin) hi = Math.min(fullTMax, fullTMin + minSpan);
    else lo = Math.max(fullTMin, fullTMax - minSpan);
  }

  if (!(hi > lo)) return null;
  return { tMin: lo, tMax: hi };
}

function clampYRange(lo: number, hi: number, referenceSpan: number): YRange | null {
  let min = Math.min(lo, hi);
  let max = Math.max(lo, hi);
  const minSpan = Math.max(1e-9, Math.abs(referenceSpan) * MIN_ZOOM_Y_FRAC);
  if (max - min < minSpan) {
    const mid = (min + max) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  if (!(max > min)) return null;
  return { min, max };
}

export interface Series {
  signal: SignalItem;
  color: string;
  points: Points;
  yMin: number;
  yMax: number;
}

/** Local plot geometry for Y zoom — must match the chart that produced the drag coords. */
export interface YZoomGeometry {
  plotTop: number;
  plotHeight: number;
  /** Block-local series for shared overlay range (defaults to visibleSeries). */
  rangeSeries?: Series[];
}

export interface SignalGroup {
  id: string;
  name: string;
  signalIds: string[];
  viewMode: ViewMode;
}

export interface ChartBlock {
  id: string;
  title?: string;
  viewMode: ViewMode;
  series: Series[];
}

const EMPTY_SIGNALS: SignalItem[] = [];

function resolveSignalsByKeys(
  keys: SignalKey[],
  catalogIndex: Map<SignalKey, SignalItem>
): SignalItem[] {
  const out: SignalItem[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const signal = catalogIndex.get(key);
    if (!signal || seen.has(signal.id)) continue;
    seen.add(signal.id);
    out.push(signal);
  }
  return out;
}

function applyImportedWorkspaceLayout(
  layout: AnalysisProjectFile['workspace'],
  catalog: SignalItem[],
  setters: {
    setAdded: (value: SignalItem[]) => void;
    setVisibleIds: (value: Record<string, true>) => void;
    setGroups: (value: SignalGroup[]) => void;
    setViewMode: (value: ViewMode) => void;
    setZoomMode: (value: ZoomMode) => void;
    setViewWindow: (value: ViewWindow | null) => void;
    setYRanges: (value: Record<string, YRange>) => void;
    setOverlayYRange: (value: YRange | null) => void;
    setMainCursorTime: (value: number | null) => void;
    setDiffOn: (value: boolean) => void;
    setDiffCursorTime: (value: number | null) => void;
  }
): { restoredSignals: number; skippedSignals: number } {
  const catalogIndex = buildSignalKeyIndex(catalog);
  const added = resolveSignalsByKeys(layout.addedSignalKeys, catalogIndex);
  const visibleKeys = new Set(layout.visibleSignalKeys);
  const visibleIds: Record<string, true> = {};
  for (const signal of added) {
    const key = signalKey(signal);
    if (visibleKeys.size === 0 || visibleKeys.has(key)) {
      visibleIds[signal.id] = true;
    }
  }
  if (Object.keys(visibleIds).length === 0 && added.length > 0) {
    for (const signal of added) visibleIds[signal.id] = true;
  }

  const yRanges: Record<string, YRange> = {};
  for (const [key, range] of Object.entries(layout.yRanges)) {
    const signal = catalogIndex.get(key);
    if (signal) yRanges[signal.id] = range;
  }

  const groups: SignalGroup[] = [];
  for (const group of layout.groups) {
    const signalIds = resolveSignalsByKeys(group.signalKeys, catalogIndex).map((s) => s.id);
    if (signalIds.length === 0) continue;
    groups.push({
      id: group.id || getUuid(),
      name: group.name,
      signalIds,
      viewMode: group.viewMode,
    });
  }

  setters.setAdded(added);
  setters.setVisibleIds(visibleIds);
  setters.setGroups(groups);
  setters.setViewMode(layout.viewMode);
  setters.setZoomMode(layout.zoomMode);
  setters.setViewWindow(layout.viewWindow);
  setters.setYRanges(yRanges);
  setters.setOverlayYRange(layout.overlayYRange);
  setters.setMainCursorTime(layout.mainCursorTime);
  setters.setDiffOn(layout.diffOn);
  setters.setDiffCursorTime(layout.diffCursorTime);

  return {
    restoredSignals: added.length,
    skippedSignals: Math.max(0, layout.addedSignalKeys.length - added.length),
  };
}

export function useSignalWorkspace(analysisId: string) {
  const clientSnap = useClientAnalysisSession();
  const pendingProjectToken = useSyncExternalStore(
    subscribeWorkspaceLayout,
    () => getPendingProjectImport()?.exportedAt ?? '',
    () => ''
  );
  const sessionVersion = `${clientSnap.status}:${clientSnap.catalog?.signals.length ?? 0}:${clientSnap.catalog?.parsedAt ?? 0}`;
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [added, setAdded] = useState<SignalItem[]>([]);
  const [visibleIds, setVisibleIds] = useState<Record<string, true>>({});
  const [mainCursorTime, setMainCursorTime] = useState<number | null>(null);
  const [diffOn, setDiffOn] = useState(false);
  const [diffCursorTime, setDiffCursorTime] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('stacked');
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('box');
  const [viewWindow, setViewWindow] = useState<ViewWindow | null>(null);
  const [yRanges, setYRanges] = useState<Record<string, YRange>>({});
  const [overlayYRange, setOverlayYRange] = useState<YRange | null>(null);
  const [groups, setGroups] = useState<SignalGroup[]>([]);
  const [groupPickIds, setGroupPickIds] = useState<Record<string, true>>({});
  const [groupPickMode, setGroupPickMode] = useState(false);
  const [signalColors, setSignalColors] = useState<Record<string, string>>({});
  const layoutAppliedRef = useRef<string | null>(null);

  const plotRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(760);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0) setWidth(w);
        if (h > 0) setHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const signalsQuery = useQuery({
    queryKey: ['analysis-signals', analysisId, deferredSearch, sessionVersion],
    queryFn: () => {
      const session = getClientSession();
      return Promise.resolve(
        session.listSignals(deferredSearch || undefined, 1, deferredSearch ? 500 : 200)
      );
    },
  });

  const catalog = signalsQuery.data?.items ?? EMPTY_SIGNALS;
  const catalogTotal = signalsQuery.data?.total ?? 0;
  const catalogLoading = signalsQuery.isFetching || search.trim() !== deferredSearch;
  const addedIds = new Set(added.map((s) => s.id));

  useEffect(() => {
    const addedSignalKeys = added.map((signal) => signalKey(signal));
    const visibleSignalKeys = added
      .filter((signal) => visibleIds[signal.id])
      .map((signal) => signalKey(signal));
    setWorkspaceOnlySnapshot({
      addedSignalKeys,
      visibleSignalKeys,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        signalKeys: group.signalIds
          .map((id) => added.find((signal) => signal.id === id))
          .filter((signal): signal is SignalItem => !!signal)
          .map((signal) => signalKey(signal)),
        viewMode: group.viewMode,
      })),
      viewMode,
      zoomMode,
      viewWindow,
      yRanges: Object.fromEntries(
        Object.entries(yRanges).flatMap(([signalId, range]) => {
          const signal = added.find((item) => item.id === signalId);
          return signal ? [[signalKey(signal), range] as const] : [];
        })
      ),
      overlayYRange,
      mainCursorTime,
      diffOn,
      diffCursorTime,
    });
  }, [
    added,
    visibleIds,
    groups,
    viewMode,
    zoomMode,
    viewWindow,
    yRanges,
    overlayYRange,
    mainCursorTime,
    diffOn,
    diffCursorTime,
  ]);

  useEffect(() => {
    if (clientSnap.status !== 'ready' || catalogTotal === 0) return;
    const pending = consumePendingWorkspaceLayout();
    if (!pending) return;

    const fingerprint = JSON.stringify(pending);
    if (layoutAppliedRef.current === fingerprint) return;

    if (pending.addedSignalKeys.length === 0) {
      clearPendingProjectImport();
      layoutAppliedRef.current = fingerprint;
      return;
    }

    const catalogSignals: SignalItem[] = (clientSnap.catalog?.signals ?? []).map((meta) => ({
      id: meta.id,
      signalName: meta.signalName,
      messageName: meta.messageName,
      unit: meta.unit,
      description: meta.description,
      choices: meta.choices,
      pointCount: meta.pointCount,
      channel: meta.channel,
    }));

    const result = applyImportedWorkspaceLayout(pending, catalogSignals, {
      setAdded,
      setVisibleIds,
      setGroups,
      setViewMode,
      setZoomMode,
      setViewWindow,
      setYRanges,
      setOverlayYRange,
      setMainCursorTime,
      setDiffOn,
      setDiffCursorTime,
    });
    layoutAppliedRef.current = fingerprint;
    if (result.restoredSignals > 0) {
      clearPendingProjectImport();
    }
  }, [
    clientSnap.status,
    clientSnap.catalog?.signals,
    catalogTotal,
    pendingProjectToken,
  ]);

  const pointQueries = useQueries({
    queries: added.map((sig) => ({
      queryKey: ['analysis-signal-points', analysisId, sig.id, sessionVersion],
      queryFn: () =>
        Promise.resolve({ points: getClientSession().getPoints(sig.id) }),
    })),
  });

  const series: Series[] = added.map((signal, index) => {
    const points = pointQueries[index]?.data?.points ?? [];
    const ys = points.map((p) => p[1]);
    return {
      signal,
      color: resolveSignalColor(signal.id, index, signalColors),
      points,
      yMin: ys.length ? Math.min(...ys) : 0,
      yMax: ys.length ? Math.max(...ys) : 1,
    };
  });

  const visibleSeries = useMemo(
    () => series.filter((s) => visibleIds[s.signal.id]),
    [series, visibleIds]
  );

  const groupedSignalIds = useMemo(
    () => new Set(groups.flatMap((g) => g.signalIds)),
    [groups]
  );

  const chartBlocks = useMemo(() => {
    const blocks: ChartBlock[] = [];
    const ungrouped = visibleSeries.filter((s) => !groupedSignalIds.has(s.signal.id));
    if (ungrouped.length > 0) {
      blocks.push({ id: '__ungrouped__', viewMode, series: ungrouped });
    }
    for (const group of groups) {
      const groupSeries = visibleSeries.filter((s) => group.signalIds.includes(s.signal.id));
      if (groupSeries.length > 0) {
        blocks.push({
          id: group.id,
          title: group.name,
          viewMode: group.viewMode,
          series: groupSeries,
        });
      }
    }
    if (blocks.length === 0 && visibleSeries.length > 0) {
      return [{ id: '__all__', viewMode, series: visibleSeries }];
    }
    return blocks;
  }, [visibleSeries, groups, groupedSignalIds, viewMode]);

  let chartFullTMin = Infinity;
  let chartFullTMax = -Infinity;
  for (const s of visibleSeries) {
    if (!s.points.length) continue;
    chartFullTMin = Math.min(chartFullTMin, s.points[0][0]);
    chartFullTMax = Math.max(chartFullTMax, s.points[s.points.length - 1][0]);
  }
  const chartHasDomain =
    Number.isFinite(chartFullTMin) &&
    Number.isFinite(chartFullTMax) &&
    chartFullTMax > chartFullTMin;

  let fullTMin = Infinity;
  let fullTMax = -Infinity;
  for (const s of series) {
    if (!s.points.length) continue;
    fullTMin = Math.min(fullTMin, s.points[0][0]);
    fullTMax = Math.max(fullTMax, s.points[s.points.length - 1][0]);
  }
  const hasDomain = Number.isFinite(fullTMin) && Number.isFinite(fullTMax) && fullTMax > fullTMin;
  const fullTSpan = hasDomain ? fullTMax - fullTMin : 1;

  const tMin = viewWindow?.tMin ?? fullTMin;
  const tMax = viewWindow?.tMax ?? fullTMax;
  const tSpan = hasDomain ? Math.max(tMax - tMin, MIN_ZOOM_TIME_US) : 1;

  const chartHeight = Math.max(height, 200);
  const plotH = chartHeight - PAD_TOP - PAD_BOTTOM;

  const getYRange = useCallback(
    (s: Series, opts?: { preferOverlayRange?: boolean }): YRange => {
      const custom = yRanges[s.signal.id];
      if (custom) return custom;
      const useOverlay = opts?.preferOverlayRange ?? viewMode === 'overlay';
      if (useOverlay && overlayYRange) return overlayYRange;
      return getDefaultSignalYRange(s);
    },
    [yRanges, overlayYRange, viewMode]
  );

  const resetZoom = useCallback(() => {
    setViewWindow(null);
    setYRanges({});
    setOverlayYRange(null);
  }, []);

  const setTimeWindowFromSeconds = useCallback(
    (startSec: number, endSec: number) => {
      if (!hasDomain) return false;
      const lo = Math.min(startSec, endSec);
      const hi = Math.max(startSec, endSec);
      const nextMin = fullTMin + lo * 1_000_000;
      const nextMax = fullTMin + hi * 1_000_000;
      const clampedMin = Math.max(fullTMin, Math.min(nextMin, fullTMax));
      const clampedMax = Math.max(fullTMin, Math.min(nextMax, fullTMax));
      const window = clampTimeWindow(clampedMin, clampedMax, fullTMin, fullTMax);
      if (!window) return false;
      setViewWindow(window);
      setDiffOn(false);
      setDiffCursorTime(null);
      setMainCursorTime((clampedMin + clampedMax) / 2);
      return true;
    },
    [hasDomain, fullTMin, fullTMax]
  );

  const zoomTimeAt = useCallback(
    (centerFrac: number, factor: number) => {
      if (!hasDomain) return;
      const newSpan = Math.min(fullTSpan, Math.max(fullTSpan * 0.001, tSpan * factor));
      // Keep the timestamp under the cursor fixed:
      // nextMin + centerFrac * newSpan == (tMin + centerFrac * tSpan)
      const anchorTime = tMin + centerFrac * tSpan;
      let nextMin = anchorTime - centerFrac * newSpan;
      let nextMax = nextMin + newSpan;
      if (nextMin < fullTMin) {
        nextMin = fullTMin;
        nextMax = Math.min(fullTMax, fullTMin + newSpan);
      }
      if (nextMax > fullTMax) {
        nextMax = fullTMax;
        nextMin = Math.max(fullTMin, fullTMax - newSpan);
      }
      const window = clampTimeWindow(nextMin, nextMax, fullTMin, fullTMax);
      if (window) setViewWindow(window);
    },
    [hasDomain, tMin, tSpan, fullTMin, fullTMax, fullTSpan]
  );

  const resolveSeriesForY = useCallback(
    (signalId: string | undefined, rangeSeries?: Series[]) => {
      const pool = rangeSeries?.length ? rangeSeries : visibleSeries;
      if (signalId) {
        return pool.find((item) => item.signal.id === signalId) ?? series.find((item) => item.signal.id === signalId);
      }
      return undefined;
    },
    [visibleSeries, series]
  );

  const applyYSelection = useCallback(
    (
      top: number,
      bottom: number,
      opts: {
        signalId?: string;
        mode: ViewMode;
        geometry?: YZoomGeometry;
      }
    ) => {
      if (bottom - top < 4) return;

      const plotTop = opts.geometry?.plotTop ?? PAD_TOP;
      const plotHeight =
        opts.geometry?.plotHeight ?? Math.max(1, chartHeight - PAD_TOP - PAD_BOTTOM);
      if (plotHeight <= 0) return;

      const yFracTop = Math.min(1, Math.max(0, (top - plotTop) / plotHeight));
      const yFracBottom = Math.min(1, Math.max(0, (bottom - plotTop) / plotHeight));
      if (Math.abs(yFracBottom - yFracTop) < 1e-6) return;

      const rangePool =
        opts.geometry?.rangeSeries?.length ? opts.geometry.rangeSeries : visibleSeries;

      if (opts.mode === 'stacked' && opts.signalId) {
        const s = resolveSeriesForY(opts.signalId, rangePool);
        if (!s) return;
        const range = getYRange(s);
        const ySpan = range.max - range.min || 1;
        const nextMax = range.max - yFracTop * ySpan;
        const nextMin = range.max - yFracBottom * ySpan;
        const clamped = clampYRange(nextMin, nextMax, ySpan);
        if (!clamped) return;
        setYRanges((prev) => ({
          ...prev,
          [opts.signalId!]: clamped,
        }));
        return;
      }

      let globalMin = Infinity;
      let globalMax = -Infinity;
      for (const item of rangePool) {
        const r = getYRange(item);
        globalMin = Math.min(globalMin, r.min);
        globalMax = Math.max(globalMax, r.max);
      }
      if (!Number.isFinite(globalMin)) return;
      const ySpan = globalMax - globalMin || 1;
      const nextMax = globalMax - yFracTop * ySpan;
      const nextMin = globalMax - yFracBottom * ySpan;
      const clamped = clampYRange(nextMin, nextMax, ySpan);
      if (!clamped) return;
      setOverlayYRange(clamped);
    },
    [chartHeight, visibleSeries, getYRange, resolveSeriesForY]
  );

  const applyBoxZoom = useCallback(
    (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      signalId?: string,
      modeOverride?: ViewMode,
      yGeometry?: YZoomGeometry
    ) => {
      const mode = modeOverride ?? viewMode;
      const pl = STACK_Y_AXIS_W;
      const pw = Math.max(1, width - pl);
      if (!hasDomain || pw <= 0) return;
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const top = Math.min(y0, y1);
      const bottom = Math.max(y0, y1);
      const hSpan = right - left;
      const vSpan = bottom - top;
      if (hSpan < 4 && vSpan < 4) return;

      if (hSpan >= 4) {
        const plotLeftPx = Math.max(0, Math.min(pw, left - pl));
        const plotRightPx = Math.max(0, Math.min(pw, right - pl));
        if (plotRightPx > plotLeftPx) {
          const nextTMin = tMin + (plotLeftPx / pw) * tSpan;
          const nextTMax = tMin + (plotRightPx / pw) * tSpan;
          const window = clampTimeWindow(nextTMin, nextTMax, fullTMin, fullTMax);
          if (window) setViewWindow(window);
        }
      }

      if (vSpan >= 4) {
        applyYSelection(top, bottom, {
          signalId,
          mode,
          geometry: yGeometry,
        });
      }
    },
    [hasDomain, width, tMin, tSpan, fullTMin, fullTMax, viewMode, applyYSelection]
  );

  const applyAxisZoom = useCallback(
    (
      axis: 'x' | 'y',
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      signalId?: string,
      modeOverride?: ViewMode,
      yGeometry?: YZoomGeometry
    ) => {
      const mode = modeOverride ?? viewMode;
      const pl = STACK_Y_AXIS_W;
      const pw = Math.max(1, width - pl);
      if (!hasDomain || pw <= 0) return;
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const top = Math.min(y0, y1);
      const bottom = Math.max(y0, y1);

      if (axis === 'x') {
        if (right - left < 4) return;
        const plotLeftPx = Math.max(0, Math.min(pw, left - pl));
        const plotRightPx = Math.max(0, Math.min(pw, right - pl));
        if (plotRightPx <= plotLeftPx) return;
        const nextTMin = tMin + (plotLeftPx / pw) * tSpan;
        const nextTMax = tMin + (plotRightPx / pw) * tSpan;
        const window = clampTimeWindow(nextTMin, nextTMax, fullTMin, fullTMax);
        if (window) setViewWindow(window);
        return;
      }

      applyYSelection(top, bottom, { signalId, mode, geometry: yGeometry });
    },
    [hasDomain, width, tMin, tSpan, fullTMin, fullTMax, viewMode, applyYSelection]
  );

  const zoomYAt = useCallback(
    (frac: number, factor: number, signalId?: string, rangeSeries?: Series[]) => {
      // Per-signal zoom whenever a panel id is known (stacked / grouped stacked).
      if (signalId) {
        const s = resolveSeriesForY(signalId, rangeSeries);
        if (!s) return;
        const range = getYRange(s);
        const center = range.max - frac * (range.max - range.min);
        const span = (range.max - range.min || 1) * factor;
        setYRanges((prev) => ({
          ...prev,
          [signalId]: { min: center - span * frac, max: center - span * frac + span },
        }));
        return;
      }
      const pool = rangeSeries?.length ? rangeSeries : visibleSeries;
      let globalMin = Infinity;
      let globalMax = -Infinity;
      for (const s of pool) {
        const r = getYRange(s);
        globalMin = Math.min(globalMin, r.min);
        globalMax = Math.max(globalMax, r.max);
      }
      if (!Number.isFinite(globalMin)) return;
      const center = globalMax - frac * (globalMax - globalMin);
      const span = (globalMax - globalMin || 1) * factor;
      setOverlayYRange({ min: center - span * frac, max: center - span * frac + span });
    },
    [visibleSeries, getYRange, resolveSeriesForY]
  );

  const panView = useCallback(
    (
      deltaPxX: number,
      deltaPxY: number,
      opts: {
        plotWidth: number;
        plotHeight: number;
        viewMode?: ViewMode;
        signalId?: string;
        rangeSeries?: Series[];
      }
    ) => {
      if (!hasDomain) return;
      const pw = Math.max(1, opts.plotWidth);
      const ph = Math.max(1, opts.plotHeight);
      const mode = opts.viewMode ?? viewMode;

      const isTimeZoomed = viewWindow !== null;
      if (Math.abs(deltaPxX) > 0 && isTimeZoomed) {
        const deltaT = -(deltaPxX / pw) * tSpan;
        const span = tMax - tMin;
        let nextMin = tMin + deltaT;
        let nextMax = tMax + deltaT;
        if (nextMin < fullTMin) {
          nextMin = fullTMin;
          nextMax = fullTMin + span;
        }
        if (nextMax > fullTMax) {
          nextMax = fullTMax;
          nextMin = fullTMax - span;
        }
        setViewWindow({ tMin: nextMin, tMax: nextMax });
      }

      if (Math.abs(deltaPxY) < 0.5) return;
      const yShiftFrac = deltaPxY / ph;

      if (mode === 'stacked' && opts.signalId) {
        const s = resolveSeriesForY(opts.signalId, opts.rangeSeries);
        if (!s) return;
        const range = getYRange(s);
        const ySpan = range.max - range.min || 1;
        const delta = yShiftFrac * ySpan;
        setYRanges((prev) => ({
          ...prev,
          [opts.signalId!]: {
            min: range.min + delta,
            max: range.max + delta,
          },
        }));
        return;
      }

      if (overlayYRange) {
        const ySpan = overlayYRange.max - overlayYRange.min || 1;
        const delta = yShiftFrac * ySpan;
        setOverlayYRange({
          min: overlayYRange.min + delta,
          max: overlayYRange.max + delta,
        });
        return;
      }

      if (Object.keys(yRanges).length > 0) {
        setYRanges((prev) => {
          const next: Record<string, YRange> = { ...prev };
          for (const [id, range] of Object.entries(prev)) {
            const ySpan = range.max - range.min || 1;
            const delta = yShiftFrac * ySpan;
            next[id] = { min: range.min + delta, max: range.max + delta };
          }
          return next;
        });
      }
    },
    [
      hasDomain,
      viewWindow,
      tMin,
      tMax,
      tSpan,
      fullTMin,
      fullTMax,
      viewMode,
      overlayYRange,
      yRanges,
      getYRange,
      resolveSeriesForY,
    ]
  );

  const zoomInCenter = useCallback(() => {
    zoomTimeAt(0.5, 0.75);
  }, [zoomTimeAt]);

  const zoomOutCenter = useCallback(() => {
    zoomTimeAt(0.5, 1 / 0.75);
  }, [zoomTimeAt]);

  const mainCursorActive = mainCursorTime !== null;
  const diffCursorActive = diffOn && diffCursorTime !== null;
  const mainTime = mainCursorTime ?? 0;
  const diffTime = diffCursorTime ?? 0;
  const mainFrac = mainCursorActive && tSpan > 0 ? (mainTime - tMin) / tSpan : 0.5;
  const diffFrac = diffCursorActive && tSpan > 0 ? (diffTime - tMin) / tSpan : 0.25;
  const totalPoints = series.reduce((sum, s) => sum + s.points.length, 0);
  const isFetching = pointQueries.some((q) => q.isFetching);

  const plotLeft = STACK_Y_AXIS_W;
  const plotWidth = Math.max(1, width - plotLeft);

  const xOf = (t: number) => plotLeft + ((t - tMin) / tSpan) * plotWidth;
  const yOf = (value: number, s: Series) => {
    const range = getYRange(s);
    const span = range.max - range.min || 1;
    return PAD_TOP + plotH - ((value - range.min) / span) * plotH;
  };

  const stepPathsById = useMemo(() => {
    const paths = new Map<string, string>();
    for (const s of series) {
      if (!s.points.length) {
        paths.set(s.signal.id, '');
        continue;
      }
      const range = getYRange(s);
      const ySpan = range.max - range.min || 1;
      const yAt = (value: number) =>
        PAD_TOP + plotH - ((value - range.min) / ySpan) * plotH;
      const xAt = (t: number) => plotLeft + ((t - tMin) / tSpan) * plotWidth;
      let d = `M${xAt(s.points[0][0]).toFixed(2)},${yAt(s.points[0][1]).toFixed(2)}`;
      for (let i = 1; i < s.points.length; i += 1) {
        const px = xAt(s.points[i][0]).toFixed(2);
        const prevY = yAt(s.points[i - 1][1]).toFixed(2);
        const curY = yAt(s.points[i][1]).toFixed(2);
        d += `L${px},${prevY}L${px},${curY}`;
      }
      paths.set(s.signal.id, d);
    }
    return paths;
  }, [series, tMin, tSpan, plotLeft, plotWidth, plotH, getYRange]);

  const stepPath = useCallback(
    (s: Series) => stepPathsById.get(s.signal.id) ?? '',
    [stepPathsById]
  );

  const plotRectRef = useRef<DOMRect | null>(null);

  const fractionFromClientX = useCallback((clientX: number, rect = plotRectRef.current) => {
    const box = rect ?? plotRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return 0;
    const pw = box.width - STACK_Y_AXIS_W;
    if (pw <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left - STACK_Y_AXIS_W) / pw));
  }, []);

  const timeFromClientX = useCallback(
    (clientX: number, rect = plotRectRef.current) => {
      const frac = fractionFromClientX(clientX, rect);
      return tMin + frac * tSpan;
    },
    [fractionFromClientX, tMin, tSpan]
  );

  const placeMainCursorInView = useCallback(
    (frac = 0.5) => {
      if (!hasDomain) return;
      setMainCursorTime(tMin + frac * tSpan);
    },
    [hasDomain, tMin, tSpan]
  );

  const placeDiffCursorInView = useCallback(
    (frac = 0.25) => {
      if (!hasDomain) return;
      setDiffCursorTime(tMin + frac * tSpan);
    },
    [hasDomain, tMin, tSpan]
  );

  const handleZoomModeChange = useCallback((mode: ZoomMode) => {
    if (mode === 'cursor') return;
    setZoomMode(mode);
  }, []);

  const activateMainCursor = useCallback(() => {
    if (!hasDomain) return;
    if (mainCursorTime !== null) {
      setMainCursorTime(null);
      if (diffOn) {
        setDiffOn(false);
        setDiffCursorTime(null);
      }
      return;
    }
    placeMainCursorInView(0.5);
    setZoomMode('cursor');
  }, [hasDomain, mainCursorTime, diffOn, placeMainCursorInView]);

  const activateDiffCursor = useCallback(() => {
    if (!hasDomain) return;
    if (diffOn && diffCursorTime !== null) {
      setDiffOn(false);
      setDiffCursorTime(null);
      setMainCursorTime(null);
      return;
    }
    if (mainCursorTime === null) placeMainCursorInView(0.5);
    setDiffOn(true);
    placeDiffCursorInView(0.25);
    setZoomMode('cursor');
  }, [
    hasDomain,
    diffOn,
    diffCursorTime,
    mainCursorTime,
    placeMainCursorInView,
    placeDiffCursorInView,
  ]);

  const clearDiffCursor = useCallback(() => {
    setDiffOn(false);
    setDiffCursorTime(null);
  }, []);

  const toggleDiffOn = useCallback(() => {
    activateDiffCursor();
  }, [activateDiffCursor]);

  const setMainFrac = useCallback(
    (fracOrUpdater: number | ((prev: number) => number)) => {
      setMainCursorTime((prevTime) => {
        const prevFrac = tSpan > 0 ? ((prevTime ?? tMin + 0.5 * tSpan) - tMin) / tSpan : 0.5;
        const nextFrac =
          typeof fracOrUpdater === 'function' ? fracOrUpdater(prevFrac) : fracOrUpdater;
        const clamped = Math.min(1, Math.max(0, nextFrac));
        return tMin + clamped * tSpan;
      });
    },
    [tMin, tSpan]
  );

  const setDiffFrac = useCallback(
    (fracOrUpdater: number | ((prev: number) => number)) => {
      setDiffCursorTime((prevTime) => {
        const prevFrac = tSpan > 0 ? ((prevTime ?? tMin + 0.25 * tSpan) - tMin) / tSpan : 0.25;
        const nextFrac =
          typeof fracOrUpdater === 'function' ? fracOrUpdater(prevFrac) : fracOrUpdater;
        const clamped = Math.min(1, Math.max(0, nextFrac));
        return tMin + clamped * tSpan;
      });
    },
    [tMin, tSpan]
  );

  const resetDiffCursor = useCallback(() => {
    if (!hasDomain) return;
    // Re-place both cursors for a fresh delta measurement.
    placeMainCursorInView(0.5);
    setDiffOn(true);
    placeDiffCursorInView(0.25);
    setZoomMode('cursor');
  }, [hasDomain, placeMainCursorInView, placeDiffCursorInView]);

  const nudgeMainCursor = useCallback(
    (direction: -1 | 1, stepFrac = 0.01) => {
      if (!hasDomain) return;
      const step = tSpan * stepFrac;
      setMainCursorTime((prev) => {
        const current = prev ?? tMin + 0.5 * tSpan;
        return Math.min(fullTMax, Math.max(fullTMin, current + direction * step));
      });
      setZoomMode('cursor');
    },
    [hasDomain, tSpan, fullTMin, fullTMax, tMin]
  );

  const nudgeDiffCursor = useCallback(
    (direction: -1 | 1, stepFrac = 0.01) => {
      if (!hasDomain) return;
      const step = tSpan * stepFrac;
      setDiffOn(true);
      if (mainCursorTime === null) placeMainCursorInView(0.5);
      setDiffCursorTime((prev) => {
        const current = prev ?? tMin + 0.25 * tSpan;
        return Math.min(fullTMax, Math.max(fullTMin, current + direction * step));
      });
      setZoomMode('cursor');
    },
    [
      hasDomain,
      tSpan,
      fullTMin,
      fullTMax,
      tMin,
      mainCursorTime,
      placeMainCursorInView,
    ]
  );

  useEffect(() => {
    if (!dragTarget) return;
    plotRectRef.current = plotRef.current?.getBoundingClientRect() ?? null;
    let raf = 0;
    let lastX = 0;
    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const nextTime = timeFromClientX(lastX);
        if (dragTarget === 'main') setMainCursorTime(nextTime);
        else setDiffCursorTime(nextTime);
      });
    };
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
      plotRectRef.current = null;
      setDragTarget(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragTarget, timeFromClientX]);

  const addSignal = useCallback((sig: SignalItem) => {
    setAdded((prev) => (prev.some((s) => s.id === sig.id) ? prev : [...prev, sig]));
    setVisibleIds((prev) => (prev[sig.id] ? prev : { ...prev, [sig.id]: true }));
  }, []);

  const loadSignals = useCallback((signals: SignalItem[], groupName?: string | null) => {
    if (signals.length === 0) return;

    setAdded((prev) => {
      const next = [...prev];
      for (const sig of signals) {
        if (!next.some((s) => s.id === sig.id)) next.push(sig);
      }
      setVisibleIds(visibleIdsForSignals(next));
      return next;
    });

    const trimmedGroup = groupName?.trim();
    if (trimmedGroup && signals.length >= 2) {
      setGroups((prev) => [
        ...prev,
        {
          id: getUuid(),
          name: trimmedGroup,
          signalIds: signals.map((s) => s.id),
          viewMode: 'stacked',
        },
      ]);
    }
  }, []);

  const unloadSignals = useCallback((signals: SignalItem[]) => {
    if (signals.length === 0) return;
    const ids = new Set(signals.map((s) => s.id));

    setAdded((prev) => {
      const next = prev.filter((s) => !ids.has(s.id));
      setVisibleIds(visibleIdsForSignals(next));
      return next;
    });
    setGroupPickIds((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, signalIds: g.signalIds.filter((sid) => !ids.has(sid)) }))
        .filter((g) => g.signalIds.length >= 2)
    );
  }, []);

  const clearLoadedSignals = useCallback((keep?: SignalItem[]) => {
    const next = keep ?? [];
    setAdded(next);
    setVisibleIds(visibleIdsForSignals(next));
    const keepIds = new Set(next.map((s) => s.id));
    setSignalColors((prev) => {
      const out: Record<string, string> = {};
      for (const [id, color] of Object.entries(prev)) {
        if (keepIds.has(id)) out[id] = color;
      }
      return out;
    });
    setGroupPickIds({});
    setGroupPickMode(false);
    setGroups((prev) =>
      keep
        ? prev
            .map((g) => ({
              ...g,
              signalIds: g.signalIds.filter((sid) => keepIds.has(sid)),
            }))
            .filter((g) => g.signalIds.length >= 2)
        : []
    );
  }, []);

  const removeSignal = useCallback((id: string) => {
    setAdded((prev) => prev.filter((s) => s.id !== id));
    setSignalColors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setVisibleIds((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setGroupPickIds((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, signalIds: g.signalIds.filter((sid) => sid !== id) }))
        .filter((g) => g.signalIds.length >= 2)
    );
  }, []);

  const toggleSignalVisible = useCallback((id: string) => {
    setVisibleIds((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: true };
    });
  }, []);

  const isSignalVisible = useCallback(
    (id: string) => visibleIds[id] === true,
    [visibleIds]
  );

  const getSignalColor = useCallback(
    (signalId: string, index: number) => resolveSignalColor(signalId, index, signalColors),
    [signalColors]
  );

  const setSignalColor = useCallback((signalId: string, color: string) => {
    setSignalColors((prev) => ({ ...prev, [signalId]: color }));
  }, []);

  const resetSignalColor = useCallback((signalId: string) => {
    setSignalColors((prev) => {
      if (!prev[signalId]) return prev;
      const next = { ...prev };
      delete next[signalId];
      return next;
    });
  }, []);

  const hasCustomSignalColor = useCallback(
    (signalId: string) => signalColors[signalId] !== undefined,
    [signalColors]
  );

  const toggleGroupPick = useCallback((id: string) => {
    setGroupPickIds((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: true };
    });
  }, []);

  const clearGroupPick = useCallback(() => {
    setGroupPickIds({});
    setGroupPickMode(false);
  }, []);

  const createGroup = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      const pickedIds = Object.keys(groupPickIds);
      if (pickedIds.length < 2 || !trimmed) return false;

      const alreadyGrouped = pickedIds.some((id) => groupedSignalIds.has(id));
      if (alreadyGrouped) return false;

      setGroups((prev) => [
        ...prev,
        {
          id: getUuid(),
          name: trimmed,
          signalIds: pickedIds,
          viewMode: 'stacked',
        },
      ]);
      setGroupPickIds({});
      setGroupPickMode(false);
      return true;
    },
    [groupPickIds, groupedSignalIds]
  );

  const deleteGroup = useCallback((groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const setGroupViewMode = useCallback((groupId: string, mode: ViewMode) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, viewMode: mode } : g)));
  }, []);

  const groupPickCount = Object.keys(groupPickIds).length;

  const mainX = plotLeft + mainFrac * plotWidth;
  const diffX = plotLeft + diffFrac * plotWidth;

  return {
    search,
    setSearch,
    added,
    catalog,
    catalogTotal,
    signalsError: signalsQuery.error,
    signalsLoading: catalogLoading,
    addedIds,
    series,
    visibleSeries,
    chartBlocks,
    chartHasDomain,
    isSignalVisible,
    toggleSignalVisible,
    getSignalColor,
    setSignalColor,
    resetSignalColor,
    hasCustomSignalColor,
    groups,
    groupedSignalIds,
    groupPickMode,
    setGroupPickMode,
    groupPickIds,
    groupPickCount,
    toggleGroupPick,
    clearGroupPick,
    createGroup,
    deleteGroup,
    setGroupViewMode,
    hasDomain,
    tMin,
    tSpan,
    fullTMin,
    fullTMax: fullTMax,
    mainTime,
    diffTime,
    mainCursorActive,
    diffCursorActive,
    totalPoints,
    isFetching,
    plotRef,
    width,
    chartHeight,
    plotH,
    diffOn,
    setDiffOn,
    toggleDiffOn,
    clearDiffCursor,
    activateMainCursor,
    activateDiffCursor,
    setDiffFrac,
    setMainFrac,
    resetDiffCursor,
    nudgeMainCursor,
    nudgeDiffCursor,
    placeMainCursorInView,
    placeDiffCursorInView,
    viewMode,
    setViewMode,
    dragTarget,
    setDragTarget,
    svgRef,
    fractionFromClientX,
    stepPath,
    addSignal,
    loadSignals,
    unloadSignals,
    clearLoadedSignals,
    removeSignal,
    xOf,
    yOf,
    mainX,
    diffX,
    plotLeft,
    plotWidth,
    zoomMode,
    setZoomMode,
    handleZoomModeChange,
    resetZoom,
    setTimeWindowFromSeconds,
    zoomTimeAt,
    zoomYAt,
    panView,
    zoomInCenter,
    zoomOutCenter,
    applyBoxZoom,
    applyAxisZoom,
    getYRange,
  };
}
