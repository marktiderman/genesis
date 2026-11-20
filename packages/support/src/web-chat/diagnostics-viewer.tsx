/**
 * The staff dump viewer on the web (support-features 4.7, 12.2.2): a ticket's context dumps, each
 * an accordion of plain-text sections, with its text to copy and, where the app says how, links to
 * its Sentry event and GitHub issue. In the agent inbox's details panel; usable on its own.
 *
 * Reads through `client.ticketDiagnostics` (migration 0019, read under 0026's rule: whoever
 * handles the ticket). A dump is scrubbed on the device and on the server; its contents are shown
 * as text only, never as links or markup. The only links are the ones the app builds (`links`).
 *
 * @stability Beta
 */
import { useEffect, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button, InlineAlert, Skeleton, toast } from "@marktiderman/genesis-ui";
import type { SupportClient, TicketDiagnostics } from "../client";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { diagnosticsViewSections } from "../diagnostics/view";
import { DIAGNOSTIC_TRIGGERS, type DiagnosticTrigger } from "../diagnostics/report";
import { useLoginScope } from "./tenant";

/** Where a dump's Sentry event and GitHub issue are, in the app's own terms. Either may be left out. */
export interface SupportDiagnosticsLinks {
  /** The Sentry event's page from its ids (`https://acme.sentry.io/issues/?query=${encodeURIComponent(eventId)}`). Shown when the dump carries an event id. */
  sentry?: (ids: { eventId: string; replayId: string | null }) => string | null;
  /** The GitHub issue the app filed for this dump (`githubIssueNotifier`), or null when there is none. */
  githubIssue?: (dump: TicketDiagnostics) => string | null;
}

export interface SupportTicketDiagnosticsProps {
  client: Pick<SupportClient, "ticketDiagnostics" | "signedInId">;
  ticketId: string;
  /** Links to the dump's Sentry event and GitHub issue. Only `https:` links show. */
  links?: SupportDiagnosticsLinks;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

/** The dump viewer's query keys, under genesis-support's root, scoped to the client and its login. */
export const supportDiagnosticsKeys = {
  all: ["genesis-support", "diagnostics"] as const,
  ticket: (scope: string, ticketId: string) => ["genesis-support", "diagnostics", scope, ticketId] as const,
};

/** A link the app built, kept only when it is `https:`. */
function safeLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function sentryIds(report: unknown): { eventId: string; replayId: string | null } | null {
  const sentry = report && typeof report === "object" ? (report as { sentry?: unknown }).sentry : null;
  if (!sentry || typeof sentry !== "object") return null;
  const { lastEventId, replayId } = sentry as { lastEventId?: unknown; replayId?: unknown };
  return typeof lastEventId === "string" && lastEventId ? { eventId: lastEventId, replayId: typeof replayId === "string" ? replayId : null } : null;
}

/** A dump's trigger as the database keeps it, or `other` for one this version doesn't know. */
function triggerOf(value: string): DiagnosticTrigger | "other" {
  return DIAGNOSTIC_TRIGGERS.find((t) => t === value) ?? "other";
}

/** A dump's whole text, section by section, to paste into an issue or a chat. */
export function diagnosticsText(dump: TicketDiagnostics): string {
  return diagnosticsViewSections(dump.report)
    .map((s) => `## ${s.title}\n${s.text}`)
    .join("\n\n");
}

/** A ticket's dumps as text sections. Nothing when the client can't read them or there are none. */
export function SupportTicketDiagnostics({ client, ticketId, links, copy: overrides, onError }: SupportTicketDiagnosticsProps) {
  const copy = resolveSupportCopy(overrides);
  const read = client.ticketDiagnostics?.bind(client);
  const scope = useLoginScope(client, null);
  const dumps = useQuery({
    queryKey: supportDiagnosticsKeys.ticket(scope ?? "", ticketId),
    queryFn: read && scope ? () => read(ticketId) : skipToken,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (dumps.error) onError?.(dumps.error);
  }, [dumps.error, onError]);
  if (!read) return null;
  if (dumps.isPending) {
    return (
      <div role="status" aria-label={copy.agentInbox.diagnosticsLoading} data-testid="genesis-support-agent-diagnostics-loading">
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (dumps.isError) {
    return <InlineAlert variant="destructive" description={copy.agentInbox.diagnosticsFailed} testID="genesis-support-agent-diagnostics-failed" />;
  }
  const [newest] = dumps.data;
  if (!newest) return null;
  return (
    <section aria-label={copy.agentInbox.diagnostics} data-testid="genesis-support-agent-diagnostics" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{copy.agentInbox.diagnostics}</h3>
      <Accordion type="single" collapsible defaultValue={newest.id}>
        {dumps.data.map((dump) => (
          <AccordionItem key={dump.id} value={dump.id} data-testid="genesis-support-agent-diagnostics-dump">
            <AccordionTrigger className="py-2 text-left text-sm">
              <DumpHeading dump={dump} copy={copy} />
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2">
              <DumpActions dump={dump} links={links} copy={copy} />
              <Accordion type="multiple">
                {diagnosticsViewSections(dump.report).map((section) => (
                  <AccordionItem key={section.key} value={section.key} data-testid={`genesis-support-agent-diagnostics-${section.key}`}>
                    <AccordionTrigger className="py-1.5 text-xs">{section.title}</AccordionTrigger>
                    <AccordionContent className="pb-2">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{section.text}</pre>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function DumpHeading({ dump, copy }: { dump: TicketDiagnostics; copy: SupportCopy }) {
  // In the viewer's zone, so it waits for the browser: the server's HTML has the stored time.
  const [when, setWhen] = useState(dump.createdAt);
  useEffect(() => {
    const date = new Date(dump.createdAt);
    if (!Number.isNaN(date.getTime())) setWhen(date.toLocaleString());
  }, [dump.createdAt]);
  const trigger = copy.agentInbox.diagnosticsTriggers[triggerOf(dump.trigger)];
  return (
    <span className="flex flex-col">
      <span>{fill(copy.agentInbox.diagnosticsDump, { id: dump.shortId })}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {trigger} · <time dateTime={dump.createdAt}>{when}</time>
      </span>
    </span>
  );
}

function DumpActions({ dump, links, copy }: { dump: TicketDiagnostics; links: SupportDiagnosticsLinks | undefined; copy: SupportCopy }) {
  const ids = sentryIds(dump.report);
  const sentry = ids && links?.sentry ? safeLink(links.sentry(ids)) : null;
  const issue = links?.githubIssue ? safeLink(links.githubIssue(dump)) : null;
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsText(dump));
      toast.success(copy.agentInbox.diagnosticsCopied);
    } catch {
      toast.error(copy.agentInbox.diagnosticsCopyFailed);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => void copyText()} data-testid="genesis-support-agent-diagnostics-copy">
        {copy.agentInbox.diagnosticsCopy}
      </Button>
      {sentry ? (
        <Button asChild size="sm" variant="link" testID="genesis-support-agent-diagnostics-sentry-link">
          <a href={sentry} target="_blank" rel="noreferrer noopener">
            {copy.agentInbox.diagnosticsSentry}
          </a>
        </Button>
      ) : null}
      {issue ? (
        <Button asChild size="sm" variant="link" testID="genesis-support-agent-diagnostics-issue-link">
          <a href={issue} target="_blank" rel="noreferrer noopener">
            {copy.agentInbox.diagnosticsIssue}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
