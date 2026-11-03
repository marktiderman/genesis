/**
 * A report and its conversation on genesis-chat, for the web: the report (its type, status,
 * message and screenshots) on top, and genesis-chat's `ChatThread` for the replies, live, with
 * photos, files and voice notes. The person's view (`SupportReportThread`) and the staff view
 * (`SupportStaffThread`: status, assignee, and internal notes in the composer) share it.
 *
 * Render under genesis-chat's `ChatProvider` (from `@marktiderman/genesis-chat/react`) inside a
 * TanStack QueryClientProvider, with a support client made with the `chat` option.
 *
 * Moving onto genesis-ui (feature `inbox-thread`): the thread here is genesis-chat's `ChatThread`,
 * whose rendering moves onto genesis-ui's `ThreadPage` (and `InboxPage`, `ComposerBar`) with
 * chat's builder. This screen keeps its report header and staff controls and follows that move.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton, cn } from "@marktiderman/genesis-ui";
import { ChatThread, type ResolveUser } from "@marktiderman/genesis-chat/web";
import { useChat } from "@marktiderman/genesis-chat/react";
import { reportHeading as headingOf, type SupportClient } from "../client";
import { resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { isSitePath } from "../routes";

/** The query keys, under genesis-support's root (as on native). */
export const supportWebKeys = {
  report: (id: string) => ["genesis-support", "report", id] as const,
  attachments: (id: string) => ["genesis-support", "attachments", id] as const,
  thread: (id: string) => ["genesis-support", "thread", id] as const,
};

export interface SupportReportThreadProps {
  /** A support client made with the `chat` option (`createSupportClient(supabase, { chat })`). */
  client: SupportClient;
  reportId: string;
  /**
   * Names people. Default: the signed-in person is "You" and anyone else "Support" (only staff
   * write in a report's conversation besides its person).
   */
  resolveUser?: ResolveUser;
  copy?: SupportCopyOverrides;
  /** A back button in the thread's header. */
  onBack?: () => void;
  /**
   * Move focus to the report's heading once it shows (a host that opens the thread in a sheet or
   * dialog whose first button would otherwise take it, such as a delete button). It needs the
   * focusable heading, so it turns `reportHeading` on. Default off.
   */
  focusHeading?: boolean;
  /**
   * Head the report with its own words (its title, else its message's first line) in a real `h2`,
   * show its message only when that adds something, and say which page it was sent from ("Sent
   * from …", a link only when it's a path on this site). Default off: the report's title (or its
   * kind) and its message, as before.
   */
  reportHeading?: boolean;
  /**
   * Title the conversation with the copy's "Report" (`copy.thread.title`) instead of the report's
   * own title, since the card above already carries its words. Default off: the report's title.
   */
  plainChatTitle?: boolean;
  className?: string;
}

interface ShellProps extends SupportReportThreadProps {
  /** Above the conversation, under the report (the staff controls). */
  toolbar?: (report: NonNullable<Awaited<ReturnType<SupportClient["report"]>>>, conversationId: string) => ReactNode;
  copyResolved: SupportCopy;
  testID: string;
}

