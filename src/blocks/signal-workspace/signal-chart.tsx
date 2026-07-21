import { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Hand,
  Layers,
  Maximize2,
  MoveHorizontal,
  MoveVertical,
  Ruler,
  Rows3,
  SquareDashed,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';

import {
  formatTimeUs,
  PAD_BOTTOM,
  PAD_TOP,
  STACK_PANEL_MIN_H,
  STACK_TIME_AXIS_H,
  STACK_Y_AXIS_W,
  STACK_INNER_PAD,
  type DragTarget,
  type ChartBlock,
  type Series,
  type ViewMode,
  type YRange,
  type YZoomGeometry,
  type ZoomMode,
  parseSignalChoices,
  valueAt,
} from './use-signal-workspace';

function niceStep(span: number, targetTicks: number): number {
  if (span <= 0) return 1;
  const rough = span / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow;
  if (norm <= 1) return pow;
  if (norm <= 2) return 2 * pow;
  if (norm <= 5) return 5 * pow;
  return 10 * pow;
}

function axisTicks(min: number, max: number, target = 5): number[] {
  const span = max - min || 1;
  const step = niceStep(span, target);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  if (ticks.length === 0) return [min, max];
  return ticks;
}

function formatAxisTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function formatAxisTickAdaptive(value: number, span: number): string {
  if (span < 0.0001) return value.toFixed(6);
  if (span < 0.001) return value.toFixed(5);
  if (span < 0.01) return value.toFixed(4);
  if (span < 0.1) return value.toFixed(3);
  if (span < 1) return value.toFixed(2);
  if (span < 10) return value.toFixed(1);
  return formatAxisTick(value);
}

type YAxisTickPlan = {
  major: number[];
  minor: number[];
};

function buildYAxisTickPlan(
  range: YRange,
  plotH: number,
  choices: Record<number, string> | null,
  dataMin?: number,
  dataMax?: number
): YAxisTickPlan {
  if (choices) {
    const keys = Object.keys(choices)
      .map(Number)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    const inView = keys.filter((v) => v >= range.min - 0.001 && v <= range.max + 0.001);
    if (dataMin !== undefined && dataMax !== undefined) {
      const lo = Math.round(Math.min(dataMin, dataMax));
      const hi = Math.round(Math.max(dataMin, dataMax));
      const neighborPad = lo === hi ? 1 : 0;
      const near = inView.filter((v) => v >= lo - neighborPad && v <= hi + neighborPad);
      if (near.length > 0) return { major: near, minor: [] };
    }
    if (inView.length > 0) return { major: inView, minor: [] };
  }

  const span = range.max - range.min || 1;
  const targetMajors = Math.max(4, Math.min(14, Math.floor(plotH / 22)));
  const major = axisTicks(range.min, range.max, targetMajors);
  if (major.length <= 1) return { major, minor: [] };

  const majorStep = major[1] - major[0];
  const minorDivisions =
    majorStep >= 1 ? 5 : majorStep >= 0.1 ? 5 : majorStep >= 0.01 ? 5 : 10;
  const minorStep = majorStep / minorDivisions;
  const minor: number[] = [];
  const start = Math.ceil(range.min / minorStep) * minorStep;
  const majorEps = minorStep * 0.05;
  for (let v = start; v <= range.max + minorStep * 0.001; v += minorStep) {
    const isMajor = major.some((tick) => Math.abs(tick - v) < majorEps);
    if (!isMajor) minor.push(Number(v.toFixed(12)));
  }
  return { major, minor };
}

function formatTimeAxisSec(sec: number): string {
  const abs = Math.abs(sec);
  if (abs >= 100) return sec.toFixed(0);
  if (abs >= 10) return sec.toFixed(1);
  if (abs >= 1) return sec.toFixed(2);
  return sec.toFixed(3);
}

function TimeAxis({
  plotLeft,
  plotWidth,
  y,
  tMin,
  tSpan,
  fullTMin,
}: {
  plotLeft: number;
  plotWidth: number;
  y: number;
  tMin: number;
  tSpan: number;
  fullTMin: number;
}) {
  const tMax = tMin + tSpan;
  const ticks = axisTicks(tMin, tMax, 10);
  return (
    <>
      {ticks.map((t) => {
        const frac = tSpan > 0 ? (t - tMin) / tSpan : 0;
        const x = plotLeft + frac * plotWidth;
        const sec = (t - fullTMin) / 1_000_000;
        return (
          <g key={`ta-${t}`}>
            <line
              x1={x}
              x2={x}
              y1={y - 4}
              y2={y + 4}
              className="stroke-border/60"
              strokeWidth={1}
            />
            <text
              x={x}
              y={y + 14}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {formatTimeAxisSec(sec)}
            </text>
          </g>
        );
      })}
      <line
        x1={plotLeft}
        x2={plotLeft + plotWidth}
        y1={y}
        y2={y}
        className="stroke-border/60"
        strokeWidth={1}
      />
      <text
        x={plotLeft + plotWidth + 4}
        y={y + 14}
        className="fill-muted-foreground text-[9px]"
      >
        [s]
      </text>
    </>
  );
}

function truncateAxisLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return `${label.slice(0, Math.max(1, maxLen - 1))}…`;
}

function formatYAxisTick(
  value: number,
  choices: Record<number, string> | null,
  span: number
): string {
  if (choices) {
    const label = choices[Math.round(value)];
    if (label) return truncateAxisLabel(label, 14);
  }
  return formatAxisTickAdaptive(value, span);
}

function yValueToPlotY(value: number, range: YRange, y0: number, plotH: number): number {
  const span = range.max - range.min || 1;
  return y0 + ((range.max - value) / span) * plotH;
}

