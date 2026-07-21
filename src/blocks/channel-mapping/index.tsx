import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ChannelDbcPicker } from '@/blocks/channel-mapping/channel-dbc-picker';
import { ParsingOverlay } from '@/components/parsing-overlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClientAnalysisSession } from '@/hooks/use-client-analysis-session';
import {
  mappedChannelCount,
  toggleChannelDbc,
  type ChannelMapping,
} from '@/modules/analyses/mapping';
import { getClientSession } from '@/modules/analyses/client-session';
import { m } from '@/paraglide/messages.js';

type ParseResult = {
  signalCount: number;
  messageCount: number;
  decodedMessages: number;
  channels: number[];
};

export function ChannelMappingBlock({
  compact = false,
  embedded = false,
  onParsingStart,
  onParsingEnd,
  onParsed,
}: {
  analysisId?: string;
  compact?: boolean;
  embedded?: boolean;
  onParsingStart?: () => void;
  onParsingEnd?: () => void;
  onParsed?: (result: ParseResult) => void;
}) {
  const snap = useClientAnalysisSession();
  const session = getClientSession();
  const [draft, setDraft] = useState<ChannelMapping>(snap.channelMapping);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return snap.channelMapping;
    });
  }, [snap.channelMapping]);

  const channels = snap.channels;
  const dbcItems = snap.dbcItems;
  const mappedCount = mappedChannelCount(draft);

  const applyDbcToAll = () => {
    if (dbcItems.length === 0) return;
    const allIds = dbcItems.map((d) => d.id);
    const next: ChannelMapping = {};
    for (const ch of channels) next[String(ch)] = [...allIds];
    setDraft(next);
  };

  const handleApply = async () => {
    session.setChannelMapping(draft);
    if (mappedCount === 0) {
      toast.success(m['analyses.mapping_saved']());
      return;
    }
    onParsingStart?.();
    setBusy(true);
    try {
      const result = await session.parse(draft);
      toast.success(
        m['analyses.parse_done']({
          count: result.signalCount,
          channels: result.channels.join(', '),
        })
      );
      onParsed?.({
        signalCount: result.signalCount,
        messageCount: result.messageCount,
        decodedMessages: result.decodedMessages,
        channels: result.channels,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      onParsingEnd?.();
    } finally {
      setBusy(false);
      onParsingEnd?.();
    }
  };

  const showOverlay = busy || snap.status === 'parsing';

  const body = (
    <>
      {showOverlay && <ParsingOverlay />}

      <div className="space-y-3">
        {channels.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {m['analyses.mapping_empty_channels']()}
          </p>
        )}

        {channels.length > 0 && dbcItems.length > 0 && mappedCount === 0 && (
          <Button className="w-full" size="sm" variant="secondary" onClick={applyDbcToAll}>
            {m['analyses.mapping_apply_all']()}
          </Button>
        )}

        <div className={compact ? 'space-y-2' : 'grid gap-3 md:grid-cols-2'}>
          {channels.map((ch) => (
            <div key={ch} className="space-y-1.5 rounded-md border p-2.5">
              <p className="text-xs font-medium">
                {m['analyses.mapping_channel']()} {ch}
              </p>
              <ChannelDbcPicker
                channel={ch}
                dbcItems={dbcItems}
                value={draft[String(ch)] ?? []}
                onToggle={(dbcId, checked) => {
                  setDraft((prev) => toggleChannelDbc(prev, ch, dbcId, checked));
                }}
              />
            </div>
          ))}
        </div>

        {mappedCount > 0 && (
          <p className="text-muted-foreground text-xs">
            {m['analyses.mapping_ready']({ count: mappedCount })}
          </p>
        )}

        {mappedCount > 0 && (
          <p className="text-muted-foreground text-xs">
            {m['analyses.mapping_parse_hint']()}
          </p>
        )}

        <div className={compact ? 'flex flex-col gap-2' : 'flex flex-wrap justify-end gap-2'}>
          <Button
            type="button"
            className={compact ? 'w-full' : undefined}
            size={compact ? 'sm' : 'default'}
            disabled={busy}
            onClick={() => void handleApply()}
          >
            {busy
              ? m['analyses.auto_parsing']()
              : mappedCount > 0
                ? m['analyses.mapping_save_parse']()
                : m['analyses.mapping_save']()}
          </Button>
        </div>
      </div>
    </>
  );

  if (compact || embedded) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m['analyses.mapping_title']()}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
