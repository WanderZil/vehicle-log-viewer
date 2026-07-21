import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Download,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  Network,
  PlayCircle,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { ChannelMappingBlock } from '@/blocks/channel-mapping';
import { ParsingOverlay } from '@/components/parsing-overlay';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useClientAnalysisSession } from '@/hooks/use-client-analysis-session';
import { CLIENT_MAX_FILE_BYTES, formatBytes } from '@/lib/can/client-decode';
import { LOG_ACCEPT } from '@/lib/can/iterate-log';
import {
  buildSignalsCsv,
  csvExportFileName,
  downloadCsvFile,
} from '@/lib/analysis-data-export';
import {
  buildAnalysisProjectFile,
  collectImportHints,
  downloadProjectFile,
  PROJECT_FILE_SUFFIX,
  readProjectFile,
} from '@/lib/analysis-project';
import {
  getPendingProjectImport,
  getWorkspaceLayoutSnapshot,
  setPendingProjectImport,
} from '@/lib/analysis-workspace-layout';
import { mappedChannelCount } from '@/modules/analyses/mapping';
import { getClientSession } from '@/modules/analyses/client-session';
import { m } from '@/paraglide/messages.js';

export function AnalysisFileMenu({
  analysisId: _analysisId,
  onParsed,
}: {
  analysisId: string;
  onParsed?: () => void;
}) {
  const navigate = useNavigate();
  const sessionSnap = useClientAnalysisSession();
  const session = getClientSession();
  const blfInputRef = useRef<HTMLInputElement>(null);
  const dbcInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);

  const hasBlf = !!sessionSnap.blfFileName;
  const mapped = mappedChannelCount(sessionSnap.channelMapping);

  const hasParsedSignals =
    sessionSnap.status === 'ready' && (sessionSnap.catalog?.signals.length ?? 0) > 0;

  const handleSaveProject = () => {
    const layout =
      getWorkspaceLayoutSnapshot() ?? {
        addedSignalKeys: [],
        visibleSignalKeys: [],
        groups: [],
        viewMode: 'stacked' as const,
        zoomMode: 'box' as const,
        viewWindow: null,
        yRanges: {},
        overlayYRange: null,
        mainCursorTime: null,
        diffOn: false,
        diffCursorTime: null,
        viewer: {
          tab: 'graph' as const,
        },
      };

    const project = buildAnalysisProjectFile({
      session: {
        name: sessionSnap.name,
        logFileName: sessionSnap.blfFileName,
        logFileSize: sessionSnap.blfFileSize,
        channelMapping: sessionSnap.channelMapping,
        dbcItems: sessionSnap.dbcItems,
      },
      layout,
    });

    downloadProjectFile(project);
    toast.success(m['analyses.project_saved']());
  };

  const handleExportCsv = () => {
    const catalog = sessionSnap.catalog?.signals ?? [];
    if (catalog.length === 0) {
      toast.error(m['analyses.export_csv_empty']());
      return;
    }

    const layout = getWorkspaceLayoutSnapshot();
    const loadedKeys = layout?.addedSignalKeys ?? [];
    const useLoaded = loadedKeys.length > 0;

    const toastId = `csv-export-${session.id}`;
    toast.loading(m['analyses.export_csv_busy'](), { id: toastId });
    setBusy(true);

    window.setTimeout(() => {
      try {
        const result = buildSignalsCsv(catalog, (id) => session.getPoints(id), {
          signalKeys: useLoaded ? loadedKeys : null,
        });

        if (result.rowCount === 0) {
          toast.error(m['analyses.export_csv_empty'](), { id: toastId });
          return;
        }

        downloadCsvFile(
          csvExportFileName(sessionSnap.name, result.scope),
          result.csv
        );
        toast.success(
          useLoaded
            ? m['analyses.export_csv_success_loaded']({
                signals: result.signalCount,
                rows: result.rowCount,
              })
            : m['analyses.export_csv_success_all']({
                signals: result.signalCount,
                rows: result.rowCount,
              }),
          { id: toastId, duration: 5000 }
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : m['analyses.export_csv_failed'](), {
          id: toastId,
        });
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  const handleProjectSelected = async (file: File) => {
    setBusy(true);
    try {
      const project = await readProjectFile(file);
      session.applyProjectSession(project.session);
      setPendingProjectImport(project);

      void navigate({
        to: '/',
        search: {
          tab: project.viewer.tab,
        },
        replace: true,
      });

      const snap = session.snapshot();
      const hints = collectImportHints(project, {
        logFileName: snap.blfFileName,
        dbcFileNames: snap.dbcItems.map((dbc) => dbc.fileName),
        channelMapping: snap.channelMapping,
      });

      const notes: string[] = [];
      if (hints.missingLog && project.session.logFileName) {
        notes.push(
          m['analyses.project_import_need_log']({ name: project.session.logFileName })
        );
      }
      if (hints.logNameMismatch && project.session.logFileName) {
        notes.push(
          m['analyses.project_import_log_mismatch']({
            expected: project.session.logFileName,
            current: snap.blfFileName ?? '',
          })
        );
      }
      if (hints.missingDbcs.length > 0) {
        notes.push(
          m['analyses.project_import_need_dbc']({ names: hints.missingDbcs.join(', ') })
        );
      }
      if (hints.mappingPartial) {
        notes.push(m['analyses.project_import_mapping_partial']());
      }
      if (hints.layoutPending && snap.status !== 'ready') {
        notes.push(m['analyses.project_import_layout_pending']());
      }

      if (notes.length > 0) {
        toast.message(m['analyses.project_imported'](), {
          description: notes.join('\n'),
          duration: 8000,
        });
      } else {
        toast.success(m['analyses.project_imported']());
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : m['analyses.project_import_failed']()
      );
    } finally {
      setBusy(false);
    }
  };

  const handleBlfSelected = async (file: File) => {
    const toastId = `blf-upload-${session.id}`;
    toast.loading(m['analyses.blf_uploading'](), { id: toastId });
    setBusy(true);
    try {
      const result = await session.loadBlf(file);
      const pending = getPendingProjectImport();
      if (pending) session.applyProjectSession(pending.session);
      const count = result.channels.length;
      toast.success(
        count > 0
          ? `${m['analyses.blf_uploaded']()} — ${m['analyses.channels_count']({ count })} · ${result.messageCount.toLocaleString()} frames`
          : m['analyses.blf_uploaded'](),
        { id: toastId, duration: 5000 }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), {
        id: toastId,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDbcSelected = async (files: File[]) => {
    const toastId = `dbc-upload-${session.id}`;
    toast.loading(m['analyses.dbc_uploading'](), { id: toastId });
    setBusy(true);
    try {
      for (const file of files) await session.addDbc(file);
      const pending = getPendingProjectImport();
      if (pending) session.applyProjectSession(pending.session);
      toast.success(
        files.length > 1
          ? m['analyses.dbc_added_count']({ count: files.length })
          : m['analyses.dbc_added'](),
        { id: toastId, duration: 5000 }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), {
        id: toastId,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleParse = async () => {
    if (mapped === 0) {
      toast.error(m['analyses.mapping_required']());
      return;
    }
    setParsing(true);
    try {
      const result = await session.parse();
      toast.success(
        m['analyses.parse_done']({
          count: result.signalCount,
          channels: result.channels.join(', '),
        })
      );
      onParsed?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setParsing(false);
    }
  };

  return (
    <>
      {(parsing || sessionSnap.status === 'parsing') && <ParsingOverlay />}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2"
              disabled={busy || parsing}
            />
          }
        >
          <FolderOpen className="size-3.5" />
          {m['analyses.file_menu']()}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs">
              {sessionSnap.blfFileName || m['analyses.file_menu']()}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault();
                handleExportCsv();
              }}
              disabled={busy || parsing || !hasParsedSignals}
            >
              <FileSpreadsheet className="size-3.5" />
              {m['analyses.file_export_csv']()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault();
                handleSaveProject();
              }}
              disabled={busy || parsing}
            >
              <Download className="size-3.5" />
              {m['analyses.file_save_project']()}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault();
                window.setTimeout(() => projectInputRef.current?.click(), 0);
              }}
              disabled={busy || parsing}
            >
              <FolderOpen className="size-3.5" />
              {m['analyses.file_import_project']()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault();
                window.setTimeout(() => blfInputRef.current?.click(), 0);
              }}
              disabled={busy || parsing}
            >
              <FileUp className="size-3.5" />
              {hasBlf ? m['analyses.blf_replace']() : m['analyses.file_load_blf']()}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault();
                window.setTimeout(() => dbcInputRef.current?.click(), 0);
              }}
              disabled={busy || parsing}
            >
              <Upload className="size-3.5" />
              {m['analyses.file_load_dbc']()}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setChannelsOpen(true)}
              disabled={busy || parsing}
            >
              <Network className="size-3.5" />
              {m['analyses.file_channels']()}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleParse()}
              disabled={busy || parsing || mapped === 0}
            >
              <PlayCircle className="size-3.5" />
              {parsing ? m['analyses.auto_parsing']() : m['analyses.file_parse']()}
            </DropdownMenuItem>
            {hasBlf && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={busy || parsing}
                  onClick={() => {
                    if (confirm(m['analyses.confirm_remove_blf']())) {
                      session.clearBlf();
                      toast.success(m['analyses.blf_removed']());
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {m['analyses.blf_remove']()}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-[10px] font-normal">
              Max {formatBytes(CLIENT_MAX_FILE_BYTES)} · browser parse
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={blfInputRef}
        type="file"
        accept={LOG_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleBlfSelected(file);
          event.target.value = '';
        }}
      />
      <input
        ref={dbcInputRef}
        type="file"
        accept=".dbc"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) void handleDbcSelected(files);
          event.target.value = '';
        }}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept={`.json,${PROJECT_FILE_SUFFIX},application/json`}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleProjectSelected(file);
          event.target.value = '';
        }}
      />

      <Dialog open={channelsOpen} onOpenChange={setChannelsOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{m['analyses.mapping_title']()}</DialogTitle>
          </DialogHeader>
          <ChannelMappingBlock
            analysisId={session.id}
            compact
            embedded
            onParsed={() => {
              onParsed?.();
              setChannelsOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
