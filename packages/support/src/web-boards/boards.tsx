/**
 * The person's side of support as Genesis lists, for the web: their own reports, the idea board,
 * "you asked, we shipped", and one help article; plus staff's two controls (an idea's status, the
 * FeatureId a report is about). Each list is a `defineView` drawn by genesis-ui's `<ResourceView>`
 * over rows the support client reads (`rows`), so search, sort, paging and the peek are the
 * view's. Render under a `GenesisProvider` and a TanStack `QueryClientProvider`.
 *
 * Every string comes from the support copy (`copy` overrides any of it).
 *
 * @stability Beta
 */
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  InlineAlert,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
} from "@marktiderman/genesis-ui";
import { ResourceView, useDisplayCell } from "@marktiderman/genesis-ui/data";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView, type ResolvedColumn } from "@marktiderman/genesis-core/resource-view";
import { BookOpen, Lightbulb, LifeBuoy, PartyPopper, ThumbsUp } from "lucide-react";
import { SupportError, type IdeaStatus, type SupportClient, type SupportIdea, type SupportReport } from "../client";
import { FEEDBACK_STATUSES } from "../contract";
import { FEEDBACK_TYPES } from "../record";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";

/** Query keys the lists read under, to invalidate from elsewhere (after sending feedback, say). */
export const supportBoardKeys = {
  all: ["genesis-support", "boards"] as const,
  reports: (tenantId?: string | null) => ["genesis-support", "boards", "reports", tenantId ?? null] as const,
  ideas: ["genesis-support", "boards", "ideas"] as const,
  shipped: ["genesis-support", "boards", "shipped"] as const,
  article: (slug: string, tenantId?: string | null) => ["genesis-support", "boards", "article", tenantId ?? null, slug] as const,
};

export type SupportReportRow = SupportReport & Record<string, unknown>;
export type SupportIdeaRow = SupportIdea & Record<string, unknown>;

const IDEA_STATUSES: readonly IdeaStatus[] = ["open", "planned", "in_progress", "shipped", "declined", "hidden"];
const IDEA_TONES = { open: "info", planned: "info", in_progress: "warning", shipped: "success", declined: "muted", hidden: "muted" } as const;
const REPORT_TONES = { open: "info", submitted: "info", in_progress: "warning", pending: "muted", addressed: "success", wont_fix: "muted" } as const;

/** Only an idea still in play takes votes. */
export function ideaVotable(idea: Pick<SupportIdea, "status">): boolean {
  return idea.status === "open" || idea.status === "planned" || idea.status === "in_progress";
}

/** "1 vote", "12 votes", in the copy's words. */
export function ideaVotesLabel(count: number, copy: SupportCopy = resolveSupportCopy()): string {
  return count === 1 ? copy.ideas.oneVote : fill(copy.ideas.votes, { count });
}

/** A refusal in words: the rate limit, else the fallback (a database message isn't for people). */
function wordsFor(error: unknown, fallback: string, copy: SupportCopy): string {
  return error instanceof SupportError && error.rateLimited ? copy.feedback.rateLimited : fallback;
}

function useCopy(overrides: SupportCopyOverrides | undefined): SupportCopy {
  return useMemo(() => resolveSupportCopy(overrides), [overrides]);
}

// ── The views ─────────────────────────────────────────────────────────────────

function reportsView(copy: SupportCopy) {
  const words = copy.boards.reports;
  const resource = defineResource<SupportReportRow>()({
    name: "support_my_reports",
    key: "id",
    label: words.title,
    labelField: "message",
    noun: words.noun,
    fields: [
      { name: "id", type: "string", generated: true, hasDefault: true },
      { name: "title", type: "string", nullable: true, readOnly: true },
      { name: "message", type: "string", readOnly: true, label: words.message },
      { name: "type", type: "string", enumValues: [...FEEDBACK_TYPES], readOnly: true, label: words.type },
      { name: "status", type: "string", enumValues: [...FEEDBACK_STATUSES], readOnly: true, label: words.status },
      { name: "page", type: "string", nullable: true, readOnly: true, label: words.page },
      { name: "unread", type: "boolean", readOnly: true },
      { name: "createdAt", type: "datetime", readOnly: true, label: words.createdAt },
    ],
  });
  return defineView<typeof resource, SupportReportRow>(resource, {
    copy: { noun: words.noun, nounPlural: words.nounPlural, title: words.title, empty: { title: copy.inbox.emptyTitle, body: copy.inbox.emptyBody } },
    fields: {
      type: { labels: copy.feedback.types },
      status: { display: "badge", labels: copy.status, tones: REPORT_TONES },
      createdAt: { display: "date" },
    },
    columns: {
      default: ["message", "type", "status", "createdAt"],
      // The thread (the detail render prop) shows what was written; the peek adds where it stands.
      detail: ["status", "page", "createdAt"],
    },
    form: [],
    orderBy: { field: "createdAt", direction: "desc" },
    summary: (r) => ({ title: r.title || r.message.slice(0, 80), subtitle: copy.status[r.status] }),
  });
}

