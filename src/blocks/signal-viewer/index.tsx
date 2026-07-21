import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';

import { m } from '@/paraglide/messages.js';
import {
  getPendingProjectImport,
  subscribeWorkspaceLayout,
} from '@/lib/analysis-workspace-layout';
import { SignalChart } from '@/blocks/signal-workspace/signal-chart';
import { SignalPickerDialog } from '@/blocks/signal-workspace/signal-picker-dialog';
import {
  SignalShortcutsButton,
  SignalShortcutsDialog,
} from '@/blocks/signal-workspace/signal-shortcuts-dialog';
import { SignalTablePanel } from '@/blocks/signal-workspace/signal-table-panel';
import { useSignalShortcuts } from '@/blocks/signal-workspace/use-signal-shortcuts';
import { useSignalWorkspace } from '@/blocks/signal-workspace/use-signal-workspace';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';

export function SignalViewer({
  analysisId,
  onRegisterToolbarActions,
}: {
  analysisId: string;
  onRegisterToolbarActions?: (actions: ReactNode) => void;
}) {
  const routeSearch = useSearch({ strict: false }) as { parsed?: string; count?: string };
  const navigate = useNavigate();
  const ws = useSignalWorkspace(analysisId);
  const autoAddedRef = useRef(false);
  const parseReadyToastRef = useRef(false);
  const pendingProjectToken = useSyncExternalStore(
    subscribeWorkspaceLayout,
    () => getPendingProjectImport()?.exportedAt ?? '',
    () => ''
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useSignalShortcuts({
    ws,
    shortcutsOpen,
    pickerOpen,
    onOpenHelp: () => setShortcutsOpen(true),
    onAddSignal: () => {
      ws.setSearch('');
      setPickerOpen(true);
    },
  });

  useEffect(() => {
    if (routeSearch.parsed !== '1' || parseReadyToastRef.current) return;

    const count = routeSearch.count ? Number(routeSearch.count) : 0;
    if (!Number.isFinite(count) || count <= 0) return;

    parseReadyToastRef.current = true;
    toast.success(m['analyses.viewer_parse_ready']({ count }), {
      id: `viewer-parse-ready-${analysisId}`,
    });

    void navigate({
      to: '/',
      search: {},
      replace: true,
    });
  }, [routeSearch.parsed, routeSearch.count, analysisId, navigate]);

  useEffect(() => {
    const pending = getPendingProjectImport();
    if (pending?.workspace.addedSignalKeys.length) return;
    if (autoAddedRef.current || ws.catalog.length === 0 || ws.added.length > 0) return;
    ws.addSignal(ws.catalog[0]);
    autoAddedRef.current = true;
  }, [ws.catalog, ws.added.length, ws.addSignal, pendingProjectToken]);

  useEffect(() => {
    onRegisterToolbarActions?.(
      <SignalShortcutsButton onClick={() => setShortcutsOpen(true)} />
    );
    return () => onRegisterToolbarActions?.(null);
  }, [onRegisterToolbarActions]);

  return (
    <div className="bg-background text-foreground flex h-full w-full flex-col overflow-hidden">
      {ws.signalsError && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive mx-2 mt-2 shrink-0 rounded-md border p-2 text-xs">
          {(ws.signalsError as Error).message || m['analyses.viewer_signals_error']()}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
          <ResizablePanel
            defaultSize="30%"
            minSize="18%"
            maxSize="50%"
            className="bg-card/30 flex min-w-0 flex-col"
          >
            <div className="min-h-0 flex-1">
              <SignalTablePanel
                added={ws.added}
                series={ws.series}
                hasDomain={ws.hasDomain}
                tMin={ws.fullTMin}
                mainTime={ws.mainTime}
                diffTime={ws.diffTime}
                mainCursorActive={ws.mainCursorActive}
                diffCursorActive={ws.diffCursorActive}
                diffOn={ws.diffOn}
                onRemove={ws.removeSignal}
                onAddClick={() => {
                  ws.setSearch('');
                  setPickerOpen(true);
                }}
                isSignalVisible={ws.isSignalVisible}
                onToggleVisible={ws.toggleSignalVisible}
                groups={ws.groups}
                groupedSignalIds={ws.groupedSignalIds}
                groupPickMode={ws.groupPickMode}
                onGroupPickModeChange={ws.setGroupPickMode}
                groupPickIds={ws.groupPickIds}
                groupPickCount={ws.groupPickCount}
                onToggleGroupPick={ws.toggleGroupPick}
                onClearGroupPick={ws.clearGroupPick}
                onCreateGroup={ws.createGroup}
                onDeleteGroup={ws.deleteGroup}
                onSetGroupViewMode={ws.setGroupViewMode}
                getSignalColor={ws.getSignalColor}
                onSetSignalColor={ws.setSignalColor}
                onResetSignalColor={ws.resetSignalColor}
                hasCustomSignalColor={ws.hasCustomSignalColor}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="bg-border w-[2px] shrink-0 after:w-4"
          />

          <ResizablePanel
            defaultSize="70%"
            minSize="30%"
            className="flex min-w-0 flex-col"
          >
            <SignalChart
              fullscreen
              plotRef={ws.plotRef}
              svgRef={ws.svgRef}
              width={ws.width}
              chartHeight={ws.chartHeight}
              plotH={ws.plotH}
              series={ws.visibleSeries}
              hasDomain={ws.chartHasDomain}
              tMin={ws.tMin}
              tSpan={ws.tSpan}
              fullTMin={ws.fullTMin}
              addedCount={ws.visibleSeries.length}
              viewMode={ws.viewMode}
              onViewModeChange={ws.setViewMode}
              showMainCursor={ws.mainCursorActive}
              showDiffCursor={ws.diffCursorActive}
              onMainCursor={ws.activateMainCursor}
              onDiffCursor={ws.activateDiffCursor}
              onDragStart={ws.setDragTarget}
              stepPath={ws.stepPath}
              xOf={ws.xOf}
              yOf={ws.yOf}
              mainX={ws.mainX}
              diffX={ws.diffX}
              mainTime={ws.mainTime}
              diffTime={ws.diffTime}
              totalPoints={ws.totalPoints}
              isFetching={ws.isFetching}
              zoomMode={ws.zoomMode}
              onZoomModeChange={ws.handleZoomModeChange}
              resetZoom={ws.resetZoom}
              zoomTimeAt={ws.zoomTimeAt}
              zoomYAt={ws.zoomYAt}
              panView={ws.panView}
              zoomInCenter={ws.zoomInCenter}
              zoomOutCenter={ws.zoomOutCenter}
              applyBoxZoom={ws.applyBoxZoom}
              applyAxisZoom={ws.applyAxisZoom}
              getYRange={ws.getYRange}
              chartBlocks={ws.chartBlocks}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <SignalShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <SignalPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        catalog={ws.catalog}
        catalogTotal={ws.catalogTotal}
        addedIds={ws.addedIds}
        search={ws.search}
        onSearchChange={ws.setSearch}
        loading={ws.signalsLoading}
        onAdd={ws.addSignal}
      />
    </div>
  );
}
