/**
 * The staff dump viewer on the phone (support-features 4.7): a ticket's context dumps, behind a
 * "Show diagnostics" button in the agent thread's header, each in sections of plain, selectable
 * text. Reads through `client.ticketDiagnostics` (migration 0019, read under 0026's rule). A dump
 * is already scrubbed; nothing in it becomes a link.
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { NativeButton, NativeText } from "@marktiderman/genesis-ui-native/components";
import { fill } from "../copy";
import { diagnosticsViewSections } from "../diagnostics/view";
import { SUPPORT_QUERY_ROOT, useSupport } from "./support";

export interface AgentTicketDiagnosticsProps {
  ticketId: string;
  /** The signed-in agent, so another login on the phone never reads this one's cache. */
  me: string | null;
  testID?: string;
}

/** A ticket's dumps, for an agent. Nothing when the client can't read them or there are none. */
export function AgentTicketDiagnostics({ ticketId, me, testID = "genesis-support-agent-diagnostics" }: AgentTicketDiagnosticsProps) {
  const { client, copy } = useSupport();
  const [open, setOpen] = useState(false);
  const read = client.ticketDiagnostics?.bind(client);
  const dumps = useQuery({
    queryKey: [SUPPORT_QUERY_ROOT, "agent", me, "diagnostics", ticketId],
    queryFn: () => read!(ticketId),
    enabled: Boolean(read),
    staleTime: 5 * 60_000,
  });
  if (!read) return null;
  if (dumps.isError) {
    return (
      <NativeText preset="body-sm" className="text-destructive" testID={`${testID}-failed`}>
        {copy.agentInbox.diagnosticsFailed}
      </NativeText>
    );
  }
  if (!dumps.data?.length) return null;
  return (
    <View style={{ gap: 8 }} testID={testID}>
      <View style={{ flexDirection: "row" }}>
        <NativeButton size="sm" variant="outline" onPress={() => setOpen((v) => !v)} testID={`${testID}-toggle`}>
          {open ? copy.agentInbox.diagnosticsHide : copy.agentInbox.diagnosticsShow}
        </NativeButton>
      </View>
      {open ? (
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 12 }} nestedScrollEnabled>
          {dumps.data.map((dump) => (
            <View key={dump.id} style={{ gap: 6 }}>
              <NativeText preset="label">{`${fill(copy.agentInbox.diagnosticsDump, { id: dump.shortId })} · ${dump.trigger} · ${dump.createdAt}`}</NativeText>
              {diagnosticsViewSections(dump.report).map((section) => (
                <View key={section.key} style={{ gap: 2 }}>
                  <NativeText preset="caption" accessibilityRole="header">
                    {section.title}
                  </NativeText>
                  <NativeText preset="body-sm" selectable style={{ fontFamily: "Menlo" }}>
                    {section.text}
                  </NativeText>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