const ideaFields = (copy: SupportCopy) => {
  const words = copy.boards.ideas;
  return [
    { name: "id", type: "string", generated: true, hasDefault: true },
    { name: "title", type: "string", label: words.title },
    { name: "body", type: "string", nullable: true, label: words.body },
    { name: "status", type: "string", enumValues: [...IDEA_STATUSES], readOnly: true, label: words.status },
    { name: "featureId", type: "string", nullable: true, readOnly: true, label: words.featureId },
    { name: "shippedAt", type: "datetime", nullable: true, readOnly: true, label: words.shippedAt },
    { name: "voteCount", type: "number", readOnly: true, label: words.voteCount },
    { name: "voted", type: "boolean", readOnly: true },
    { name: "mine", type: "boolean", readOnly: true, label: words.mine },
    { name: "createdAt", type: "datetime", readOnly: true, label: words.createdAt },
  ] as const;
};

function ideasView(copy: SupportCopy) {
  const words = copy.boards.ideas;
  const resource = defineResource<SupportIdeaRow>()({ name: "support_ideas", key: "id", label: copy.ideas.title, labelField: "title", noun: words.noun, fields: ideaFields(copy) });
  return defineView<typeof resource, SupportIdeaRow>(resource, {
    copy: { noun: words.noun, nounPlural: words.nounPlural, title: copy.ideas.title, create: copy.ideas.suggest, empty: { title: copy.ideas.emptyTitle, body: copy.ideas.emptyBody } },
    fields: {
      body: { display: "longText" },
      status: { display: "badge", labels: copy.ideas.statuses, tones: IDEA_TONES },
      voteCount: { display: "number" },
    },
    columns: {
      default: ["title", "status", "voteCount"],
      detail: ["body", "status", "featureId"],
    },
    form: [],
    summary: (i) => ({ title: i.title, subtitle: `${copy.ideas.statuses[i.status]} · ${ideaVotesLabel(i.voteCount, copy)}` }),
  });
}

function shippedView(copy: SupportCopy) {
  const words = copy.boards.shipped;
  const resource = defineResource<SupportIdeaRow>()({ name: "support_shipped", key: "id", label: copy.shipped.title, labelField: "title", noun: words.noun, fields: ideaFields(copy) });
  return defineView<typeof resource, SupportIdeaRow>(resource, {
    copy: { noun: words.noun, nounPlural: words.nounPlural, title: copy.shipped.title, empty: { title: copy.shipped.emptyTitle, body: copy.shipped.emptyBody } },
    fields: {
      body: { display: "longText" },
      status: { display: "badge", labels: copy.ideas.statuses, tones: IDEA_TONES },
      shippedAt: { display: "date" },
    },
    columns: {
      default: ["title", "mine", "shippedAt"],
      detail: ["body", "featureId", "shippedAt"],
    },
    form: [],
    orderBy: { field: "shippedAt", direction: "desc" },
    summary: (i) => ({ title: i.title, subtitle: i.featureId ? fill(copy.shipped.shippedAs, { feature: i.featureId }) : copy.ideas.statuses.shipped }),
  });
}

type Cells<T> = Partial<Record<string, (row: T) => ReactNode>>;

