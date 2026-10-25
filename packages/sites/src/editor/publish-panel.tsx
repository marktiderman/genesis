/**
 * The Publish panel: the checks (errors block, warnings don't), this page's
 * SEO, preview, publish with a note, and the release history with rollback.
 * Rendered inside Puck, so its SEO fields edit the page through Puck's
 * history (undo works) and an issue can select its section.
 */
import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Eye, RotateCcw } from "lucide-react";
import { createUsePuck } from "@puckeditor/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@marktiderman/genesis-ui/alert-dialog";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Separator } from "@marktiderman/genesis-ui/separator";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import type { SiteIssue } from "../core/a11y";
import type { ReleaseMeta, Seo } from "../core/schemas";
import { isSafeImageSrc } from "../core/urls";
import type { EditorRootProps } from "./data";
import { useEditorServices } from "./services";

const usePuck = createUsePuck();

export interface PublishPanelProps {
  pagePath: string;
  pageTitle: string;
  siteName: string;
  issues: SiteIssue[] | null;
  checking: boolean;
  publishing: boolean;
  /** Why publishing is off now (unsaved changes, a conflict), or null. */
  blockedReason: string | null;
  releases: readonly ReleaseMeta[];
  liveReleaseId: string | null;
  previewUrl?: ((path: string) => string) | undefined;
  onCheck(): void;
  onPublish(note: string): Promise<boolean>;
  onRollback(releaseId: string): Promise<void>;
  onPreview(mode: "preview" | "live"): void;
  onOpenPage(pageId: string): void;
  currentPageId: string | null;
}

