/**
 * A report and its conversation on genesis-chat, for the web: the report (its type, status,
 * message and screenshots) on top, and genesis-chat's `ChatThread` for the replies, live, with
 * photos, files and voice notes. The person's view (`SupportReportThread`) and the staff view
 * (`SupportStaffThread`: status, assignee, and internal notes in the composer) share it.
 *
 * Render under genesis-chat's `ChatProvider` (from `@marktiderman/genesis-chat/react`) inside a
 * TanStack QueryClientProvider, with a support client made with the `chat` option.
 */
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton, cn } from "@marktiderman/genesis-ui";
import { ChatThread, type ResolveUser } from "@marktiderman/genesis-chat/web";
import { useChat } from "@marktiderman/genesis-chat/react";
import type { SupportClient } from "../client";
import { resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";

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
  className?: string;
}

interface ShellProps extends SupportReportThreadProps {
  /** Above the conversation, under the report (the staff controls). */
  toolbar?: (report: NonNullable<Awaited<ReturnType<SupportClient["report"]>>>, conversationId: string) => ReactNode;
  copyResolved: SupportCopy;
  testID: string;
}

export function ReportThreadShell({ client, reportId, resolveUser, onBack, className, toolbar, copyResolved: copy, testID }: ShellProps) {
  const { userId: me } = useChat();
  const report = useQuery({ queryKey: supportWebKeys.report(reportId), queryFn: () => client.report(reportId) });
  const where = useQuery({ queryKey: supportWebKeys.thread(reportId), queryFn: () => client.thread(reportId), staleTime: Infinity });
  const shots = useQuery({ queryKey: supportWebKeys.attachments(reportId), queryFn: () => client.attachments(reportId), staleTime: 50 * 60_000 });
  const names = useMemo<ResolveUser>(
    () => resolveUser ?? ((id: string) => ({ name: id === me ? copy.thread.you : copy.thread.support })),
    [resolveUser, me, copy],
  );

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
          description={r ? copy.staff.unavailableBody : undefined}
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
          <CardTitle>{r.title || copy.feedback.types[r.type]}</CardTitle>
          <CardDescription className="whitespace-pre-wrap">{r.message}</CardDescription>
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
          title={r.title || copy.feedback.types[r.type]}
          onBack={onBack}
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
