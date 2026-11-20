/**
 * The staff dump viewer on the web (support-features 4.7, 12.2.2): a ticket's context dumps, each
 * in collapsible sections of plain text. In the agent inbox's details panel; usable on its own.
 *
 * Reads through `client.ticketDiagnostics` (migration 0019, read under 0026's rule: whoever
 * handles the ticket). A dump is scrubbed on the device and on the server; it is shown as text
 * only, never as links or markup.
 *
 * @stability Beta
 */
import { useQuery } from "@tanstack/react-query";
import type { SupportClient } from "../client";
import { fill, resolveSupportCopy, type SupportCopyOverrides } from "../copy";
import { diagnosticsViewSections } from "../diagnostics/view";

export interface SupportTicketDiagnosticsProps {
  client: Pick<SupportClient, "ticketDiagnostics">;
  ticketId: string;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

/** A ticket's dumps as text sections. Nothing when the client can't read them or there are none. */
export function SupportTicketDiagnostics({ client, ticketId, copy: overrides, onError }: SupportTicketDiagnosticsProps) {
  const copy = resolveSupportCopy(overrides);
  const read = client.ticketDiagnostics?.bind(client);
  const dumps = useQuery({
    queryKey: ["genesis-support", "agent-inbox", "diagnostics", ticketId],
    queryFn: async () => {
      try {
        return await read!(ticketId);
      } catch (error) {
        onError?.(error);
        throw error;
      }
    },
    enabled: Boolean(read),
    staleTime: 5 * 60_000,
  });
  if (!read) return null;
  if (dumps.isError) {
    return (
      <p data-testid="genesis-support-agent-diagnostics-failed" className="text-sm text-destructive">
        {copy.agentInbox.diagnosticsFailed}
      </p>
    );
  }
  if (!dumps.data?.length) return null;
  return (
    <section aria-label={copy.agentInbox.diagnostics} data-testid="genesis-support-agent-diagnostics" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{copy.agentInbox.diagnostics}</h3>
      {dumps.data.map((dump) => (
        <details key={dump.id} className="rounded-md border" data-testid="genesis-support-agent-diagnostics-dump">
          <summary className="cursor-pointer px-3 py-2 text-sm">
            {fill(copy.agentInbox.diagnosticsDump, { id: dump.shortId })} · {dump.trigger} · {dump.createdAt}
          </summary>
          <div className="flex flex-col gap-1 px-3 pb-3">
            {diagnosticsViewSections(dump.report).map((section) => (
              <details key={section.key} data-testid={`genesis-support-agent-diagnostics-${section.key}`}>
                <summary className="cursor-pointer text-xs font-medium">{section.title}</summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{section.text}</pre>
              </details>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