function SeoFields({ siteName, pagePath, pageTitle }: { siteName: string; pagePath: string; pageTitle: string }) {
  const seo = usePuck((s) => (s.appState.data.root.props as EditorRootProps | undefined)?.seo) as Seo | undefined;
  const root = usePuck((s) => s.appState.data.root);
  const dispatch = usePuck((s) => s.dispatch);
  const services = useEditorServices();
  const id = React.useId();
  const set = (patch: Partial<Seo>) => {
    const next = { ...(seo ?? {}), ...patch } as Record<string, unknown>;
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === "" || next[k] === false) delete next[k];
    dispatch({ type: "replaceRoot", root: { ...root, props: { ...((root.props ?? {}) as Record<string, unknown>), seo: next } as never } });
  };
  const title = seo?.title ?? "";
  const description = seo?.description ?? "";
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h3 id={`${id}-h`} className="text-sm font-semibold">
        Search and sharing for {pagePath}
      </h3>
      <div className="rounded-md border border-border p-3 text-sm" aria-label="Search result preview">
        <p className="truncate text-primary">{title || pageTitle}</p>
        <p className="truncate text-xs text-muted-foreground">
          {siteName} · {pagePath}
        </p>
        <p className="line-clamp-2 text-muted-foreground">{description || "No description: search engines will pick some text from the page."}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>Search title</Label>
        <Input id={`${id}-title`} value={title} maxLength={70} placeholder={pageTitle} aria-describedby={`${id}-title-n`} onChange={(e) => set({ title: e.currentTarget.value })} />
        <p id={`${id}-title-n`} className="text-xs text-muted-foreground">
          {title.length}/70. Empty uses the page title.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-desc`}>Description</Label>
        <Textarea id={`${id}-desc`} rows={3} value={description} maxLength={200} aria-describedby={`${id}-desc-n`} onChange={(e) => set({ description: e.currentTarget.value })} />
        <p id={`${id}-desc-n`} className="text-xs text-muted-foreground">
          {description.length}/200
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Share image</span>
        {seo?.ogImage?.src && isSafeImageSrc(seo.ogImage.src) ? <img src={seo.ogImage.src} alt={seo.ogImage.alt ?? ""} className="h-20 w-full rounded-md border border-border object-cover" /> : null}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              const picked = await services.pickImage(seo?.ogImage ? { current: { src: seo.ogImage.src, alt: seo.ogImage.alt ?? "" } } : {});
              if (picked) set({ ogImage: { ...picked, alt: picked.alt } as Seo["ogImage"] });
            }}
          >
            {seo?.ogImage ? "Replace share image" : "Choose share image"}
          </Button>
          {seo?.ogImage ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => set({ ogImage: undefined })}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch id={`${id}-noindex`} checked={seo?.noindex === true} onCheckedChange={(on) => set({ noindex: on || undefined })} />
        <Label htmlFor={`${id}-noindex`}>Hide this page from search engines</Label>
      </div>
    </section>
  );
}

function IssueList({ issues, currentPageId, onOpenPage }: { issues: SiteIssue[]; currentPageId: string | null; onOpenPage(id: string): void }) {
  const getSelectorForId = usePuck((s) => s.getSelectorForId);
  const dispatch = usePuck((s) => s.dispatch);
  const show = (issue: SiteIssue) => {
    if (issue.pageId && issue.pageId !== currentPageId) return onOpenPage(issue.pageId);
    if (!issue.sectionId) return;
    const selector = getSelectorForId(issue.sectionId);
    if (selector) dispatch({ type: "setUi", ui: { itemSelector: selector, rightSideBarVisible: true } });
  };
  return (
    <ul className="flex flex-col gap-2">
      {issues.map((issue, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {issue.severity === "error" ? <AlertCircle aria-label="Blocks publishing" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <AlertTriangle aria-label="Warning" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="flex-1">{issue.message}</span>
          {issue.sectionId || (issue.pageId && issue.pageId !== currentPageId) ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => show(issue)}>
              Show
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PublishPanel(props: PublishPanelProps) {
  const [note, setNote] = React.useState("");
  const [rollingBack, setRollingBack] = React.useState<ReleaseMeta | null>(null);
  const id = React.useId();
  const errors = props.issues?.filter((i) => i.severity === "error") ?? [];
  const warnings = props.issues?.filter((i) => i.severity === "warning") ?? [];
  const live = props.releases.find((r) => r.id === props.liveReleaseId);
  const canPublish = props.issues !== null && errors.length === 0 && !props.blockedReason && !props.checking;
  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Publish</h2>
        {live ? <Badge variant="success">Live: release {live.number}</Badge> : <Badge variant="muted">Not published</Badge>}
      </div>

      <section aria-labelledby={`${id}-checks`} aria-busy={props.checking} className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 id={`${id}-checks`} className="text-sm font-semibold">
            Checks
          </h3>
          <Button type="button" size="sm" variant="ghost" onClick={props.onCheck} loading={props.checking}>
            Check again
          </Button>
        </div>
        <div role="status" aria-live="polite" className="text-sm">
          {props.issues === null ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : errors.length ? (
            <span className="text-destructive">
              {errors.length} {errors.length === 1 ? "problem blocks" : "problems block"} publishing.
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <CheckCircle2 aria-hidden className="h-4 w-4" /> Ready to publish{warnings.length ? ` (${warnings.length} ${warnings.length === 1 ? "suggestion" : "suggestions"})` : ""}.
            </span>
          )}
        </div>
        {props.issues?.length ? <IssueList issues={[...errors, ...warnings]} currentPageId={props.currentPageId} onOpenPage={props.onOpenPage} /> : null}
      </section>

      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => props.onPreview("preview")}>
          <Eye aria-hidden className="mr-1 h-4 w-4" /> Preview this page
        </Button>
        {live ? (
          <Button type="button" size="sm" variant="outline" onClick={() => props.onPreview("live")}>
            View it live
          </Button>
        ) : null}
        {props.previewUrl ? (
          <Button asChild size="sm" variant="ghost">
            <a href={props.previewUrl(props.pagePath)} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden className="mr-1 h-4 w-4" /> Preview link
            </a>
          </Button>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await props.onPublish(note)) setNote("");
        }}
      >
        <Label htmlFor={`${id}-note`}>What changed (for the release history)</Label>
        <Input id={`${id}-note`} value={note} maxLength={200} placeholder="New spring timetable" onChange={(e) => setNote(e.currentTarget.value)} />
        <Button type="submit" disabled={!canPublish} loading={props.publishing} aria-describedby={`${id}-why`}>
          Publish site
        </Button>
        {props.blockedReason || errors.length ? (
          <p id={`${id}-why`} className="text-xs text-muted-foreground">
            {props.blockedReason ?? "Fix the problems above to publish."}
          </p>
        ) : null}
      </form>

      <Separator />
      <SeoFields siteName={props.siteName} pagePath={props.pagePath} pageTitle={props.pageTitle} />

      <Separator />
      <section aria-labelledby={`${id}-history`} className="flex flex-col gap-2">
        <h3 id={`${id}-history`} className="text-sm font-semibold">
          Release history
        </h3>
        {props.releases.length === 0 ? <p className="text-sm text-muted-foreground">Nothing published yet.</p> : null}
        <ol className="flex flex-col gap-2">
          {props.releases.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm">
              <span className="flex flex-col">
                <span className="font-medium">
                  Release {r.number}
                  {r.id === props.liveReleaseId ? (
                    <Badge variant="success" className="ml-2">
                      Live
                    </Badge>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(r.publishedAt ?? r.createdAt).toLocaleString()}</span>
                {r.note ? <span className="text-xs">{r.note}</span> : null}
              </span>
              {r.id !== props.liveReleaseId ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setRollingBack(r)} aria-label={`Roll back to release ${r.number}`}>
                  <RotateCcw aria-hidden className="mr-1 h-4 w-4" /> Roll back
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <AlertDialog open={rollingBack !== null} onOpenChange={(o) => (o ? null : setRollingBack(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back to release {rollingBack?.number}?</AlertDialogTitle>
            <AlertDialogDescription>The live site goes back to what release {rollingBack?.number} published, at once. Your drafts don't change; publish again to go forward.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rollingBack) void props.onRollback(rollingBack.id);
                setRollingBack(null);
              }}
            >
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
