import { m } from '@/paraglide/messages.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { SignalChart } from './signal-chart';
import { SignalListPanel } from './signal-list-panel';
import { useSignalWorkspace } from './use-signal-workspace';

export function SignalWorkspaceBlock({ analysisId }: { analysisId: string }) {
  const ws = useSignalWorkspace(analysisId);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
      <Card className="overflow-hidden">
        <CardHeader className="gap-1">
          <CardTitle>{m['analyses.signals_list_title']()}</CardTitle>
        </CardHeader>
        <CardContent>
          <SignalListPanel
            search={ws.search}
            onSearchChange={ws.setSearch}
            catalog={ws.catalog}
            addedIds={ws.addedIds}
            added={ws.added}
            series={ws.series}
            hasDomain={ws.hasDomain}
            tMin={ws.tMin}
            mainTime={ws.mainTime}
            diffTime={ws.diffTime}
            diffOn={ws.diffOn}
            onAdd={ws.addSignal}
            onRemove={ws.removeSignal}
            loading={ws.signalsLoading}
          />
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardContent className="flex min-h-[400px] flex-1 flex-col p-0 pt-4">
          <SignalChart
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
        </CardContent>
      </Card>
    </div>
  );
}
