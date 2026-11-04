/**
 * Where a tenant's agents write its help center: the articles, including drafts, beside the one
 * open for editing. On genesis-ui's `InboxLayout` and `InboxPage`; the app keeps which article is
 * open in its router (`articleId`: an id, `"new"`, or null).
 *
 * @stability Beta
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  EmptyState,
  InboxLayout,
  InboxPage,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  type InboxItem,
} from "@marktiderman/genesis-ui";
import { SupportError, type HelpArticle, type HelpArticleStatus, type HelpCollection, type SupportClient } from "../client";
import { resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { scopeOf, useResolvedTenant } from "./tenant";

export interface SupportHelpCenterAdminProps {
  client: SupportClient;
  /** Whose help center. Null is the app's own. Left out, the client's `tenantId`, else the app's own. */
  tenantId?: string | null;
  /** The open article, from the app's router: its id, `"new"`, or null. */
  articleId: string | null;
  onArticleChange: (id: string | null) => void;
  copy?: SupportCopyOverrides;
  /** Every refused or failed read and change, for reporting. */
  onError?: (error: unknown) => void;
  className?: string;
}

const NEW = "new";
const NONE = "__none__";
const keys = {
  all: ["genesis-support", "help-admin"] as const,
  list: (scope: string) => ["genesis-support", "help-admin", "list", scope] as const,
  collections: (scope: string) => ["genesis-support", "help-admin", "collections", scope] as const,
  article: (scope: string, id: string) => ["genesis-support", "help-admin", "article", scope, id] as const,
};

function required<T>(method: T | undefined): NonNullable<T> {
  if (!method) throw new SupportError("This support client has no help center.", "0A000", "helpAdmin");
  return method as NonNullable<T>;
}