export function ReportThreadShell({ client, reportId, resolveUser, onBack, focusHeading, plainChatTitle, reportHeading, className, toolbar, copyResolved: copy, testID }: ShellProps) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  const { userId: me } = useChat();
  const report = useQuery({ queryKey: supportWebKeys.report(reportId), queryFn: () => client.report(reportId) });
  const where = useQuery({ queryKey: supportWebKeys.thread(reportId), queryFn: () => client.thread(reportId), staleTime: Infinity });
  const shots = useQuery({ queryKey: supportWebKeys.attachments(reportId), queryFn: () => client.attachments(reportId), staleTime: 50 * 60_000 });
  const names = useMemo<ResolveUser>(
    () => resolveUser ?? ((id: string) => ({ name: id === me ? copy.thread.you : copy.thread.support })),
    [resolveUser, me, copy],
  );

  const loaded = !!report.data && where.data?.mode === "chat";
  const headed = reportHeading || focusHeading;
  useEffect(() => {
    if (!focusHeading || !loaded) return;
    // After the host's own focus on open (a dialog focuses its first button), so this one stays.
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusHeading, loaded]);

  if (report.isPending || where.isPending) {
    return (
      <div className={cn("flex flex-col gap-3 p-4", className)} data-testid={testID} aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const r = report.data;
  if (!r || where.data?.mode !== "chat") {
    return (
      <div className={className} data-testid={testID}>
        <EmptyState
          title={r ? copy.staff.unavailableTitle : copy.thread.notFound}
          {...(r ? { description: copy.staff.unavailableBody } : {})}
        />
      </div>
    );
  }
  const conversationId = where.data.conversationId;
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", className)} data-testid={testID}>
      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{copy.feedback.types[r.type]}</Badge>
            <Badge variant="outline" data-testid="genesis-support-report-status">
              {copy.status[r.status]}
            </Badge>
          </div>
          {headed ? (
            <>
              {/* The report's own words as its heading; its kind is the chip above, once. */}
              {/* Visibly focused when it takes focus on open (focusHeading). */}
              {/* A real heading (h2) for screen readers' heading list, styled as the card's title. */}
              <h2
                ref={heading}
                tabIndex={-1}
                className="rounded-md text-2xl font-semibold leading-none tracking-tight outline-none [overflow-wrap:anywhere] focus:ring-2 focus:ring-ring focus:ring-offset-2"
                data-testid="genesis-support-report-heading"
              >
                {headingOf(r)}
              </h2>
              {r.title?.trim() || r.message.trim() !== headingOf(r) ? (
                <CardDescription className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.message}</CardDescription>
              ) : null}
              {/* The page it was sent from, pinned or not: a pin points to a spot on it. */}
              {r.route || r.aboutLabel ? (
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]" data-testid="genesis-support-report-page">
                  {r.pinned ? copy.thread.pinnedOn : copy.thread.sentFrom}{" "}
                  {/* The label is the reporter's: plain text (cleaned by the client). */}
                  {r.aboutLabel ?? null}
                  {r.aboutLabel && r.route ? " (" : null}
                  {/* The route is the reporter's too: a link only when it's a path on this site. */}
                  {r.route ? (
                    isSitePath(r.route) ? (
                      <a href={r.route} className="underline underline-offset-2">
                        {r.route}
                      </a>
                    ) : (
                      r.route
                    )
                  ) : null}
                  {r.aboutLabel && r.route ? ")" : null}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <CardTitle>{r.title || copy.feedback.types[r.type]}</CardTitle>
              <CardDescription className="whitespace-pre-wrap">{r.message}</CardDescription>
            </>
          )}
        </CardHeader>
        {(shots.data ?? []).some((a) => a.url) ? (
          <CardContent className="flex flex-wrap gap-2">
            {(shots.data ?? [])
              .filter((a) => a.url)
              .map((a) => (
                <a key={a.id} href={a.url!} target="_blank" rel="noreferrer noopener" className="block">
                  <img src={a.url!} alt={copy.thread.screenshot} className="h-24 w-auto rounded-md border object-cover" />
                </a>
              ))}
          </CardContent>
        ) : null}
        {toolbar ? <CardContent className="border-t pt-4">{toolbar(r, conversationId)}</CardContent> : null}
      </Card>
      <div className="min-h-0 flex-1">
        <ChatThread
          conversationId={conversationId}
          resolveUser={names}
          // The report's title by default; "Report" when the host asks (plainChatTitle).
          title={plainChatTitle ? copy.thread.title : r.title || copy.feedback.types[r.type]}
          {...(onBack ? { onBack } : {})}
          search={false}
          scheduling={false}
          availability={false}
          placeholder={copy.thread.placeholder}
        />
      </div>
    </div>
  );
}

/** The person's view of their report: the report, then the conversation with support, live. */
export function SupportReportThread(props: SupportReportThreadProps) {
  const copy = useMemo(() => resolveSupportCopy(props.copy), [props.copy]);
  return <ReportThreadShell {...props} copyResolved={copy} testID="genesis-support-report-thread" />;
}