/** A view's `detail` columns for one row, as the peek shows them, with the screen's own cells. */
function ViewFields<T extends Record<string, unknown>>({ columns, row, cells, testId }: { columns: readonly ResolvedColumn<T>[]; row: T; cells?: Cells<T>; testId: string }) {
  const cell = useDisplayCell();
  return (
    <dl className="space-y-3" data-testid={testId}>
      {columns.map((c) => (
        <div key={c.key}>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</dt>
          <dd className="mt-1 text-sm">{cells?.[c.key] ? cells[c.key]!(row) : cell(c as ResolvedColumn<Record<string, unknown>>, row)}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── The person's reports ──────────────────────────────────────────────────────

export interface SupportMyReportsProps {
  client: Pick<SupportClient, "myReports" | "deleteReport">;
  /** Only this tenant's reports (migration 0004). Left out, every tenant's. */
  tenantId?: string | null;
  /** Shows a "Send feedback" button in the toolbar that calls this (open the feedback panel). */
  onSendFeedback?: () => void;
  /** The toolbar's own content, in place of the "Send feedback" button. */
  toolbar?: ReactNode;
  /** Drawn in a report's peek under its fields: its thread (`SupportReportThread` from `/web-chat`), say. */
  renderDetail?: (report: SupportReport) => ReactNode;
  /** Where the list sits: `embedded` (default) in a page or tab, or a `page` of its own. */
  layout?: "page" | "embedded" | "compact";
  copy?: SupportCopyOverrides;
  /** Every failed read and change, for reporting. */
  onError?: (error: unknown) => void;
}

/** The signed-in person's own reports: unread and status badges, delete with a confirm, and the thread in each peek. */
export function SupportMyReports({ client, tenantId, onSendFeedback, toolbar, renderDetail, layout = "embedded", copy: overrides, onError }: SupportMyReportsProps) {
  const copy = useCopy(overrides);
  const qc = useQueryClient();
  const view = useMemo(() => reportsView(copy), [copy]);
  const reports = useQuery({
    queryKey: supportBoardKeys.reports(tenantId),
    queryFn: () => client.myReports(tenantId !== undefined ? { tenantId } : undefined),
  });
  const cells = useMemo<Cells<SupportReportRow>>(
    () => ({
      message: (r) => <span className="line-clamp-1 font-medium">{r.title || r.message}</span>,
      status: (r) => (
        <span className="flex items-center gap-2" data-testid={`support-report-status-${r.id}`}>
          {r.unread ? <Badge data-testid={`support-report-unread-${r.id}`}>{copy.inbox.unread}</Badge> : null}
          <Badge variant="secondary">{copy.status[r.status]}</Badge>
        </span>
      ),
    }),
    [copy],
  );
  const detailColumns = useMemo(() => view.columns("detail"), [view]);
  const remove = async (r: SupportReportRow) => {
    try {
      await client.deleteReport(r.id);
    } catch (error) {
      onError?.(error);
      throw new Error(wordsFor(error, copy.boards.reports.deleteFailed, copy));
    }
    await qc.invalidateQueries({ queryKey: supportBoardKeys.reports(tenantId) });
  };
  return (
    <div data-testid="support-my-reports">
      <ResourceView<SupportReportRow>
        view={view}
        rows={(reports.data as SupportReportRow[] | undefined) ?? []}
        loading={reports.isPending}
        error={reports.isError}
        errorMessage={copy.boards.reports.loadFailed}
        onRetry={() => void reports.refetch()}
        layout={layout}
        viewSettingsKey="genesis-support-reports"
        emptyIcon={LifeBuoy}
        allowCreate={false}
        allowEdit={false}
        onDelete={remove}
        confirmDelete={{
          title: copy.inbox.deleteConfirmTitle,
          description: copy.inbox.deleteConfirmBody,
          confirmLabel: copy.inbox.delete,
          cancelLabel: copy.inbox.cancel,
        }}
        toolbar={
          toolbar ??
          (onSendFeedback ? (
            <Button onClick={onSendFeedback} data-testid="support-reports-send-feedback">
              {copy.inbox.sendFeedback}
            </Button>
          ) : undefined)
        }
        cells={cells}
        renderDetail={(r) => (
          <div className="space-y-4" data-testid="support-report-detail">
            <ViewFields columns={detailColumns} row={r} cells={cells} testId="support-report-fields" />
            {renderDetail?.(r)}
          </div>
        )}
      />
    </div>
  );
}

// ── The idea board ────────────────────────────────────────────────────────────

export interface SupportIdeaBoardProps {
  client: Pick<SupportClient, "ideas" | "suggestIdea" | "vote" | "unvote" | "setIdeaStatus">;
  /** The signed-in person handles support: each idea's peek has its status control. */
  staff?: boolean;
  /** Only ideas in these statuses (the client's default: every one but hidden). */
  statuses?: IdeaStatus[];
  layout?: "page" | "embedded" | "compact";
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

/** The idea board: anyone signed in suggests ideas and votes (one each); staff set an idea's status in its peek. */
export function SupportIdeaBoard({ client, staff = false, statuses, layout = "embedded", copy: overrides, onError }: SupportIdeaBoardProps) {
  const copy = useCopy(overrides);
  const qc = useQueryClient();
  const view = useMemo(() => ideasView(copy), [copy]);
  const ideas = useQuery({
    queryKey: [...supportBoardKeys.ideas, statuses ?? null],
    queryFn: () => client.ideas(statuses ? { statuses } : undefined),
  });
  const [suggesting, setSuggesting] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: supportBoardKeys.ideas });

  const toggleVote = async (idea: SupportIdea) => {
    try {
      if (idea.voted) await client.unvote(idea.id);
      else await client.vote(idea.id);
      await refresh();
    } catch (error) {
      onError?.(error);
      toast.error(wordsFor(error, copy.boards.ideas.voteFailed, copy));
    }
  };

  const voteButton = (i: SupportIdeaRow, full: boolean) => (
    <Button
      size="sm"
      variant={i.voted ? "default" : "outline"}
      disabled={!ideaVotable(i)}
      aria-pressed={i.voted}
      aria-label={`${i.voted ? copy.ideas.voted : copy.ideas.vote}: ${i.title}`}
      startIcon={<ThumbsUp className="size-4" />}
      data-testid={`support-idea-vote-${full ? "detail-" : ""}${i.id}`}
      onClick={(e) => {
        e.stopPropagation();
        void toggleVote(i);
      }}
    >
      {full ? `${i.voted ? copy.ideas.voted : copy.ideas.vote} · ${ideaVotesLabel(i.voteCount, copy)}` : i.voteCount}
    </Button>
  );

  const cells: Cells<SupportIdeaRow> = {
    title: (i) => (
      <span className="flex items-center gap-2">
        <span className="line-clamp-1 font-medium">{i.title}</span>
        {i.mine ? <Badge variant="outline">{copy.boards.ideas.yours}</Badge> : null}
      </span>
    ),
    voteCount: (i) => voteButton(i, false),
  };
  const detailColumns = view.columns("detail");

  return (
    <div data-testid="support-idea-board">
      <ResourceView<SupportIdeaRow>
        view={view}
        rows={(ideas.data as SupportIdeaRow[] | undefined) ?? []}
        loading={ideas.isPending}
        error={ideas.isError}
        errorMessage={copy.boards.ideas.loadFailed}
        onRetry={() => void ideas.refetch()}
        layout={layout}
        viewSettingsKey="genesis-support-ideas"
        emptyIcon={Lightbulb}
        onCreate={() => setSuggesting(true)}
        allowEdit={false}
        allowDelete={false}
        cells={cells}
        renderDetail={(i) => (
          <div className="space-y-4" data-testid="support-idea-detail">
            <ViewFields columns={detailColumns} row={i} testId="support-idea-fields" />
            {voteButton(i, true)}
            {staff ? <SupportIdeaStatusControl key={i.id} client={client} idea={i} copy={overrides} onChanged={refresh} {...(onError ? { onError } : {})} /> : null}
          </div>
        )}
      />
      <SuggestIdeaDialog
        open={suggesting}
        onOpenChange={setSuggesting}
        client={client}
        copy={copy}
        onSuggested={async () => {
          setSuggesting(false);
          await refresh();
        }}
        onError={onError}
      />
    </div>
  );
}

function SuggestIdeaDialog({
  open,
  onOpenChange,
  client,
  copy,
  onSuggested,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Pick<SupportClient, "suggestIdea">;
  copy: SupportCopy;
  onSuggested: () => unknown;
  onError: ((error: unknown) => void) | undefined;
}) {
  const ids = { title: useId(), body: useId() };
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || !title.trim()) return;
    setSending(true);
    setFailed(null);
    try {
      await client.suggestIdea(body.trim() ? { title: title.trim(), body: body.trim() } : { title: title.trim() });
      setTitle("");
      setBody("");
      await onSuggested();
    } catch (error) {
      onError?.(error);
      setFailed(wordsFor(error, copy.boards.ideas.suggestFailed, copy));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="support-idea-suggest">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{copy.ideas.suggestTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={ids.title}>{copy.ideas.titleLabel}</Label>
            <Input id={ids.title} value={title} maxLength={140} placeholder={copy.ideas.titlePlaceholder} onChange={(e) => setTitle(e.target.value)} data-testid="support-idea-suggest-title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.body}>{copy.ideas.bodyLabel}</Label>
            <Textarea id={ids.body} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} data-testid="support-idea-suggest-body" />
          </div>
          {failed ? (
            <InlineAlert variant="destructive" description={failed} testID="support-idea-suggest-failed" />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="support-idea-suggest-cancel">
              {copy.boards.ideas.cancel}
            </Button>
            <Button type="submit" disabled={sending || !title.trim()} data-testid="support-idea-suggest-submit">
              {copy.ideas.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Staff: an idea's status ───────────────────────────────────────────────────

export interface SupportIdeaStatusControlProps {
  client: Pick<SupportClient, "setIdeaStatus">;
  idea: Pick<SupportIdea, "id" | "status" | "featureId">;
  /** After a save: refresh the board. */
  onChanged?: () => unknown;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

/**
 * Staff: an idea's status, and the FeatureId that delivers it once shipped (blank clears it).
 * Draws nothing when the client has no `setIdeaStatus`.
 */
export function SupportIdeaStatusControl({ client, idea, onChanged, copy: overrides, onError }: SupportIdeaStatusControlProps) {
  const copy = useCopy(overrides);
  const ids = { status: useId(), feature: useId() };
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [feature, setFeature] = useState(idea.featureId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ failed: boolean; text: string } | null>(null);
  const setIdeaStatus = client.setIdeaStatus;
  if (!setIdeaStatus) return null;
  const words = copy.boards.ideaStatus;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await setIdeaStatus.call(client, idea.id, status, feature.trim());
      setMessage({ failed: false, text: words.saved });
      await onChanged?.();
    } catch (error) {
      onError?.(error);
      setMessage({ failed: true, text: wordsFor(error, words.failed, copy) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="support-idea-status-control">
      <Label htmlFor={ids.status}>{words.status}</Label>
      <Select value={status} onValueChange={(v) => setStatus(v as IdeaStatus)}>
        <SelectTrigger id={ids.status} data-testid="support-idea-status-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {IDEA_STATUSES.map((s) => (
            <SelectItem key={s} value={s} data-testid={`support-idea-status-${s}`}>
              {copy.ideas.statuses[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor={ids.feature}>{words.featureId}</Label>
      <Input id={ids.feature} value={feature} placeholder={words.featurePlaceholder} onChange={(e) => setFeature(e.target.value)} data-testid="support-idea-status-feature" />
      <Button onClick={() => void save()} disabled={saving} data-testid="support-idea-status-save">
        {saving ? words.saving : words.save}
      </Button>
      {message ? (
        <InlineAlert variant={message.failed ? "destructive" : "success"} description={message.text} testID="support-idea-status-message" />
      ) : null}
    </div>
  );
}

// ── Staff: the feature a report is about ──────────────────────────────────────

export interface SupportReportFeatureControlProps {
  client: Pick<SupportClient, "report" | "setStatus">;
  report: Pick<SupportReport, "id" | "status" | "featureId">;
  onChanged?: () => unknown;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
}

/**
 * Staff: the FeatureId a report is about (blank clears it). Status is set in the report's thread;
 * saving here reads the report fresh and keeps the status it has now.
 */
export function SupportReportFeatureControl({ client, report, onChanged, copy: overrides, onError }: SupportReportFeatureControlProps) {
  const copy = useCopy(overrides);
  const id = useId();
  const words = copy.boards.reportFeature;
  const [feature, setFeature] = useState(report.featureId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ failed: boolean; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // The status may have changed in the thread since the list loaded.
      const current = await client.report(report.id);
      await client.setStatus(report.id, current?.status ?? report.status, feature.trim());
      setMessage({ failed: false, text: words.saved });
      await onChanged?.();
    } catch (error) {
      onError?.(error);
      setMessage({ failed: true, text: wordsFor(error, words.failed, copy) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="support-report-feature-control">
      <Label htmlFor={id}>{words.featureId}</Label>
      <Input id={id} value={feature} placeholder={words.featurePlaceholder} onChange={(e) => setFeature(e.target.value)} data-testid="support-report-feature-input" />
      <Button onClick={() => void save()} disabled={saving} data-testid="support-report-feature-save">
        {saving ? words.saving : words.save}
      </Button>
      {message ? (
        <InlineAlert variant={message.failed ? "destructive" : "success"} description={message.text} testID="support-report-feature-message" />
      ) : null}
    </div>
  );
}

// ── You asked, we shipped ─────────────────────────────────────────────────────

export interface SupportShippedIdeasProps {
  client: Pick<SupportClient, "shippedForMe">;
  layout?: "page" | "embedded" | "compact";
  copy?: SupportCopyOverrides;
}

/** "You asked, we shipped": shipped ideas the signed-in person suggested or voted for. Read only. */
export function SupportShippedIdeas({ client, layout = "embedded", copy: overrides }: SupportShippedIdeasProps) {
  const copy = useCopy(overrides);
  const view = useMemo(() => shippedView(copy), [copy]);
  const shipped = useQuery({ queryKey: supportBoardKeys.shipped, queryFn: () => client.shippedForMe() });
  const cells = useMemo<Cells<SupportIdeaRow>>(
    () => ({
      title: (i) => <span className="line-clamp-1 font-medium">{i.title}</span>,
      mine: (i) => <Badge variant="outline">{i.mine ? copy.boards.shipped.suggestedIt : copy.boards.shipped.votedForIt}</Badge>,
    }),
    [copy],
  );
  const detailColumns = useMemo(() => view.columns("detail"), [view]);
  return (
    <div data-testid="support-shipped-ideas">
      <ResourceView<SupportIdeaRow>
        view={view}
        rows={(shipped.data as SupportIdeaRow[] | undefined) ?? []}
        loading={shipped.isPending}
        error={shipped.isError}
        errorMessage={copy.boards.shipped.loadFailed}
        onRetry={() => void shipped.refetch()}
        layout={layout}
        viewSettingsKey="genesis-support-shipped"
        emptyIcon={PartyPopper}
        allowCreate={false}
        allowEdit={false}
        allowDelete={false}
        cells={cells}
        renderDetail={(i) => <ViewFields columns={detailColumns} row={i} cells={cells} testId="support-shipped-fields" />}
      />
    </div>
  );
}

// ── One help article ──────────────────────────────────────────────────────────

export interface SupportHelpArticleProps {
  client: Pick<SupportClient, "helpArticle">;
  /** The article's slug (or id). */
  slug: string;
  /** Whose help center. Null is the app's own; left out, the client's `tenantId`, else the app's own. */
  tenantId?: string | null;
  /** Under the article: where to go next ("Still need help?" and a link to the app's help). */
  footer?: ReactNode;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
  className?: string;
}

/**
 * One help article by its slug: its title, summary and body (plain text; blank lines part its
 * paragraphs). A draft, an article the person can't read, or a client without a help center is
 * "not found".
 */
export function SupportHelpArticle({ client, slug, tenantId, footer, copy: overrides, onError, className }: SupportHelpArticleProps) {
  const copy = useCopy(overrides);
  const words = copy.boards.article;
  const article = useQuery({
    queryKey: supportBoardKeys.article(slug, tenantId),
    queryFn: async () => {
      if (!client.helpArticle) return null;
      try {
        return await client.helpArticle(slug, tenantId !== undefined ? { tenantId } : undefined);
      } catch (error) {
        onError?.(error);
        throw error;
      }
    },
  });

  if (article.isPending) {
    return (
      <div className={className} role="status" aria-label={words.loading} data-testid="support-help-article-loading">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    );
  }
  if (!article.data) {
    return (
      <div className={className} data-testid={article.isError ? "support-help-article-error" : "support-help-article-not-found"}>
        <EmptyState
          icon={BookOpen}
          title={article.isError ? words.errorTitle : words.notFoundTitle}
          description={article.isError ? words.errorBody : words.notFoundBody}
          {...(article.isError
            ? {
                action: (
                  <Button variant="outline" onClick={() => void article.refetch()} data-testid="support-help-article-retry">
                    {words.retry}
                  </Button>
                ),
              }
            : {})}
        />
      </div>
    );
  }
  const paragraphs = article.data.body.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <article className={className} data-testid="support-help-article">
      <header className="mb-4 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="support-help-article-title">
          {article.data.title}
        </h1>
        {article.data.summary ? (
          <p className="text-muted-foreground" data-testid="support-help-article-summary">
            {article.data.summary}
          </p>
        ) : null}
      </header>
      <div className="max-w-prose space-y-3" data-testid="support-help-article-body">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
            {p.trim()}
          </p>
        ))}
      </div>
      {footer ? <div className="mt-6 border-t pt-4">{footer}</div> : null}
    </article>
  );
}
