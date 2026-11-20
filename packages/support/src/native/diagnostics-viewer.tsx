/**
 * The staff dump viewer on the phone (support-features 4.7): a ticket's context dumps, behind a
 * "Show diagnostics" button in the agent thread's header, each in sections of plain, selectable
 * text. Reads through `client.ticketDiagnostics` (migration 0019, read under 0026's rule). A dump
 * is already scrubbed; nothing in it becomes a link.
 */
import { useState } from "react";
import { ScrollView, Share } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Inline, NativeButton, NativeInlineAlert, NativeLoadingState, NativeText, Stack } from "@marktiderman/genesis-ui-native/components";
import type { TicketDiagnostics } from "../client";
import { fill, type SupportCopy } from "../copy";
import type { DiagnosticTrigger } from "../diagnostics/report";
import { diagnosticsViewSections } from "../diagnostics/view";
import { SUPPORT_QUERY_ROOT, useSupport } from "./support";

export interface AgentTicketDiagnosticsProps {
  ticketId: string;
  /** The signed-in agent, so another login on the phone never reads this one's cache. */
  me: string | null;
  /** Copies a dump's text (expo-clipboard's `setStringAsync`). Default the share sheet, which has Copy. */
  copy?: (text: string) => unknown;
  /** A dump's time, shown in its heading. Default the phone's locale, date and time. */
  formatTime?: (date: Date) => string;
  testID?: string;
}

const localTime = (date: Date) => date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A dump's heading: its short id, what made it, and when ("Dump AB12 · Shake · 19 Nov 2026, 10:04"). */
export function dumpHeading(dump: Pick<TicketDiagnostics, "shortId" | "trigger" | "createdAt">, copy: SupportCopy, formatTime: (date: Date) => string = localTime): string {
  const at = new Date(dump.createdAt);
  const when = Number.isNaN(at.getTime()) ? dump.createdAt : formatTime(at);
  const trigger = copy.agentInbox.diagnosticsTriggers[dump.trigger as DiagnosticTrigger] ?? dump.trigger;
  return [fill(copy.agentInbox.diagnosticsDump, { id: dump.shortId }), trigger, when].join(" · ");
}

/** A ticket's dumps, for an agent. Nothing when the client can't read them or there are none. */
export function AgentTicketDiagnostics({ ticketId, me, copy: copyText, formatTime = localTime, testID = "genesis-support-agent-diagnostics" }: AgentTicketDiagnosticsProps) {
  const { client, copy } = useSupport();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const read = client.ticketDiagnostics?.bind(client);
  const dumps = useQuery({
    queryKey: [SUPPORT_QUERY_ROOT, "agent", me, "diagnostics", ticketId],
    queryFn: () => read!(ticketId),
    enabled: Boolean(read),
    staleTime: 5 * 60_000,
  });
  if (!read) return null;
  if (dumps.isPending) {
    return <NativeLoadingState fullScreen={false} size="small" label={copy.agentInbox.diagnosticsLoading} testID={`${testID}-loading`} />;
  }
  if (dumps.isError) return <NativeInlineAlert variant="destructive" description={copy.agentInbox.diagnosticsFailed} testID={`${testID}-failed`} />;
  if (!dumps.data?.length) return null;
  const copyDump = async (dump: TicketDiagnostics) => {
    const heading = dumpHeading(dump, copy, formatTime);
    const text = [heading, ...diagnosticsViewSections(dump.report).map((section) => `${section.title}\n${section.text}`)].join("\n\n");
    try {
      await (copyText ? copyText(text) : Share.share({ message: text }));
      setCopied(dump.id);
    } catch {
      // The share sheet dismissed, or the clipboard refused: nothing was copied.
    }
  };
  return (
    <Stack gap="sm" testID={testID}>
      <Inline>
        <NativeButton size="sm" variant="outline" onPress={() => setOpen((v) => !v)} testID={`${testID}-toggle`}>
          {open ? copy.agentInbox.diagnosticsHide : copy.agentInbox.diagnosticsShow}
        </NativeButton>
      </Inline>
      {open ? (
        <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled>
          <Stack gap="md">
            {dumps.data.map((dump) => (
              <Stack key={dump.id} gap="xs" testID={`${testID}-dump`}>
                <Inline gap="sm" justify="between">
                  <NativeText preset="label" className="flex-1" testID={`${testID}-heading`}>
                    {dumpHeading(dump, copy, formatTime)}
                  </NativeText>
                  <NativeButton size="sm" variant="ghost" onPress={() => void copyDump(dump)} testID={`${testID}-copy-${dump.id}`}>
                    {copied === dump.id ? copy.agentInbox.diagnosticsCopied : copy.agentInbox.diagnosticsCopy}
                  </NativeButton>
                </Inline>
                {diagnosticsViewSections(dump.report).map((section) => (
                  <Stack key={section.key} gap="xs">
                    <NativeText preset="caption" accessibilityRole="header">
                      {section.title}
                    </NativeText>
                    <NativeText preset="body-sm" selectable className="font-mono">
                      {section.text}
                    </NativeText>
                  </Stack>
                ))}
              </Stack>
            ))}
          </Stack>
        </ScrollView>
      ) : null}
    </Stack>
  );
}
