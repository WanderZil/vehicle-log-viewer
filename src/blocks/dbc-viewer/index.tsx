import { useEffect, useMemo, useState } from 'react';
import { Database, Search } from 'lucide-react';

import { DbcBitMatrix } from '@/blocks/dbc-viewer/bit-matrix';
import { DbcSignalDetailPanel } from '@/blocks/dbc-viewer/detail-panel';
import { DbcMessageList } from '@/blocks/dbc-viewer/message-list';
import { DbcSignalTable } from '@/blocks/dbc-viewer/signal-table';
import { Input } from '@/components/ui/input';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TRACE } from '@/blocks/frame-viewer/trace-colors';
import { useClientAnalysisSession } from '@/hooks/use-client-analysis-session';
import { buildDbcCatalog, type DbcCatalog } from '@/lib/can/dbc-catalog';
import { cn } from '@/lib/utils';
import { getClientSession } from '@/modules/analyses/client-session';
import { m } from '@/paraglide/messages.js';

type Scope = 'messages' | 'nodes' | 'network';

function catalogErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return m['analyses.dbc_viewer.parse_failed']();
}

export function DbcViewer() {
  const snap = useClientAnalysisSession();
  const session = getClientSession();
  const dbcItems = snap.dbcItems;

  const [dbcId, setDbcId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('messages');
  const [query, setQuery] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    if (dbcItems.length === 0) {
      setDbcId(null);
      return;
    }
    if (!dbcId || !dbcItems.some((item) => item.id === dbcId)) {
      setDbcId(dbcItems[0]!.id);
    }
  }, [dbcItems, dbcId]);

  const catalogResult = useMemo(() => {
    if (!dbcId) return { catalog: null as DbcCatalog | null, error: null as string | null };
    const file = session.dbcs.get(dbcId);
    if (!file) return { catalog: null, error: null };
    try {
      return { catalog: buildDbcCatalog(file.text), error: null };
    } catch (error) {
      return { catalog: null, error: catalogErrorMessage(error) };
    }
  }, [dbcId, session, dbcItems, snap.status]);

  const catalog = catalogResult.catalog;

  useEffect(() => {
    setSelectedMessage(null);
    setSelectedSignal(null);
    setSelectedNode(null);
    setQuery('');
    setScope('messages');
  }, [dbcId]);

  const filteredMessages = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    if (!q) return catalog.messages;
    return catalog.messages.filter((msg) => {
      if (msg.name.toLowerCase().includes(q)) return true;
      if (msg.idHex.toLowerCase().includes(q)) return true;
      if (String(msg.id & 0x1fffffff).includes(q)) return true;
      if (msg.sendingNode.toLowerCase().includes(q)) return true;
      if (msg.description.toLowerCase().includes(q)) return true;
      return msg.signals.some(
        (sig) =>
          sig.name.toLowerCase().includes(q) ||
          sig.description.toLowerCase().includes(q) ||
          sig.unit.toLowerCase().includes(q)
      );
    });
  }, [catalog, query]);

  useEffect(() => {
    if (filteredMessages.length === 0) {
      setSelectedMessage(null);
      return;
    }
    if (!selectedMessage || !filteredMessages.some((msg) => msg.name === selectedMessage)) {
      setSelectedMessage(filteredMessages[0]!.name);
    }
  }, [filteredMessages, selectedMessage]);

  const activeMessage =
    filteredMessages.find((msg) => msg.name === selectedMessage) ?? null;

  useEffect(() => {
    setSelectedSignal(null);
  }, [selectedMessage]);

  useEffect(() => {
    if (!selectedSignal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSignal(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedSignal]);

  const activeSignal =
    activeMessage?.signals.find((sig) => sig.name === selectedSignal) ?? null;

  const filteredNodes = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    if (!q) return catalog.nodes;
    return catalog.nodes.filter(
      (node) =>
        node.name.toLowerCase().includes(q) ||
        node.description.toLowerCase().includes(q)
    );
  }, [catalog, query]);

  useEffect(() => {
    if (scope !== 'nodes') return;
    if (filteredNodes.length === 0) {
      setSelectedNode(null);
      return;
    }
    if (!selectedNode || !filteredNodes.some((node) => node.name === selectedNode)) {
      setSelectedNode(filteredNodes[0]!.name);
    }
  }, [scope, filteredNodes, selectedNode]);

  const activeNode =
    filteredNodes.find((node) => node.name === selectedNode) ?? null;

  if (dbcItems.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Database className="size-8 opacity-40" />
        <p className="text-sm font-medium">{m['analyses.dbc_viewer.empty_title']()}</p>
        <p className="max-w-md text-xs leading-relaxed">
          {m['analyses.dbc_viewer.empty_hint']()}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1.5">
        <Select
          value={dbcId ?? undefined}
          onValueChange={(value) => {
            if (typeof value === 'string') setDbcId(value);
          }}
        >
          <SelectTrigger className="h-7 w-[220px] text-xs">
            <SelectValue placeholder={m['analyses.dbc_viewer.select_file']()} />
          </SelectTrigger>
          <SelectContent>
            {dbcItems.map((item) => (
              <SelectItem key={item.id} value={item.id} className="text-xs">
                {item.fileName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="bg-muted flex h-7 items-center rounded-md p-0.5 text-[11px]">
          {(
            [
              ['messages', m['analyses.dbc_viewer.tab_messages']()],
              ['nodes', m['analyses.dbc_viewer.tab_nodes']()],
              ['network', m['analyses.dbc_viewer.tab_network']()],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                scope === id
                  ? 'bg-background text-foreground rounded-sm px-2 py-0.5 font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground px-2 py-0.5'
              }
              onClick={() => setScope(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[180px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m['analyses.dbc_viewer.search_placeholder']()}
            className="h-7 pl-7 text-xs"
          />
        </div>

        {catalog ? (
          <p className="text-muted-foreground hidden shrink-0 font-mono text-[10px] sm:block">
            {m['analyses.dbc_viewer.summary']({
              messages: catalog.messageCount,
              signals: catalog.signalCount,
              nodes: catalog.nodeCount,
            })}
          </p>
        ) : null}
      </div>

      {catalogResult.error ? (
        <div className="text-destructive flex flex-1 items-center justify-center px-6 text-center text-sm">
          {catalogResult.error}
        </div>
      ) : !catalog ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          {m['analyses.dbc_viewer.loading']()}
        </div>
      ) : scope === 'messages' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
              <ResizablePanel
                defaultSize="30%"
                minSize="18%"
                maxSize="50%"
                className="bg-card/20 flex min-w-0 flex-col overflow-hidden"
              >
                <DbcMessageList
                  messages={filteredMessages}
                  selectedName={selectedMessage}
                  onSelect={setSelectedMessage}
                />
              </ResizablePanel>

              <ResizableHandle withHandle className="bg-border z-10 w-px shrink-0" />

              <ResizablePanel
                defaultSize="70%"
                minSize="28%"
                className="flex min-w-0 flex-col overflow-hidden"
              >
                <ResizablePanelGroup orientation="vertical" className="h-full w-full">
                  <ResizablePanel
                    defaultSize="48%"
                    minSize="22%"
                    className="min-h-0 overflow-hidden"
                  >
                    <DbcSignalTable
                      signals={activeMessage?.signals ?? []}
                      selectedName={selectedSignal}
                      onSelect={setSelectedSignal}
                    />
                  </ResizablePanel>
                  <ResizableHandle withHandle className="bg-border z-10 h-px shrink-0" />
                  <ResizablePanel
                    defaultSize="52%"
                    minSize="22%"
                    className="min-h-0 overflow-hidden"
                  >
                    <DbcBitMatrix
                      message={activeMessage}
                      selectedSignal={selectedSignal}
                      onSelectSignal={setSelectedSignal}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          <div
            className={cn(
              'border-border bg-background h-full shrink-0 overflow-hidden border-l transition-[width] duration-200 ease-out',
              activeSignal && activeMessage ? 'w-80 sm:w-[340px]' : 'w-0 border-l-0'
            )}
            aria-hidden={!activeSignal}
          >
            <div className="h-full w-80 sm:w-[340px]">
              {activeMessage && activeSignal ? (
                <DbcSignalDetailPanel
                  message={activeMessage}
                  signal={activeSignal}
                  onClose={() => setSelectedSignal(null)}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : scope === 'nodes' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
            <ResizablePanel
              defaultSize="65%"
              minSize="35%"
              className="min-w-0 overflow-hidden"
            >
              <div className="h-full min-h-0 overflow-auto">
                <table className="w-full border-collapse text-center text-[11px]">
                  <thead className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-1.5 text-center font-medium">
                        {m['analyses.dbc_viewer.col_name']()}
                      </th>
                      <th className="px-2 py-1.5 text-center font-medium">
                        {m['analyses.dbc_viewer.col_tx_count']()}
                      </th>
                      <th className="px-2 py-1.5 text-center font-medium">
                        {m['analyses.dbc_viewer.col_rx_count']()}
                      </th>
                      <th className="px-2 py-1.5 text-center font-medium">
                        {m['analyses.dbc_viewer.col_comment']()}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNodes.map((node, rowIndex) => (
                      <tr
                        key={node.name}
                        className={cn(
                          'border-border/50 cursor-pointer border-t',
                          node.name === selectedNode
                            ? 'bg-primary/12'
                            : rowIndex % 2 === 0
                              ? 'bg-background hover:bg-muted/45'
                              : 'bg-muted/15 hover:bg-muted/45'
                        )}
                        onClick={() => setSelectedNode(node.name)}
                      >
                        <td
                          className={cn(
                            'max-w-0 truncate px-2 py-1 font-semibold',
                            TRACE.node
                          )}
                          title={node.name}
                        >
                          {node.name}
                        </td>
                        <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.tx)}>
                          {node.txCount}
                        </td>
                        <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.rx)}>
                          {node.rxCount}
                        </td>
                        <td
                          className="text-muted-foreground max-w-0 truncate px-2 py-1"
                          title={node.description}
                        >
                          {node.description || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border z-10 w-px shrink-0" />
            <ResizablePanel
              defaultSize="35%"
              minSize="20%"
              className="min-w-0 overflow-hidden"
            >
              <aside className="bg-muted/5 h-full min-h-0 overflow-auto px-3 py-3">
                {activeNode ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className={cn('text-sm font-semibold', TRACE.node)}>
                        {activeNode.name}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        {activeNode.description || '—'}
                      </p>
                    </div>
                    <p className="font-mono tabular-nums">
                      <span className={TRACE.tx}>Tx {activeNode.txCount}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className={TRACE.rx}>Rx {activeNode.rxCount}</span>
                    </p>
                    <div>
                      <h3
                        className={cn(
                          'mb-1 text-xs font-semibold tracking-wide uppercase',
                          TRACE.section
                        )}
                      >
                        {m['analyses.dbc_viewer.attributes']()}
                      </h3>
                      {activeNode.attributes.length === 0 ? (
                        <p className="text-muted-foreground">
                          {m['analyses.dbc_viewer.no_attributes']()}
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {activeNode.attributes.map((attr) => (
                            <li key={attr.name} className="font-mono">
                              <span className={TRACE.signal}>{attr.name}</span>
                              <span className="text-muted-foreground"> = </span>
                              <span className={TRACE.value}>
                                {attr.value || attr.defaultValue || '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {m['analyses.dbc_viewer.select_node']()}
                  </p>
                )}
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <div className="mx-auto grid max-w-4xl gap-4 text-sm md:grid-cols-2">
            <section className="border-border rounded-md border p-3">
              <h3
                className={cn(
                  'mb-2 text-xs font-semibold tracking-wide uppercase',
                  TRACE.section
                )}
              >
                {m['analyses.dbc_viewer.network_info']()}
              </h3>
              <dl className="space-y-1 text-xs">
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <dt className="text-muted-foreground">
                    {m['analyses.dbc_viewer.version']()}
                  </dt>
                  <dd className={cn('font-mono', TRACE.value)}>
                    {catalog.version || '—'}
                  </dd>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <dt className="text-muted-foreground">
                    {m['analyses.dbc_viewer.bus_speed']()}
                  </dt>
                  <dd className={cn('font-mono', TRACE.time)}>
                    {catalog.busSpeed || '—'}
                  </dd>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <dt className="text-muted-foreground">
                    {m['analyses.dbc_viewer.col_comment']()}
                  </dt>
                  <dd>{catalog.description || '—'}</dd>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <dt className="text-muted-foreground">
                    {m['analyses.dbc_viewer.summary_label']()}
                  </dt>
                  <dd className={cn('font-mono', TRACE.frame)}>
                    {m['analyses.dbc_viewer.summary']({
                      messages: catalog.messageCount,
                      signals: catalog.signalCount,
                      nodes: catalog.nodeCount,
                    })}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="border-border rounded-md border p-3">
              <h3
                className={cn(
                  'mb-2 text-xs font-semibold tracking-wide uppercase',
                  TRACE.section
                )}
              >
                {m['analyses.dbc_viewer.global_attributes']()}
              </h3>
              {catalog.globalAttributes.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {m['analyses.dbc_viewer.no_attributes']()}
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-auto text-xs font-mono">
                  {catalog.globalAttributes.map((attr) => (
                    <li key={attr.name}>
                      <span className={TRACE.signal}>{attr.name}</span>
                      <span className="text-muted-foreground"> = </span>
                      <span className={TRACE.value}>
                        {attr.value || attr.defaultValue || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border-border rounded-md border p-3 md:col-span-2">
              <h3
                className={cn(
                  'mb-2 text-xs font-semibold tracking-wide uppercase',
                  TRACE.section
                )}
              >
                {m['analyses.dbc_viewer.global_valuetables']()}
              </h3>
              {catalog.globalValueTables.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {m['analyses.dbc_viewer.no_choices']()}
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {catalog.globalValueTables.map((table) => (
                    <div key={table.name} className="border-border rounded border p-2">
                      <p className={cn('mb-1 font-mono text-xs font-semibold', TRACE.enum)}>
                        {table.name}
                      </p>
                      <ul className="max-h-40 space-y-0.5 overflow-auto text-[11px]">
                        {table.choices.map((choice) => (
                          <li
                            key={`${table.name}-${choice.value}`}
                            className="font-mono"
                          >
                            <span className={TRACE.hex}>{choice.value}</span>
                            <span className="text-muted-foreground">: </span>
                            <span className={TRACE.enum}>{choice.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