function YPlotGridLines({
  range,
  plotLeft,
  plotWidth,
  y0,
  plotH,
  choices = null,
  dataMin,
  dataMax,
}: {
  range: YRange;
  plotLeft: number;
  plotWidth: number;
  y0: number;
  plotH: number;
  choices?: Record<number, string> | null;
  dataMin?: number;
  dataMax?: number;
}) {
  const plan = buildYAxisTickPlan(range, plotH, choices, dataMin, dataMax);
  return (
    <g pointerEvents="none">
      {plan.minor.map((v) => {
        const y = yValueToPlotY(v, range, y0, plotH);
        return (
          <line
            key={`ymin-${v}`}
            x1={plotLeft}
            x2={plotLeft + plotWidth}
            y1={y}
            y2={y}
            className="stroke-border/25"
            strokeWidth={1}
          />
        );
      })}
      {plan.major.map((v) => {
        const y = yValueToPlotY(v, range, y0, plotH);
        return (
          <line
            key={`ymaj-${v}`}
            x1={plotLeft}
            x2={plotLeft + plotWidth}
            y1={y}
            y2={y}
            className="stroke-border/50"
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

function PlotClipDef({
  id,
  x,
  y,
  width,
  height,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <clipPath id={id}>
      <rect x={x} y={y} width={width} height={height} />
    </clipPath>
  );
}

function YAxisPanel({
  x,
  y0,
  plotH,
  range,
  color,
  choices = null,
  dataMin,
  dataMax,
}: {
  x: number;
  y0: number;
  plotH: number;
  range: YRange;
  color: string;
  choices?: Record<number, string> | null;
  dataMin?: number;
  dataMax?: number;
}) {
  const span = range.max - range.min || 1;
  const plan = buildYAxisTickPlan(range, plotH, choices, dataMin, dataMax);
  const axisLineX = x + STACK_Y_AXIS_W - 1;

  return (
    <g pointerEvents="none">
      <rect
        x={x}
        y={y0}
        width={STACK_Y_AXIS_W}
        height={plotH}
        className="fill-background"
      />
      <line
        x1={axisLineX}
        x2={axisLineX}
        y1={y0}
        y2={y0 + plotH}
        className="stroke-border/70"
        strokeWidth={1}
      />
      {plan.minor.map((v) => {
        const y = yValueToPlotY(v, range, y0, plotH);
        return (
          <line
            key={`ymin-${v}`}
            x1={axisLineX - 3}
            x2={axisLineX}
            y1={y}
            y2={y}
            className="stroke-border/45"
            strokeWidth={1}
          />
        );
      })}
      {plan.major.map((v) => {
        const y = yValueToPlotY(v, range, y0, plotH);
        return (
          <g key={`ymaj-${v}`}>
            <line
              x1={axisLineX - 6}
              x2={axisLineX}
              y1={y}
              y2={y}
              className="stroke-border/70"
              strokeWidth={1}
            />
            <text
              x={axisLineX - 7}
              y={y + 3}
              textAnchor="end"
              className="fill-foreground text-[9px] font-semibold"
            >
              {formatYAxisTick(v, choices, span)}
            </text>
          </g>
        );
      })}
      <rect x={x + 6} y={y0 + 4} width={7} height={7} fill={color} rx={1} />
    </g>
  );
}

function panelClipId(baseId: string, panelIndex: number) {
  return `${baseId}-panel-${panelIndex}`;
}

function StackedContinuousCursors({
  stackHeight,
  mainX,
  diffX,
  showMainCursor,
  showDiffCursor,
  showCursorLine = true,
  series,
  panelH,
  innerPlotH,
  mainTime,
  diffTime,
  getYRange,
  plotClipId,
}: {
  stackHeight: number;
  mainX: number;
  diffX: number;
  showMainCursor: boolean;
  showDiffCursor: boolean;
  showCursorLine?: boolean;
  series: Series[];
  panelH: number;
  innerPlotH: number;
  mainTime: number;
  diffTime: number;
  getYRange: (s: Series) => YRange;
  plotClipId: string;
}) {
  const yOf = (value: number, s: Series, panelIndex: number) => {
    const range = getYRange(s);
    const span = range.max - range.min || 1;
    const y0 = panelIndex * panelH + STACK_INNER_PAD;
    return y0 + innerPlotH - ((value - range.min) / span) * innerPlotH;
  };

  return (
    <g pointerEvents="none">
      {showDiffCursor && (
        <>
          {showCursorLine && (
            <line
              x1={diffX}
              x2={diffX}
              y1={0}
              y2={stackHeight}
              stroke={DIFF_CURSOR_COLOR}
              strokeWidth={1.25}
            />
          )}
          {series.map((s, i) => {
            const v = valueAt(s.points, diffTime);
            if (v === null) return null;
            return (
              <g key={`dc-${s.signal.id}`} clipPath={`url(#${panelClipId(plotClipId, i)})`}>
                <circle
                  cx={diffX}
                  cy={yOf(v, s, i)}
                  r={2.5}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.25}
                />
              </g>
            );
          })}
        </>
      )}
      {showMainCursor && (
        <>
          {showCursorLine && (
            <>
              <line
                x1={mainX}
                x2={mainX}
                y1={0}
                y2={stackHeight}
                stroke={MAIN_CURSOR_COLOR}
                strokeWidth={1.25}
              />
              <polygon
                points={`${mainX - 4},2 ${mainX + 4},2 ${mainX},8`}
                fill={MAIN_CURSOR_COLOR}
              />
            </>
          )}
          {series.map((s, i) => {
            const v = valueAt(s.points, mainTime);
            if (v === null) return null;
            return (
              <g key={`mc-${s.signal.id}`} clipPath={`url(#${panelClipId(plotClipId, i)})`}>
                <circle
                  cx={mainX}
                  cy={yOf(v, s, i)}
                  r={3}
                  fill={s.color}
                  stroke="var(--background)"
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </>
      )}
    </g>
  );
}

const MAIN_CURSOR_COLOR = '#2563eb';
const DIFF_CURSOR_COLOR = '#ef4444';

type DragBox = { x0: number; y0: number; x1: number; y1: number };

type DragZoomState = {
  box: DragBox;
  panelIndex?: number;
};

/** Map CSS pointer position into SVG user space (handles CSS stretch / viewBox). */
function pointerToSvgCoords(
  e: { clientX: number; clientY: number; currentTarget: SVGSVGElement },
  svgWidth: number,
  svgHeight: number
) {
  const rect = e.currentTarget.getBoundingClientRect();
  const rw = rect.width || 1;
  const rh = rect.height || 1;
  return {
    x: ((e.clientX - rect.left) / rw) * svgWidth,
    y: ((e.clientY - rect.top) / rh) * svgHeight,
  };
}

function isDragZoomMode(zoomMode: ZoomMode) {
  return zoomMode === 'box' || zoomMode === 'x' || zoomMode === 'y';
}

function isPanMode(zoomMode: ZoomMode) {
  return zoomMode === 'pan';
}

function zoomDragCursorClass(zoomMode: ZoomMode) {
  return cn(
    (isDragZoomMode(zoomMode) || isPanMode(zoomMode)) && 'touch-none',
    zoomMode === 'box' && 'cursor-crosshair',
    zoomMode === 'x' && 'cursor-ew-resize',
    zoomMode === 'y' && 'cursor-ns-resize',
    zoomMode === 'pan' && 'cursor-grab active:cursor-grabbing'
  );
}

type PanDragState = {
  lastX: number;
  lastY: number;
  panelIndex?: number;
};

function useZoomDragInteraction({
  zoomMode,
  onApply,
  onPan,
  getPanelIndex,
  svgWidth,
  svgHeight,
}: {
  zoomMode: ZoomMode;
  onApply: (box: DragBox, panelIndex?: number) => void;
  onPan?: (deltaX: number, deltaY: number, panelIndex?: number) => void;
  getPanelIndex?: (y: number) => number;
  svgWidth: number;
  svgHeight: number;
}) {
  const [drag, setDrag] = useState<DragZoomState | null>(null);
  const dragRef = useRef<DragZoomState | null>(null);
  const panRef = useRef<PanDragState | null>(null);

  const releaseCapture = useCallback((target: SVGSVGElement, pointerId: number) => {
    try {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
  }, []);

  const clearDrag = useCallback(
    (target: SVGSVGElement, pointerId: number) => {
      dragRef.current = null;
      panRef.current = null;
      setDrag(null);
      releaseCapture(target, pointerId);
    },
    [releaseCapture]
  );

  const pointerHandlers = useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
        if (isPanMode(zoomMode)) {
          if (!onPan) return;
          e.preventDefault();
          const { x, y } = pointerToSvgCoords(e, svgWidth, svgHeight);
          panRef.current = {
            lastX: x,
            lastY: y,
            panelIndex: getPanelIndex?.(y),
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (!isDragZoomMode(zoomMode)) return;
        e.preventDefault();
        const { x, y } = pointerToSvgCoords(e, svgWidth, svgHeight);
        const next: DragZoomState = {
          box: { x0: x, y0: y, x1: x, y1: y },
          panelIndex: getPanelIndex?.(y),
        };
        dragRef.current = next;
        setDrag(next);
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
        if (isPanMode(zoomMode) && panRef.current && onPan) {
          e.preventDefault();
          const { x, y } = pointerToSvgCoords(e, svgWidth, svgHeight);
          const dx = x - panRef.current.lastX;
          const dy = y - panRef.current.lastY;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            onPan(dx, dy, panRef.current.panelIndex);
            panRef.current = { ...panRef.current, lastX: x, lastY: y };
          }
          return;
        }
        const active = dragRef.current;
        if (!active || !isDragZoomMode(zoomMode)) return;
        e.preventDefault();
        const { x: x1, y: y1 } = pointerToSvgCoords(e, svgWidth, svgHeight);
        const next: DragZoomState = {
          ...active,
          box: { ...active.box, x1, y1 },
        };
        dragRef.current = next;
        setDrag(next);
      },
      onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
        if (isPanMode(zoomMode) && panRef.current) {
          clearDrag(e.currentTarget, e.pointerId);
          return;
        }
        const active = dragRef.current;
        if (!active || !isDragZoomMode(zoomMode)) return;
        const { x: x1, y: y1 } = pointerToSvgCoords(e, svgWidth, svgHeight);
        onApply({ ...active.box, x1, y1 }, active.panelIndex);
        clearDrag(e.currentTarget, e.pointerId);
      },
      onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => {
        if (dragRef.current || panRef.current) clearDrag(e.currentTarget, e.pointerId);
      },
    }),
    [zoomMode, onApply, onPan, getPanelIndex, clearDrag, svgWidth, svgHeight]
  );

  return { drag, pointerHandlers };
}

function ZoomSelectionOverlay({
  box,
  zoomMode,
  plotLeft,
  plotWidth,
  height,
}: {
  box: DragBox;
  zoomMode: ZoomMode;
  plotLeft: number;
  plotWidth: number;
  height: number;
}) {
  const x0 = Math.min(box.x0, box.x1);
  const x1 = Math.max(box.x0, box.x1);
  const y0 = Math.min(box.y0, box.y1);
  const y1 = Math.max(box.y0, box.y1);

  if (zoomMode === 'x') {
    const x = Math.max(plotLeft, x0);
    const w = Math.min(plotLeft + plotWidth, x1) - x;
    if (w <= 0) return null;
    return (
      <rect
        x={x}
        y={0}
        width={w}
        height={height}
        fill="rgba(37,99,235,0.14)"
        stroke={MAIN_CURSOR_COLOR}
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />
    );
  }

  if (zoomMode === 'y') {
    const h = y1 - y0;
    if (h <= 0) return null;
    return (
      <rect
        x={plotLeft}
        y={y0}
        width={plotWidth}
        height={h}
        fill="rgba(239,68,68,0.14)"
        stroke={DIFF_CURSOR_COLOR}
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />
    );
  }

  return (
    <rect
      x={x0}
      y={y0}
      width={Math.abs(box.x1 - box.x0)}
      height={Math.abs(box.y1 - box.y0)}
      fill="rgba(59,130,246,0.12)"
      stroke="#3b82f6"
      strokeWidth={1}
      strokeDasharray="4 2"
      pointerEvents="none"
    />
  );
}

function ZoomToolbar({
  zoomMode,
  onZoomModeChange,
  onResetZoom,
  onZoomIn,
  onZoomOut,
}: {
  zoomMode: ZoomMode;
  onZoomModeChange: (mode: ZoomMode) => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const tools: { mode: ZoomMode; icon: typeof SquareDashed; label: string }[] = [
    { mode: 'pan', icon: Hand, label: m['analyses.zoom_pan']() },
    { mode: 'box', icon: SquareDashed, label: m['analyses.zoom_box']() },
    { mode: 'x', icon: MoveHorizontal, label: m['analyses.zoom_x']() },
    { mode: 'y', icon: MoveVertical, label: m['analyses.zoom_y']() },
  ];
  return (
    <div className="bg-muted/50 flex items-center gap-0.5 rounded-md border p-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        title={m['analyses.zoom_reset']()}
        onClick={onResetZoom}
      >
        <Maximize2 className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        title={m['analyses.shortcuts.zoom_in']()}
        onClick={onZoomIn}
      >
        <ZoomIn className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        title={m['analyses.shortcuts.zoom_out']()}
        onClick={onZoomOut}
      >
        <ZoomOut className="size-3.5" />
      </Button>
      {tools.map(({ mode, icon: Icon, label }) => (
        <Button
          key={mode}
          type="button"
          size="sm"
          variant={zoomMode === mode ? 'default' : 'ghost'}
          className="h-7 px-2"
          title={label}
          onClick={() => onZoomModeChange(mode)}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  );
}

function CursorToolbar({
  showMainCursor,
  showDiffCursor,
  onMainCursor,
  onDiffCursor,
}: {
  showMainCursor: boolean;
  showDiffCursor: boolean;
  onMainCursor: () => void;
  onDiffCursor: () => void;
}) {
  return (
    <div className="bg-muted/50 flex items-center gap-0.5 rounded-md border p-0.5">
      <Button
        type="button"
        size="sm"
        variant={showMainCursor ? 'default' : 'ghost'}
        className="h-7 px-2"
        title={m['analyses.signals_main_cursor']()}
        onClick={onMainCursor}
      >
        <Crosshair className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={showDiffCursor ? 'default' : 'ghost'}
        className="h-7 px-2"
        title={m['analyses.signals_diff_cursor']()}
        onClick={onDiffCursor}
      >
        <Ruler className="size-3.5" />
      </Button>
    </div>
  );
}

function CursorHandles({
  width,
  plotH,
  mainX,
  diffX,
  showMainCursor,
  showDiffCursor,
  onDragStart,
  padTop = PAD_TOP,
}: {
  width: number;
  plotH: number;
  mainX: number;
  diffX: number;
  showMainCursor: boolean;
  showDiffCursor: boolean;
  onDragStart: (target: DragTarget) => void;
  padTop?: number;
}) {
  const hitW = 14;
  return (
    <>
      {showDiffCursor && (
        <rect
          x={diffX - hitW / 2}
          y={padTop - 8}
          width={hitW}
          height={plotH + 8}
          fill="transparent"
          className="cursor-ew-resize"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragStart('diff');
          }}
        />
      )}
      {showMainCursor && (
        <rect
          x={mainX - hitW / 2}
          y={padTop - 10}
          width={hitW}
          height={plotH + 10}
          fill="transparent"
          className="cursor-ew-resize"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragStart('main');
          }}
        />
      )}
    </>
  );
}

function ChartGrid({
  chartHeight,
  plotH,
  tMin,
  tSpan,
  plotLeft = 0,
  plotWidth,
  showTimeLabels = true,
}: {
  chartHeight: number;
  plotH: number;
  tMin: number;
  tSpan: number;
  plotLeft?: number;
  plotWidth: number;
  showTimeLabels?: boolean;
}) {
  const pl = plotLeft;
  const pw = plotWidth;
  return (
    <g pointerEvents="none">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = pl + (pw / 5) * i;
        const t = tMin + (tSpan / 5) * i;
        return (
          <g key={`v-${i}`}>
            <line
              x1={x}
              x2={x}
              y1={PAD_TOP}
              y2={PAD_TOP + plotH}
              className="stroke-border/40"
              strokeWidth={1}
            />
            {showTimeLabels && (
              <text
                x={Math.min(Math.max(x, pl + 16), pl + pw - 16)}
                y={chartHeight - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {formatTimeUs(t - tMin)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function CursorMarkers({
  series,
  plotH,
  mainX,
  diffX,
  mainTime,
  diffTime,
  showMainCursor,
  showDiffCursor,
  showCursorLine = true,
  yOf,
}: {
  series: Series[];
  plotH: number;
  mainX: number;
  diffX: number;
  mainTime: number;
  diffTime: number;
  showMainCursor: boolean;
  showDiffCursor: boolean;
  showCursorLine?: boolean;
  yOf: (value: number, s: Series) => number;
}) {
  return (
    <>
      {showDiffCursor && (
        <g pointerEvents="none">
          {showCursorLine && (
            <line
              x1={diffX}
              x2={diffX}
              y1={PAD_TOP - 6}
              y2={PAD_TOP + plotH}
              stroke={DIFF_CURSOR_COLOR}
              strokeWidth={1.5}
            />
          )}
          {series.map((s) => {
            const v = valueAt(s.points, diffTime);
            if (v === null) return null;
            return (
              <circle
                key={`dc-${s.signal.id}`}
                cx={diffX}
                cy={yOf(v, s)}
                r={3}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      )}

      {showMainCursor && (
        <g pointerEvents="none">
          {showCursorLine && (
            <>
              <line
                x1={mainX}
                x2={mainX}
                y1={PAD_TOP - 6}
                y2={PAD_TOP + plotH}
                stroke={MAIN_CURSOR_COLOR}
                strokeWidth={1.5}
              />
              <polygon
                points={`${mainX - 5},${PAD_TOP - 10} ${mainX + 5},${PAD_TOP - 10} ${mainX},${PAD_TOP - 3}`}
                fill={MAIN_CURSOR_COLOR}
              />
            </>
          )}
          {series.map((s) => {
            const v = valueAt(s.points, mainTime);
            if (v === null) return null;
            return (
              <circle
                key={`mc-${s.signal.id}`}
                cx={mainX}
                cy={yOf(v, s)}
                r={3.5}
                fill={s.color}
                stroke="var(--background)"
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      )}
    </>
  );
}

/** Full-height cursor lines + drag handles spanning the entire plot area (used for grouped layouts). */
function FullViewCursorOverlay({
  width,
  height,
  mainX,
  diffX,
  showMainCursor,
  showDiffCursor,
  onDragStart,
}: {
  width: number;
  height: number;
  mainX: number;
  diffX: number;
  showMainCursor: boolean;
  showDiffCursor: boolean;
  onDragStart: (target: DragTarget) => void;
}) {
  if (!showMainCursor && !showDiffCursor) return null;
  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 z-20"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {showDiffCursor && (
        <line
          x1={diffX}
          x2={diffX}
          y1={0}
          y2={height}
          stroke={DIFF_CURSOR_COLOR}
          strokeWidth={1.5}
          pointerEvents="none"
        />
      )}
      {showMainCursor && (
        <>
          <line
            x1={mainX}
            x2={mainX}
            y1={0}
            y2={height}
            stroke={MAIN_CURSOR_COLOR}
            strokeWidth={1.5}
            pointerEvents="none"
          />
          <polygon
            points={`${mainX - 5},2 ${mainX + 5},2 ${mainX},9`}
            fill={MAIN_CURSOR_COLOR}
            pointerEvents="none"
          />
        </>
      )}
      <CursorHandles
        width={width}
        plotH={height}
        mainX={mainX}
        diffX={diffX}
        showMainCursor={showMainCursor}
        showDiffCursor={showDiffCursor}
        onDragStart={onDragStart}
        padTop={0}
      />
    </svg>
  );
}

function OverlayChart({
  svgRef,
  width,
  chartHeight,
  plotH,
  series,
  tMin,
  tSpan,
  stepPath,
  yOf,
  mainX,
  diffX,
  mainTime,
  diffTime,
  showMainCursor,
  showDiffCursor,
  showCursorLine = true,
  showCursorHandles = true,
  showTimeAxis = true,
  zoomMode,
  getYRange,
  onDragStart,
  onBoxZoom,
  onAxisZoom,
  onWheelZoom,
  onPan,
}: {
  svgRef: React.RefObject<SVGSVGElement | null>;
  width: number;
  chartHeight: number;
  plotH: number;
  series: Series[];
  tMin: number;
  tSpan: number;
  stepPath: (s: Series) => string;
  yOf: (value: number, s: Series) => number;
  mainX: number;
  diffX: number;
  mainTime: number;
  diffTime: number;
  showMainCursor: boolean;
  showDiffCursor: boolean;
  showCursorLine?: boolean;
  showCursorHandles?: boolean;
  showTimeAxis?: boolean;
  zoomMode: ZoomMode;
  getYRange: (s: Series) => YRange;
  onDragStart: (target: DragTarget) => void;
  onBoxZoom: (x0: number, x1: number, y0: number, y1: number, yGeometry?: YZoomGeometry) => void;
  onAxisZoom: (
    axis: 'x' | 'y',
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    signalId?: string,
    yGeometry?: YZoomGeometry
  ) => void;
  onWheelZoom: (x: number, y: number, deltaY: number) => void;
  onPan: (deltaX: number, deltaY: number) => void;
}) {
  const plotLeft = STACK_Y_AXIS_W;
  const plotWidth = Math.max(1, width - plotLeft);
  const axisSignal = series[0];
  const axisRange = axisSignal ? getYRange(axisSignal) : { min: 0, max: 1 };
  const axisChoices = axisSignal ? parseSignalChoices(axisSignal.signal) : null;

  const yGeometry = useMemo<YZoomGeometry>(
    () => ({
      plotTop: PAD_TOP,
      plotHeight: Math.max(1, plotH),
      rangeSeries: series,
    }),
    [plotH, series]
  );

  const applyZoomDrag = useCallback(
    (box: DragBox) => {
      if (zoomMode === 'box') {
        onBoxZoom(box.x0, box.x1, box.y0, box.y1, yGeometry);
      } else if (zoomMode === 'x') {
        onAxisZoom('x', box.x0, box.x1, box.y0, box.y1);
      } else if (zoomMode === 'y') {
        onAxisZoom('y', box.x0, box.x1, box.y0, box.y1, undefined, yGeometry);
      }
    },
    [zoomMode, onBoxZoom, onAxisZoom, yGeometry]
  );

  const { drag, pointerHandlers } = useZoomDragInteraction({
    zoomMode,
    onApply: applyZoomDrag,
    onPan: (dx, dy) => onPan(dx, dy),
    svgWidth: width,
    svgHeight: chartHeight,
  });
  const plotClipId = useId();

  return (
    <svg
      ref={svgRef}
      width={width}
      height={chartHeight}
      viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, chartHeight)}`}
      preserveAspectRatio="none"
      className={cn('h-full w-full select-none', zoomDragCursorClass(zoomMode))}
      role="img"
      aria-label="signal-chart"
      onWheel={(e) => {
        if (zoomMode !== 'x' && zoomMode !== 'y' && zoomMode !== 'pan') return;
        e.preventDefault();
        const { x, y } = pointerToSvgCoords(e, width, chartHeight);
        onWheelZoom(x, y, e.deltaY);
      }}
      {...pointerHandlers}
    >
      <defs>
        <PlotClipDef
          id={plotClipId}
          x={plotLeft}
          y={PAD_TOP}
          width={plotWidth}
          height={plotH}
        />
      </defs>

      <g clipPath={`url(#${plotClipId})`}>
        {axisSignal && (
          <YPlotGridLines
            range={axisRange}
            plotLeft={plotLeft}
            plotWidth={plotWidth}
            y0={PAD_TOP}
            plotH={plotH}
            choices={axisChoices}
            dataMin={axisSignal.yMin}
            dataMax={axisSignal.yMax}
          />
        )}

        <ChartGrid
          chartHeight={chartHeight}
          plotH={plotH}
          tMin={tMin}
          tSpan={tSpan}
          plotLeft={plotLeft}
          plotWidth={plotWidth}
          showTimeLabels={showTimeAxis}
        />

        {series.map((s) => (
          <path
            key={s.signal.id}
            d={stepPath(s)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ))}

        <CursorMarkers
          series={series}
          plotH={plotH}
          mainX={mainX}
          diffX={diffX}
          mainTime={mainTime}
          diffTime={diffTime}
          showMainCursor={showMainCursor}
          showDiffCursor={showDiffCursor}
          showCursorLine={showCursorLine}
          yOf={yOf}
        />
      </g>

      {axisSignal && (
        <YAxisPanel
          x={0}
          y0={PAD_TOP}
          plotH={plotH}
          range={axisRange}
          color={axisSignal.color}
          choices={axisChoices}
          dataMin={axisSignal.yMin}
          dataMax={axisSignal.yMax}
        />
      )}

      {showCursorHandles && (showMainCursor || showDiffCursor) && (
        <CursorHandles
          width={width}
          plotH={plotH}
          mainX={mainX}
          diffX={diffX}
          showMainCursor={showMainCursor}
          showDiffCursor={showDiffCursor}
          onDragStart={onDragStart}
        />
      )}

      {drag && (
        <ZoomSelectionOverlay
          box={drag.box}
          zoomMode={zoomMode}
          plotLeft={plotLeft}
          plotWidth={plotWidth}
          height={chartHeight}
        />
      )}
    </svg>
  );
}

function StackedChart({
  width,
  chartHeight,
  series,
  tMin,
  tSpan,
  fullTMin,
  mainX,
  diffX,
  mainTime,
  diffTime,
  showMainCursor,
  showDiffCursor,
  showCursorLine = true,
  showCursorHandles = true,
  showTimeAxis = true,
  zoomMode,
  getYRange,
  onDragStart,
  onBoxZoom,
  onAxisZoom,
  onWheelZoom,
  onPan,
  zoomTimeAt,
  zoomYAt,
}: {
  width: number;
  chartHeight: number;
  series: Series[];
  tMin: number;
  tSpan: number;
  fullTMin: number;
  mainX: number;
  diffX: number;
  mainTime: number;
  diffTime: number;
  showMainCursor: boolean;
  showDiffCursor: boolean;
  showCursorLine?: boolean;
  showCursorHandles?: boolean;
  showTimeAxis?: boolean;
  zoomMode: ZoomMode;
  getYRange: (s: Series) => YRange;
  onDragStart: (target: DragTarget) => void;
  onBoxZoom: (x0: number, x1: number, y0: number, y1: number, signalId?: string, yGeometry?: YZoomGeometry) => void;
  onAxisZoom: (
    axis: 'x' | 'y',
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    signalId?: string,
    yGeometry?: YZoomGeometry
  ) => void;
  onWheelZoom: (x: number, y: number, deltaY: number, signalId?: string, plotH?: number) => void;
  onPan: (deltaX: number, deltaY: number, panelIndex?: number) => void;
  zoomTimeAt: (centerFrac: number, factor: number) => void;
  zoomYAt: (frac: number, factor: number, signalId?: string, rangeSeries?: Series[]) => void;
}) {
  const plotLeft = STACK_Y_AXIS_W;
  const plotWidth = Math.max(1, width - plotLeft);
  const timeAxisReserve = showTimeAxis ? STACK_TIME_AXIS_H : 0;
  const availableH = Math.max(STACK_PANEL_MIN_H, chartHeight - timeAxisReserve);
  const panelH = Math.max(
    STACK_PANEL_MIN_H,
    Math.floor(availableH / Math.max(series.length, 1))
  );
  const innerPlotH = panelH - STACK_INNER_PAD * 2;
  const stackHeight = series.length * panelH;
  const totalH = stackHeight + timeAxisReserve;

  const xOf = (t: number) => plotLeft + ((t - tMin) / tSpan) * plotWidth;

  const panelIndexAt = useCallback(
    (y: number) => Math.min(series.length - 1, Math.max(0, Math.floor(y / panelH))),
    [series.length, panelH]
  );

  const applyZoomDrag = useCallback(
    (box: DragBox, panelIndex?: number) => {
      const idx = panelIndex ?? panelIndexAt(box.y0);
      const sig = series[idx];
      const plotTop = idx * panelH + STACK_INNER_PAD;
      const yGeometry: YZoomGeometry = {
        plotTop,
        plotHeight: Math.max(1, innerPlotH),
        rangeSeries: series,
      };
      if (zoomMode === 'box') {
        onBoxZoom(box.x0, box.x1, box.y0, box.y1, sig?.signal.id, yGeometry);
      } else if (zoomMode === 'x') {
        onAxisZoom('x', box.x0, box.x1, box.y0, box.y1);
      } else if (zoomMode === 'y') {
        onAxisZoom('y', box.x0, box.x1, box.y0, box.y1, sig?.signal.id, yGeometry);
      }
    },
    [zoomMode, series, panelIndexAt, panelH, innerPlotH, onBoxZoom, onAxisZoom]
  );

  const { drag, pointerHandlers } = useZoomDragInteraction({
    zoomMode,
    onApply: applyZoomDrag,
    onPan: (dx, dy, panelIndex) => onPan(dx, dy, panelIndex),
    getPanelIndex: panelIndexAt,
    svgWidth: width,
    svgHeight: totalH,
  });
  const plotClipId = useId();

  const stackedPaths = useMemo(() => {
    return series.map((s, panelIndex) => {
      const range = getYRange(s);
      const span = range.max - range.min || 1;
      const y0 = panelIndex * panelH + STACK_INNER_PAD;
      const yOfLocal = (value: number) =>
        y0 + innerPlotH - ((value - range.min) / span) * innerPlotH;
      if (!s.points.length) return '';
      let d = `M${xOf(s.points[0][0]).toFixed(2)},${yOfLocal(s.points[0][1]).toFixed(2)}`;
      for (let i = 1; i < s.points.length; i += 1) {
        const px = xOf(s.points[i][0]).toFixed(2);
        const prevY = yOfLocal(s.points[i - 1][1]).toFixed(2);
        const curY = yOfLocal(s.points[i][1]).toFixed(2);
        d += `L${px},${prevY}L${px},${curY}`;
      }
      return d;
    });
  }, [series, panelH, innerPlotH, tMin, tSpan, plotWidth, plotLeft, getYRange]);

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (zoomMode !== 'x' && zoomMode !== 'y' && zoomMode !== 'pan') return;
    e.preventDefault();
    const { x, y } = pointerToSvgCoords(e, width, totalH);
    const normalizedDelta = Math.max(-240, Math.min(240, e.deltaY));
    const factor = Math.exp(normalizedDelta * 0.0008);
    if (zoomMode === 'x' || zoomMode === 'pan') {
      const frac = plotWidth > 0 ? (x - plotLeft) / plotWidth : 0.5;
      zoomTimeAt(Math.min(1, Math.max(0, frac)), factor);
    } else {
      const idx = panelIndexAt(y);
      const sig = series[idx];
      const y0 = idx * panelH + STACK_INNER_PAD;
      const frac = innerPlotH > 0 ? (y - y0) / innerPlotH : 0.5;
      zoomYAt(Math.min(1, Math.max(0, frac)), factor, sig?.signal.id, series);
    }
  };

  const needsScroll = totalH > chartHeight;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        needsScroll && 'overflow-y-auto overflow-x-hidden'
      )}
    >
      <svg
        width={width}
        height={totalH}
        viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, totalH)}`}
        preserveAspectRatio="none"
        className={cn('w-full shrink-0 select-none', zoomDragCursorClass(zoomMode))}
        onWheel={handleWheel}
        {...pointerHandlers}
      >
        <defs>
          <PlotClipDef
            id={plotClipId}
            x={plotLeft}
            y={0}
            width={plotWidth}
            height={stackHeight}
          />
          {series.map((s, i) => (
            <PlotClipDef
              key={`panel-clip-${s.signal.id}`}
              id={panelClipId(plotClipId, i)}
              x={plotLeft}
              y={i * panelH + STACK_INNER_PAD}
              width={plotWidth}
              height={innerPlotH}
            />
          ))}
        </defs>

        <g clipPath={`url(#${plotClipId})`}>
          {series.map((s, i) => {
            const y0 = i * panelH;
            const range = getYRange(s);
            return (
              <g key={s.signal.id}>
                <rect
                  x={plotLeft}
                  y={y0}
                  width={plotWidth}
                  height={panelH}
                  className={i % 2 === 0 ? 'fill-transparent' : 'fill-muted/10'}
                  pointerEvents="none"
                />
                <g clipPath={`url(#${panelClipId(plotClipId, i)})`}>
                  <YPlotGridLines
                    range={range}
                    plotLeft={plotLeft}
                    plotWidth={plotWidth}
                    y0={y0 + STACK_INNER_PAD}
                    plotH={innerPlotH}
                    choices={parseSignalChoices(s.signal)}
                    dataMin={s.yMin}
                    dataMax={s.yMax}
                  />
                  <path
                    d={stackedPaths[i]}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                </g>
              </g>
            );
          })}

          <StackedContinuousCursors
            stackHeight={stackHeight}
            mainX={mainX}
            diffX={diffX}
            showMainCursor={showMainCursor}
            showDiffCursor={showDiffCursor}
            showCursorLine={showCursorLine}
            series={series}
            panelH={panelH}
            innerPlotH={innerPlotH}
            mainTime={mainTime}
            diffTime={diffTime}
            getYRange={getYRange}
            plotClipId={plotClipId}
          />
        </g>

        {series.map((s, i) => {
          const y0 = i * panelH;
          return (
            <line
              key={`panel-divider-${s.signal.id}`}
              x1={0}
              x2={width}
              y1={y0 + panelH}
              y2={y0 + panelH}
              className="stroke-border"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          );
        })}

        <g aria-label="y-axes">
          {series.map((s, i) => {
            const y0 = i * panelH;
            return (
              <YAxisPanel
                key={`axis-${s.signal.id}`}
                x={0}
                y0={y0 + STACK_INNER_PAD}
                plotH={innerPlotH}
                range={getYRange(s)}
                color={s.color}
                choices={parseSignalChoices(s.signal)}
                dataMin={s.yMin}
                dataMax={s.yMax}
              />
            );
          })}
        </g>

        {showCursorHandles && (showMainCursor || showDiffCursor) && (
          <CursorHandles
            width={width}
            plotH={stackHeight}
            mainX={mainX}
            diffX={diffX}
            showMainCursor={showMainCursor}
            showDiffCursor={showDiffCursor}
            onDragStart={onDragStart}
            padTop={2}
          />
        )}

        {showTimeAxis && (
          <TimeAxis
            plotLeft={plotLeft}
            plotWidth={plotWidth}
            y={stackHeight + 6}
            tMin={tMin}
            tSpan={tSpan}
            fullTMin={fullTMin}
          />
        )}

        <line
          x1={plotLeft}
          x2={plotLeft}
          y1={0}
          y2={stackHeight}
          className="stroke-border/60"
          strokeWidth={1}
        />
        <line
          x1={plotLeft}
          x2={width}
          y1={stackHeight}
          y2={stackHeight}
          className="stroke-border/60"
          strokeWidth={1}
        />

        {drag && (
          <ZoomSelectionOverlay
            box={drag.box}
            zoomMode={zoomMode}
            plotLeft={plotLeft}
            plotWidth={plotWidth}
            height={stackHeight}
          />
        )}
      </svg>
    </div>
  );
}

const GROUP_TITLE_H = 28;

function blockPlotMetrics(
  width: number,
  mainFrac: number,
  diffFrac: number
) {
  const plotLeft = STACK_Y_AXIS_W;
  const plotWidth = Math.max(1, width - plotLeft);
  return {
    plotLeft,
    plotWidth,
    mainX: plotLeft + mainFrac * plotWidth,
    diffX: plotLeft + diffFrac * plotWidth,
  };
}

function makeOverlayPlotHelpers(
  width: number,
  plotH: number,
  tMin: number,
  tSpan: number,
  getYRange: (s: Series) => YRange
) {
  const plotLeft = STACK_Y_AXIS_W;
  const plotWidth = Math.max(1, width - plotLeft);
  const xOf = (t: number) => plotLeft + ((t - tMin) / tSpan) * plotWidth;
  const yOf = (value: number, s: Series) => {
    const range = getYRange(s);
    const span = range.max - range.min || 1;
    return PAD_TOP + plotH - ((value - range.min) / span) * plotH;
  };
  const stepPath = (s: Series) => {
    if (!s.points.length || tSpan <= 0) return '';
    let d = `M${xOf(s.points[0][0]).toFixed(2)},${yOf(s.points[0][1], s).toFixed(2)}`;
    for (let i = 1; i < s.points.length; i += 1) {
      const px = xOf(s.points[i][0]).toFixed(2);
      const prevY = yOf(s.points[i - 1][1], s).toFixed(2);
      const curY = yOf(s.points[i][1], s).toFixed(2);
      d += `L${px},${prevY}L${px},${curY}`;
    }
    return d;
  };
  return { stepPath, yOf };
}

function makeOverlayGetYRange(
  getYRange: (s: Series, opts?: { preferOverlayRange?: boolean }) => YRange
): (s: Series) => YRange {
  return (s: Series) => getYRange(s, { preferOverlayRange: true });
}

function distributeBlockHeights(blocks: ChartBlock[], chartHeight: number): number[] {
  const titlesTotal = blocks.reduce((sum, block) => sum + (block.title ? GROUP_TITLE_H : 0), 0);
  const chartsTotal = Math.max(
    blocks.length * 100,
    chartHeight - titlesTotal - STACK_TIME_AXIS_H
  );
  const base = Math.floor(chartsTotal / blocks.length);
  const heights = blocks.map(() => base);
  let remainder = chartsTotal - base * blocks.length;
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) {
    heights[i % blocks.length] += 1;
  }
  return heights;
}

/** Shared time axis pinned to the bottom of grouped chart layouts. */
function GroupedBottomTimeAxis({
  width,
  tMin,
  tSpan,
  fullTMin,
}: {
  width: number;
  tMin: number;
  tSpan: number;
  fullTMin: number;
}) {
  const plotLeft = STACK_Y_AXIS_W;
  const plotWidth = Math.max(1, width - plotLeft);
  return (
    <svg
      className="bg-muted/15 border-border/40 shrink-0 border-t"
      width={width}
      height={STACK_TIME_AXIS_H}
      viewBox={`0 0 ${Math.max(1, width)} ${STACK_TIME_AXIS_H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <TimeAxis
        plotLeft={plotLeft}
        plotWidth={plotWidth}
        y={6}
        tMin={tMin}
        tSpan={tSpan}
        fullTMin={fullTMin}
      />
    </svg>
  );
}

function GroupedChartSections({
  blocks,
  chartHeight,
  width,
  svgRef,
  tMin,
  tSpan,
  fullTMin,
  mainFrac,
  diffFrac,
  mainTime,
  diffTime,
  showMainCursor,
  showDiffCursor,
  zoomMode,
  onDragStart,
  getYRange,
  zoomTimeAt,
  zoomYAt,
  panView,
  applyBoxZoom,
  applyAxisZoom,
}: {
  blocks: ChartBlock[];
  chartHeight: number;
  width: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
  tMin: number;
  tSpan: number;
  fullTMin: number;
  mainFrac: number;
  diffFrac: number;
  mainTime: number;
  diffTime: number;
  showMainCursor: boolean;
  showDiffCursor: boolean;
  zoomMode: ZoomMode;
  onDragStart: (target: DragTarget) => void;
  getYRange: (s: Series, opts?: { preferOverlayRange?: boolean }) => YRange;
  zoomTimeAt: (centerFrac: number, factor: number) => void;
  zoomYAt: (frac: number, factor: number, signalId?: string, rangeSeries?: Series[]) => void;
  panView: (
    deltaPxX: number,
    deltaPxY: number,
    opts: {
      plotWidth: number;
      plotHeight: number;
      viewMode?: ViewMode;
      signalId?: string;
      rangeSeries?: Series[];
    }
  ) => void;
  applyBoxZoom: (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    signalId?: string,
    modeOverride?: ViewMode,
    yGeometry?: YZoomGeometry
  ) => void;
  applyAxisZoom: (
    axis: 'x' | 'y',
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    signalId?: string,
    modeOverride?: ViewMode,
    yGeometry?: YZoomGeometry
  ) => void;
}) {
  const blockHeights = distributeBlockHeights(blocks, chartHeight);
  const plotWidthForPan = Math.max(1, width - STACK_Y_AXIS_W);

  const handleWheelZoom = (
    x: number,
    y: number,
    deltaY: number,
    signalId?: string,
    innerPlotH?: number,
    rangeSeries?: Series[]
  ) => {
    const normalizedDelta = Math.max(-240, Math.min(240, deltaY));
    const factor = Math.exp(normalizedDelta * 0.0008);
    const plotLeft = STACK_Y_AXIS_W;
    const plotWidth = Math.max(1, width - plotLeft);
    if ((zoomMode === 'x' || zoomMode === 'pan') && plotWidth > 0) {
      zoomTimeAt((x - plotLeft) / plotWidth, factor);
    } else if (zoomMode === 'y') {
      const plotHeight = innerPlotH ?? Math.max(1, (blockHeights[0] ?? chartHeight) - PAD_TOP - PAD_BOTTOM);
      const frac = plotHeight > 0 ? (y - PAD_TOP) / plotHeight : 0.5;
      zoomYAt(Math.min(1, Math.max(0, frac)), factor, signalId, rangeSeries);
    }
  };

  const makeBlockPanHandler = (
    block: ChartBlock,
    plotHeight: number
  ) =>
    (deltaX: number, deltaY: number, panelIndex?: number) => {
      panView(deltaX, deltaY, {
        plotWidth: plotWidthForPan,
        plotHeight,
        viewMode: block.viewMode,
        signalId:
          panelIndex != null ? block.series[panelIndex]?.signal.id : undefined,
        rangeSeries: block.series,
      });
    };

  const { mainX: overlayMainX, diffX: overlayDiffX } = blockPlotMetrics(
    width,
    mainFrac,
    diffFrac
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {blocks.map((block, index) => {
          const blockHeight = blockHeights[index] ?? Math.floor(chartHeight / blocks.length);
          const titleH = block.title ? GROUP_TITLE_H : 0;
          const innerChartHeight = Math.max(STACK_PANEL_MIN_H, blockHeight - titleH);
          const blockPlotH = innerChartHeight - PAD_TOP - PAD_BOTTOM;
          const overlayGetYRange = makeOverlayGetYRange(getYRange);
          const overlayPlot = makeOverlayPlotHelpers(
            width,
            blockPlotH,
            tMin,
            tSpan,
            overlayGetYRange
          );

          return (
            <div
              key={block.id}
              className="flex min-h-0 flex-col border-border/40 border-b last:border-b-0"
              style={{ flex: `${blockHeight} 1 0` }}
            >
              {block.title && (
                <div
                  className="bg-muted/25 text-foreground border-border/40 shrink-0 border-b px-3 py-1 text-xs font-medium"
                  style={{ minHeight: GROUP_TITLE_H }}
                >
                  {block.title}
                </div>
              )}
              <div className="relative min-h-0 flex-1">
                {block.viewMode === 'stacked' ? (
                  <StackedChart
                    width={width}
                    chartHeight={innerChartHeight}
                    series={block.series}
                    tMin={tMin}
                    tSpan={tSpan}
                    fullTMin={fullTMin}
                    mainX={overlayMainX}
                    diffX={overlayDiffX}
                    mainTime={mainTime}
                    diffTime={diffTime}
                    showMainCursor={showMainCursor}
                    showDiffCursor={showDiffCursor}
                    showCursorLine={false}
                    showCursorHandles={false}
                    showTimeAxis={false}
                    zoomMode={zoomMode}
                    getYRange={getYRange}
                    onDragStart={onDragStart}
                    onBoxZoom={(x0, x1, y0, y1, signalId, yGeometry) =>
                      applyBoxZoom(x0, x1, y0, y1, signalId, 'stacked', yGeometry)
                    }
                    onAxisZoom={(axis, x0, x1, y0, y1, signalId, yGeometry) =>
                      applyAxisZoom(axis, x0, x1, y0, y1, signalId, 'stacked', yGeometry)
                    }
                    onWheelZoom={(x, y, deltaY, signalId, innerPlotH) =>
                      handleWheelZoom(x, y, deltaY, signalId, innerPlotH, block.series)
                    }
                    onPan={makeBlockPanHandler(block, blockPlotH)}
                    zoomTimeAt={zoomTimeAt}
                    zoomYAt={zoomYAt}
                  />
                ) : (
                  <OverlayChart
                    svgRef={index === 0 ? svgRef : { current: null }}
                    width={width}
                    chartHeight={innerChartHeight}
                    plotH={blockPlotH}
                    series={block.series}
                    tMin={tMin}
                    tSpan={tSpan}
                    stepPath={overlayPlot.stepPath}
                    yOf={overlayPlot.yOf}
                    mainX={overlayMainX}
                    diffX={overlayDiffX}
                    mainTime={mainTime}
                    diffTime={diffTime}
                    showMainCursor={showMainCursor}
                    showDiffCursor={showDiffCursor}
                    showCursorLine={false}
                    showCursorHandles={false}
                    showTimeAxis={false}
                    zoomMode={zoomMode}
                    getYRange={overlayGetYRange}
                    onDragStart={onDragStart}
                    onBoxZoom={(x0, x1, y0, y1, yGeometry) =>
                      applyBoxZoom(x0, x1, y0, y1, undefined, 'overlay', yGeometry)
                    }
                    onAxisZoom={(axis, x0, x1, y0, y1, signalId, yGeometry) =>
                      applyAxisZoom(axis, x0, x1, y0, y1, signalId, 'overlay', yGeometry)
                    }
                    onWheelZoom={(x, y, deltaY) =>
                      handleWheelZoom(x, y, deltaY, undefined, blockPlotH, block.series)
                    }
                    onPan={makeBlockPanHandler(block, blockPlotH)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <GroupedBottomTimeAxis
        width={width}
        tMin={tMin}
        tSpan={tSpan}
        fullTMin={fullTMin}
      />

      <FullViewCursorOverlay
        width={width}
        height={Math.max(1, chartHeight - STACK_TIME_AXIS_H)}
        mainX={overlayMainX}
        diffX={overlayDiffX}
        showMainCursor={showMainCursor}
        showDiffCursor={showDiffCursor}
        onDragStart={onDragStart}
      />
    </div>
  );
}

export function SignalChart({
  plotRef,
  svgRef,
  width,
  chartHeight,
  plotH,
  series,
  hasDomain,
  tMin,
  tSpan,
  fullTMin,
  addedCount,
  viewMode,
  onViewModeChange,
  showMainCursor,
  showDiffCursor,
  onMainCursor,
  onDiffCursor,
  onDragStart,
  stepPath,
  xOf: _xOf,
  yOf,
  mainX,
  diffX,
  mainTime,
  diffTime,
  fullscreen = false,
  zoomMode,
  onZoomModeChange,
  resetZoom,
  zoomTimeAt,
  zoomYAt,
  panView,
  zoomInCenter,
  zoomOutCenter,
  applyBoxZoom,
  applyAxisZoom,
  getYRange,
  chartBlocks,
}: {
  plotRef: React.RefObject<HTMLDivElement | null>;
  svgRef: React.RefObject<SVGSVGElement | null>;
  width: number;
  chartHeight: number;
  plotH: number;
  series: Series[];
  hasDomain: boolean;
  tMin: number;
  tSpan: number;
  fullTMin?: number;
  addedCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showMainCursor: boolean;
  showDiffCursor: boolean;
  onMainCursor: () => void;
  onDiffCursor: () => void;
  onDragStart: (target: DragTarget) => void;
  stepPath: (s: Series) => string;
  xOf: (t: number) => number;
  yOf: (value: number, s: Series) => number;
  mainX: number;
  diffX: number;
  mainTime: number;
  diffTime: number;
  totalPoints: number;
  isFetching: boolean;
  fullscreen?: boolean;
  zoomMode: ZoomMode;
  onZoomModeChange: (mode: ZoomMode) => void;
  resetZoom: () => void;
  zoomTimeAt: (centerFrac: number, factor: number) => void;
  zoomYAt: (frac: number, factor: number, signalId?: string, rangeSeries?: Series[]) => void;
  panView: (
    deltaPxX: number,
    deltaPxY: number,
    opts: {
      plotWidth: number;
      plotHeight: number;
      viewMode?: ViewMode;
      signalId?: string;
      rangeSeries?: Series[];
    }
  ) => void;
  zoomInCenter: () => void;
  zoomOutCenter: () => void;
  applyBoxZoom: (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    signalId?: string,
    modeOverride?: ViewMode,
    yGeometry?: YZoomGeometry
  ) => void;
  applyAxisZoom: (
    axis: 'x' | 'y',
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    signalId?: string,
    modeOverride?: ViewMode,
    yGeometry?: YZoomGeometry
  ) => void;
  getYRange: (s: Series, opts?: { preferOverlayRange?: boolean }) => YRange;
  chartBlocks: ChartBlock[];
}) {
  void _xOf;
  const timeOrigin = fullTMin ?? tMin;
  const useGroupedLayout = chartBlocks.length > 1 || chartBlocks.some((block) => block.title);
  const activeViewMode = useGroupedLayout
    ? chartBlocks.find((block) => !block.title)?.viewMode ?? viewMode
    : viewMode;
  const mainFracVal = showMainCursor && tSpan > 0 ? (mainTime - tMin) / tSpan : 0.5;
  const diffFracVal = showDiffCursor && tSpan > 0 ? (diffTime - tMin) / tSpan : 0.25;

  const overlayHelpers = useMemo(() => {
    if (activeViewMode !== 'overlay' || useGroupedLayout) return null;
    return makeOverlayPlotHelpers(
      width,
      plotH,
      tMin,
      tSpan,
      makeOverlayGetYRange(getYRange)
    );
  }, [activeViewMode, useGroupedLayout, width, plotH, tMin, tSpan, getYRange]);

  const plotWidthForPan = Math.max(1, width - STACK_Y_AXIS_W);

  const handleWheelZoom = (
    x: number,
    y: number,
    deltaY: number,
    signalId?: string,
    innerPlotH?: number,
    rangeSeries?: Series[]
  ) => {
    const normalizedDelta = Math.max(-240, Math.min(240, deltaY));
    const factor = Math.exp(normalizedDelta * 0.0008);
    const plotLeft = STACK_Y_AXIS_W;
    const plotWidth = Math.max(1, width - plotLeft);
    if ((zoomMode === 'x' || zoomMode === 'pan') && plotWidth > 0) {
      zoomTimeAt((x - plotLeft) / plotWidth, factor);
    } else if (zoomMode === 'y') {
      const plotHeight = innerPlotH ?? plotH;
      const frac = plotHeight > 0 ? (y - PAD_TOP) / plotHeight : 0.5;
      zoomYAt(Math.min(1, Math.max(0, frac)), factor, signalId, rangeSeries);
    }
  };

  const makePanHandler = (
    rangeSeries: Series[],
    plotHeight: number,
    mode: ViewMode,
    panelSeries?: Series[]
  ) =>
    (deltaX: number, deltaY: number, panelIndex?: number) => {
      const pool = panelSeries ?? rangeSeries;
      panView(deltaX, deltaY, {
        plotWidth: plotWidthForPan,
        plotHeight,
        viewMode: mode,
        signalId: panelIndex != null ? pool[panelIndex]?.signal.id : undefined,
        rangeSeries,
      });
    };

  const handleToolbarZoom = (factor: number) => {
    if (zoomMode === 'y') {
      zoomYAt(0.5, factor, undefined, series);
      return;
    }
    if (zoomMode === 'box') {
      zoomTimeAt(0.5, factor);
      zoomYAt(0.5, factor, undefined, series);
      return;
    }
    zoomTimeAt(0.5, factor);
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', fullscreen && 'h-full')}>
      <div className="border-border/60 flex shrink-0 items-center justify-end gap-2 border-b px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <ZoomToolbar
            zoomMode={zoomMode}
            onZoomModeChange={onZoomModeChange}
            onResetZoom={resetZoom}
            onZoomIn={() => handleToolbarZoom(0.75)}
            onZoomOut={() => handleToolbarZoom(1 / 0.75)}
          />
          <CursorToolbar
            showMainCursor={showMainCursor}
            showDiffCursor={showDiffCursor}
            onMainCursor={onMainCursor}
            onDiffCursor={onDiffCursor}
          />
          <div className="bg-muted/50 flex rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'overlay' ? 'default' : 'ghost'}
              className="h-7 px-2"
              title={m['analyses.view_mode_overlay']()}
              onClick={() => onViewModeChange('overlay')}
            >
              <Layers className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'stacked' ? 'default' : 'ghost'}
              className="h-7 px-2"
              title={m['analyses.view_mode_stacked']()}
              onClick={() => onViewModeChange('stacked')}
            >
              <Rows3 className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={plotRef}
        className={cn(
          'bg-muted/15 relative min-h-0 flex-1 overflow-hidden',
          !fullscreen && 'rounded-md border'
        )}
      >
        {!hasDomain || series.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
            {addedCount === 0
              ? m['analyses.signals_select_hint']()
              : m['analyses.signals_window_empty']()}
          </div>
        ) : useGroupedLayout ? (
          <GroupedChartSections
            blocks={chartBlocks}
            chartHeight={chartHeight}
            width={width}
            svgRef={svgRef}
            tMin={tMin}
            tSpan={tSpan}
            fullTMin={timeOrigin}
            mainFrac={mainFracVal}
            diffFrac={diffFracVal}
            mainTime={mainTime}
            diffTime={diffTime}
            showMainCursor={showMainCursor}
            showDiffCursor={showDiffCursor}
            zoomMode={zoomMode}
            onDragStart={onDragStart}
            getYRange={getYRange}
            zoomTimeAt={zoomTimeAt}
            zoomYAt={zoomYAt}
            panView={panView}
            applyBoxZoom={applyBoxZoom}
            applyAxisZoom={applyAxisZoom}
          />
        ) : activeViewMode === 'stacked' ? (
          <StackedChart
            width={width}
            chartHeight={chartHeight}
            series={series}
            tMin={tMin}
            tSpan={tSpan}
            fullTMin={timeOrigin}
            mainX={mainX}
            diffX={diffX}
            mainTime={mainTime}
            diffTime={diffTime}
            showMainCursor={showMainCursor}
            showDiffCursor={showDiffCursor}
            zoomMode={zoomMode}
            getYRange={getYRange}
            onDragStart={onDragStart}
            onBoxZoom={(x0, x1, y0, y1, signalId, yGeometry) =>
              applyBoxZoom(x0, x1, y0, y1, signalId, undefined, yGeometry)
            }
            onAxisZoom={(axis, x0, x1, y0, y1, signalId, yGeometry) =>
              applyAxisZoom(axis, x0, x1, y0, y1, signalId, undefined, yGeometry)
            }
            onWheelZoom={(x, y, deltaY, signalId, innerPlotH) =>
              handleWheelZoom(x, y, deltaY, signalId, innerPlotH, series)
            }
            onPan={makePanHandler(series, plotH, 'stacked', series)}
            zoomTimeAt={zoomTimeAt}
            zoomYAt={zoomYAt}
          />
        ) : (
          <OverlayChart
            svgRef={svgRef}
            width={width}
            chartHeight={chartHeight}
            plotH={plotH}
            series={series}
            tMin={tMin}
            tSpan={tSpan}
            stepPath={overlayHelpers?.stepPath ?? stepPath}
            yOf={overlayHelpers?.yOf ?? yOf}
            mainX={mainX}
            diffX={diffX}
            mainTime={mainTime}
            diffTime={diffTime}
            showMainCursor={showMainCursor}
            showDiffCursor={showDiffCursor}
            zoomMode={zoomMode}
            getYRange={(s) => getYRange(s, { preferOverlayRange: true })}
            onDragStart={onDragStart}
            onBoxZoom={(x0, x1, y0, y1, yGeometry) =>
              applyBoxZoom(x0, x1, y0, y1, undefined, undefined, yGeometry)
            }
            onAxisZoom={(axis, x0, x1, y0, y1, signalId, yGeometry) =>
              applyAxisZoom(axis, x0, x1, y0, y1, signalId, undefined, yGeometry)
            }
            onWheelZoom={(x, y, deltaY) => handleWheelZoom(x, y, deltaY, undefined, plotH, series)}
            onPan={makePanHandler(series, plotH, 'overlay')}
          />
        )}
      </div>
    </div>
  );
}