/** An address from a title: lowercase letters, digits and single hyphens. */
export function slugFrom(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

function failureOf(error: unknown, copy: SupportCopy): string {
  const code = error instanceof SupportError ? error.code : undefined;
  if (code === "40001") return copy.helpAdmin.conflict;
  if (code === "23505") return copy.helpAdmin.slugTaken;
  if (code === "23514" || code === "22023") return copy.helpAdmin.invalid;
  return copy.helpAdmin.failed;
}

interface EditorProps {
  client: SupportClient;
  tenantArg: { tenantId?: string | null };
  article: HelpArticle | null;
  collections: readonly HelpCollection[];
  copy: SupportCopy;
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onError: ((error: unknown) => void) | undefined;
}

/** Keyed by article, so it never shows the last one's words. */
function Editor({ client, tenantArg, article, collections, copy, onSaved, onDeleted, onError }: EditorProps) {
  const ids = { title: useId(), slug: useId(), summary: useId(), body: useId(), collection: useId(), status: useId() };
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(article));
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [collection, setCollection] = useState(article?.collectionId ?? NONE);
  const [status, setStatus] = useState<HelpArticleStatus>(article?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ failed: boolean; text: string } | null>(null);
  const shownSlug = slugTouched ? slug : slugFrom(title);
  // The copy these edits started from: moved only by this editor's own save, so another agent's is noticed.
  const base = useRef(article?.updatedAt ?? null);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    required(client.saveHelpArticle)({
      ...(article ? { id: article.id, expectedUpdatedAt: base.current } : tenantArg),
      collectionId: collection === NONE ? null : collection,
      slug: shownSlug,
      title: title.trim(),
      summary: summary.trim() || null,
      body,
      status,
    })
      .then(({ id, updatedAt }) => {
        setMessage({ failed: false, text: copy.helpAdmin.saved });
        base.current = updatedAt;
        onSaved(id);
      })
      .catch((error: unknown) => {
        setMessage({ failed: true, text: failureOf(error, copy) });
        onError?.(error);
      })
      .finally(() => setSaving(false));
  };
  const remove = () => {
    if (!article) return;
    required(client.deleteHelpArticle)(article.id)
      .then(onDeleted)
      .catch((error: unknown) => {
        setMessage({ failed: true, text: failureOf(error, copy) });
        onError?.(error);
      });
  };
  return (
    <form onSubmit={save} data-testid="genesis-support-help-editor" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.title}>{copy.helpAdmin.title}</Label>
        <Input id={ids.title} value={title} maxLength={90} required onChange={(e) => setTitle(e.target.value)} data-testid="genesis-support-help-title" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.slug}>{copy.helpAdmin.slug}</Label>
        <Input
          id={ids.slug}
          value={shownSlug}
          maxLength={80}
          required
          aria-describedby={`${ids.slug}-hint`}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          data-testid="genesis-support-help-slug"
        />
        <p id={`${ids.slug}-hint`} className="text-xs text-muted-foreground">
          {copy.helpAdmin.slugHint}
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.collection}>{copy.helpAdmin.collection}</Label>
          <Select value={collection} onValueChange={setCollection}>
            <SelectTrigger id={ids.collection} className="w-52" data-testid="genesis-support-help-collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{copy.helpAdmin.noCollection}</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.status}>{copy.helpAdmin.status}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as HelpArticleStatus)}>
            <SelectTrigger id={ids.status} className="w-40" data-testid="genesis-support-help-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{copy.helpAdmin.statuses.draft}</SelectItem>
              <SelectItem value="published">{copy.helpAdmin.statuses.published}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.summary}>{copy.helpAdmin.summary}</Label>
        <Input id={ids.summary} value={summary} maxLength={200} onChange={(e) => setSummary(e.target.value)} data-testid="genesis-support-help-summary" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={ids.body}>{copy.helpAdmin.body}</Label>
        <Textarea id={ids.body} value={body} rows={14} maxLength={100000} aria-describedby={`${ids.body}-hint`} onChange={(e) => setBody(e.target.value)} data-testid="genesis-support-help-body" />
        <p id={`${ids.body}-hint`} className="text-xs text-muted-foreground">
          {copy.helpAdmin.bodyHint}
        </p>
      </div>
      {message ? (
        <p role={message.failed ? "alert" : "status"} data-testid="genesis-support-help-message" className={message.failed ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving} aria-busy={saving} data-testid="genesis-support-help-save">
          {saving ? copy.helpAdmin.saving : copy.helpAdmin.save}
        </Button>
        {article ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" data-testid="genesis-support-help-delete">
                {copy.helpAdmin.delete}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{copy.helpAdmin.deleteConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{copy.helpAdmin.deleteConfirmBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{copy.helpAdmin.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={remove} data-testid="genesis-support-help-delete-confirm">
                  {copy.helpAdmin.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </form>
  );
}

/** A tenant's help center, for its agents. */
export function SupportHelpCenterAdmin(props: SupportHelpCenterAdminProps) {
  const tenant = useResolvedTenant(props.client, props.tenantId);
  if (!tenant.ready) return <Skeleton className="h-64 w-full" />;
  return <HelpCenterAdmin key={scopeOf(props.client, tenant.tenantId)} {...props} tenantId={tenant.tenantId} />;
}

function HelpCenterAdmin({ client, tenantId, articleId, onArticleChange, copy: copyOverrides, onError, className }: SupportHelpCenterAdminProps) {
  const copy = useMemo(() => resolveSupportCopy(copyOverrides), [copyOverrides]);
  const queryClient = useQueryClient();
  const collectionId = useId();
  const [newCollection, setNewCollection] = useState("");
  const [collectionFailed, setCollectionFailed] = useState(false);
  const report = useRef(onError);
  report.current = onError;

  const scope = scopeOf(client, tenantId ?? null);
  const tenantArg = { tenantId: tenantId ?? null };
  const list = useQuery({ queryKey: keys.list(scope), queryFn: () => required(client.helpArticles)({ ...tenantArg, includeDrafts: true }) });
  const collections = useQuery({ queryKey: keys.collections(scope), queryFn: () => required(client.helpCollections)(tenantArg) });
  const opening = articleId && articleId !== NEW ? articleId : null;
  const article = useQuery({ queryKey: keys.article(scope, opening ?? ""), queryFn: () => required(client.helpArticle)(opening as string, tenantArg), enabled: Boolean(opening) });
  useEffect(() => {
    for (const error of [list.error, collections.error, article.error]) if (error) report.current?.(error);
  }, [list.error, collections.error, article.error]);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.all });
  const items = useMemo<InboxItem[]>(
    () =>
      (list.data ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        ...(a.summary ? { preview: a.summary } : {}),
        meta: copy.helpAdmin.statuses[a.status],
      })),
    [list.data, copy],
  );
  const addCollection = (e: FormEvent) => {
    e.preventDefault();
    const title = newCollection.trim();
    if (!title) return;
    setCollectionFailed(false);
    required(client.saveHelpCollection)({ ...tenantArg, title, position: collections.data?.length ?? 0 })
      .then(() => {
        setNewCollection("");
        refresh();
      })
      .catch((error: unknown) => {
        setCollectionFailed(true);
        report.current?.(error);
      });
  };

  const removeCollection = (id: string) => {
    setCollectionFailed(false);
    required(client.deleteHelpCollection)(id)
      .then(refresh)
      .catch((error: unknown) => {
        setCollectionFailed(true);
        report.current?.(error);
      });
  };

  const header = (
    <div className="flex flex-col gap-2 border-b p-3">
      <Button onClick={() => onArticleChange(NEW)} data-testid="genesis-support-help-new">
        {copy.helpAdmin.newArticle}
      </Button>
      <form onSubmit={addCollection} className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor={collectionId} className="text-xs">
            {copy.helpAdmin.newCollection}
          </Label>
          <Input id={collectionId} value={newCollection} maxLength={120} onChange={(e) => setNewCollection(e.target.value)} aria-label={copy.helpAdmin.newCollectionLabel} data-testid="genesis-support-help-new-collection" />
        </div>
        <Button type="submit" variant="secondary" data-testid="genesis-support-help-add-collection">
          {copy.helpAdmin.addCollection}
        </Button>
      </form>
      {(collections.data ?? []).length ? (
        <ul aria-label={copy.helpAdmin.collection} className="flex flex-wrap gap-1 text-sm">
          {(collections.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-md border pl-2">
              {c.title}
              <Button type="button" variant="ghost" size="sm" aria-label={`${copy.helpAdmin.delete}: ${c.title}`} onClick={() => removeCollection(c.id)} data-testid={`genesis-support-help-delete-collection-${c.id}`}>
                {copy.helpAdmin.delete}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {collectionFailed ? (
        <p role="alert" className="text-sm text-destructive">
          {copy.helpAdmin.failed}
        </p>
      ) : null}
    </div>
  );

  const editor =
    articleId === NEW ? (
      <Editor key="new" client={client} tenantArg={tenantArg} article={null} collections={collections.data ?? []} copy={copy} onSaved={(id) => { refresh(); onArticleChange(id); }} onDeleted={() => onArticleChange(null)} onError={onError} />
    ) : opening && article.isPending ? (
      <div className="flex flex-col gap-3 p-4" aria-busy="true" data-testid="genesis-support-help-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    ) : opening && article.data ? (
      <Editor
        key={article.data.id}
        client={client}
        tenantArg={tenantArg}
        article={article.data}
        collections={collections.data ?? []}
        copy={copy}
        onSaved={refresh}
        onDeleted={() => {
          refresh();
          onArticleChange(null);
        }}
        onError={onError}
      />
    ) : (
      <div data-testid="genesis-support-help-none">
        <EmptyState title={opening ? copy.helpAdmin.notFound : copy.helpAdmin.pickTitle} {...(opening ? {} : { description: copy.helpAdmin.pickBody })} />
      </div>
    );

  return (
    <InboxLayout
      {...(className ? { className } : {})}
      testID="genesis-support-help-admin"
      threadOpen={Boolean(articleId)}
      onBack={() => onArticleChange(null)}
      labels={{ list: copy.helpAdmin.listLabel, thread: copy.helpAdmin.body, back: copy.messenger.back }}
      list={
        <InboxPage
          testID="genesis-support-help-list"
          header={header}
          items={items}
          selectedId={opening}
          onSelect={(id) => onArticleChange(id)}
          loading={list.isPending}
          error={list.isError}
          errorTitle={copy.helpAdmin.errorTitle}
          errorBody={copy.helpAdmin.errorBody}
          emptyTitle={copy.helpAdmin.emptyTitle}
          emptyBody={copy.helpAdmin.emptyBody}
          hasMore={false}
          label={copy.helpAdmin.listLabel}
        />
      }
      thread={editor}
    />
  );
}
