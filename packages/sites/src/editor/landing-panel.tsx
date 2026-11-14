/**
 * The Landing pages section of the Pages tab: the site's landing pages
 * (title, address, published or not), a new one from the brand's template
 * under the landing directory, a new address, delete, and the directory
 * itself. A landing page opens in the same canvas as every other page.
 */
import * as React from "react";
import { Megaphone, Plus, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui/dialog";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { cn } from "@marktiderman/genesis-ui/utils";
import { landingDirectoryProblems, landingPages, landingPath, landingSlugOf, landingSlugProblems } from "../core/landing";
import type { PageMeta } from "../core/schemas";
import type { ReservedPaths } from "../core/urls";
import { slugify } from "./site-actions";

export interface LandingPanelProps {
  /** Every page of the site; the panel lists the landing ones. */
  pages: readonly PageMeta[];
  /** The site's landing directory (`landingDirectory(site)`). */
  directory: string;
  /** Ids of the pages in the live release, or null while unknown. */
  liveIds: ReadonlySet<string> | null;
  currentId: string | null;
  reserved?: ReservedPaths | undefined;
  busy: boolean;
  readOnly?: boolean | undefined;
  onOpen(pageId: string): void;
  onCreate(request: { title: string; slug: string }): Promise<void>;
  onMove(pageId: string, slug: string): Promise<void>;
  onDelete(pageId: string): Promise<void>;
  onSetDirectory(directory: string, movePages: boolean): Promise<void>;
}

const taken = (pages: readonly PageMeta[], path: string, except?: string) => (pages.some((p) => p.path === path && p.id !== except) ? [`A page is already at ${path}.`] : []);

function SlugField({ id, directory, slug, problems, onChange, autoFocus }: { id: string; directory: string; slug: string; problems: string[]; onChange(slug: string): void; autoFocus?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-slug`}>Address</Label>
      <div className="flex items-center gap-1">
        <span className="shrink-0 text-sm text-muted-foreground">{`${directory}/`}</span>
        <Input id={`${id}-slug`} value={slug} placeholder="spring-offer" autoFocus={autoFocus} aria-invalid={problems.length > 0 || undefined} aria-describedby={`${id}-slug-hint`} onChange={(e) => onChange(e.currentTarget.value)} />
      </div>
      <p id={`${id}-slug-hint`} className={problems.length ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {problems.length ? problems.join(" ") : "Lowercase letters, digits and hyphens."}
      </p>
    </div>
  );
}

function NewLandingDialog({ open, onOpenChange, pages, directory, reserved, onCreate }: { open: boolean; onOpenChange(open: boolean): void; pages: readonly PageMeta[]; directory: string; reserved?: ReservedPaths | undefined; onCreate(r: { title: string; slug: string }): Promise<void> }) {
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  React.useEffect(() => {
    if (open) {
      setTitle("");
      setSlug("");
      setSlugEdited(false);
      setError(null);
    }
  }, [open]);
  const problems = slug ? [...landingSlugProblems(directory, slug, reserved), ...taken(pages, landingPath(directory, slug))] : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return setError("Give the landing page a title.");
            if (!slug) return setError("Give the landing page an address.");
            if (problems.length) return setError(problems.join(" "));
            setBusy(true);
            try {
              await onCreate({ title: title.trim(), slug });
              onOpenChange(false);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New landing page</DialogTitle>
            <DialogDescription>A hero, what you offer, quotes and a call to action, made from your brand. It isn't added to the menu.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-title`}>Title</Label>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={120}
              autoFocus
              onChange={(e) => {
                const t = e.currentTarget.value;
                setTitle(t);
                if (!slugEdited) setSlug(t.trim() ? slugify(t).slice(1) : "");
              }}
            />
          </div>
          <SlugField
            id={id}
            directory={directory}
            slug={slug}
            problems={problems}
            onChange={(s) => {
              setSlug(s);
              setSlugEdited(true);
            }}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create landing page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveLandingDialog({ page, pages, directory, reserved, onClose, onMove }: { page: PageMeta | null; pages: readonly PageMeta[]; directory: string; reserved?: ReservedPaths | undefined; onClose(): void; onMove(id: string, slug: string): Promise<void> }) {
  const [slug, setSlug] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  const initial = page ? (landingSlugOf(directory, page.path) ?? page.path.split("/").pop() ?? "") : "";
  React.useEffect(() => {
    setSlug(initial);
    setError(null);
  }, [initial]);
  if (!page) return null;
  // A page outside the directory (left there when the directory changed) moves into it: the dialog says so.
  const outside = landingSlugOf(directory, page.path) === null;
  const path = landingPath(directory, slug);
  const unchanged = path === page.path;
  const problems = slug && !unchanged ? [...landingSlugProblems(directory, slug, reserved), ...taken(pages, path, page.id)] : [];
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (unchanged) return onClose();
            if (!slug) return setError("Give the landing page an address.");
            if (problems.length) return setError(problems.join(" "));
            setBusy(true);
            try {
              await onMove(page.id, slug);
              onClose();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Change the address of “{page.title}”</DialogTitle>
            <DialogDescription>
              The old address, {page.path}, will redirect here, so links in ads and emails keep working.
              {outside ? ` This page is outside ${directory}: saving moves it into ${directory}, at ${path}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <SlugField id={id} directory={directory} slug={slug} problems={problems} onChange={setSlug} autoFocus />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {outside ? `Move into ${directory}` : "Change address"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DirectoryDialog({ open, onOpenChange, pages, directory, reserved, onSave }: { open: boolean; onOpenChange(open: boolean): void; pages: readonly PageMeta[]; directory: string; reserved?: ReservedPaths | undefined; onSave(directory: string, movePages: boolean): Promise<void> }) {
  const [value, setValue] = React.useState(directory);
  const [movePages, setMovePages] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  React.useEffect(() => {
    if (open) {
      setValue(directory);
      setMovePages(true);
      setError(null);
    }
  }, [open, directory]);
  const problems = value && value !== directory ? landingDirectoryProblems(value, reserved) : [];
  const count = landingPages(pages).filter((p) => landingSlugOf(directory, p.path) !== null).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (value === directory) return onOpenChange(false);
            if (problems.length) return setError(problems.join(" "));
            setBusy(true);
            try {
              await onSave(value, count > 0 && movePages);
              onOpenChange(false);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Landing page directory</DialogTitle>
            <DialogDescription>Where new landing pages go: {landingPath(value || directory, "spring-offer")}, for example.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-dir`}>Directory</Label>
            <Input id={`${id}-dir`} value={value} placeholder="/go" autoFocus aria-invalid={problems.length > 0 || undefined} aria-describedby={`${id}-dir-hint`} onChange={(e) => setValue(e.currentTarget.value)} />
            <p id={`${id}-dir-hint`} className={problems.length ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {problems.length ? problems.join(" ") : 'Starts with "/": lowercase letters, digits and hyphens.'}
            </p>
          </div>
          {count > 0 ? (
            <div className="flex items-start gap-2">
              <Switch id={`${id}-move`} checked={movePages} onCheckedChange={setMovePages} aria-describedby={`${id}-move-d`} />
              <div className="flex flex-col">
                <Label htmlFor={`${id}-move`}>
                  Move the {count === 1 ? "landing page" : `${count} landing pages`} in {directory} too
                </Label>
                <span id={`${id}-move-d`} className="text-sm text-muted-foreground">
                  {movePages ? "Their old addresses redirect to the new ones." : "They keep their addresses; only new landing pages use the new directory."}
                </span>
              </div>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LandingPanel(props: LandingPanelProps) {
  const [adding, setAdding] = React.useState(false);
  const [moving, setMoving] = React.useState<PageMeta | null>(null);
  const [deleting, setDeleting] = React.useState<PageMeta | null>(null);
  const [editingDir, setEditingDir] = React.useState(false);
  const list = landingPages(props.pages);
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2" data-gs-landing="">
      <div className="flex items-center justify-between">
        <h2 id={headingId} className="text-sm font-semibold">
          Landing pages
        </h2>
        {props.readOnly ? null : (
          <Button type="button" size="sm" onClick={() => setAdding(true)} disabled={props.busy}>
            <Plus className="mr-1 h-4 w-4" /> New landing page
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Campaign pages, kept out of the menu, at {props.directory}/….
        {props.readOnly ? null : (
          <>
            {" "}
            <Button type="button" variant="link" size="sm" className="h-auto p-0" disabled={props.busy} onClick={() => setEditingDir(true)}>
              Change the directory
            </Button>
          </>
        )}
      </p>
      {list.length === 0 ? <p className="text-sm text-muted-foreground">No landing pages yet.</p> : null}
      <ul className="flex flex-col gap-1" aria-label="Landing pages">
        {list.map((p) => {
          const current = p.id === props.currentId;
          const live = props.liveIds?.has(p.id);
          return (
            <li key={p.id} className={cn("flex flex-col gap-1 rounded-md border p-2", current ? "border-primary bg-muted" : "border-transparent hover:border-border")}>
              <button type="button" className="flex items-center gap-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring" aria-current={current ? "page" : undefined} onClick={() => props.onOpen(p.id)} disabled={props.busy}>
                <Megaphone aria-hidden className="h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{p.path}</span>
                </span>
                {props.liveIds ? <Badge variant={live ? "default" : "secondary"}>{live ? "Published" : "Draft"}</Badge> : null}
              </button>
              {props.readOnly ? null : (
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={props.busy} onClick={() => setMoving(p)} aria-label={`Address of ${p.title}`}>
                    Address
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled={props.busy} aria-label={`Delete ${p.title}`} onClick={() => setDeleting(p)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <NewLandingDialog open={adding} onOpenChange={setAdding} pages={props.pages} directory={props.directory} reserved={props.reserved} onCreate={props.onCreate} />
      <MoveLandingDialog page={moving} pages={props.pages} directory={props.directory} reserved={props.reserved} onClose={() => setMoving(null)} onMove={props.onMove} />
      <DirectoryDialog open={editingDir} onOpenChange={setEditingDir} pages={props.pages} directory={props.directory} reserved={props.reserved} onSave={props.onSetDirectory} />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => (o ? null : setDeleting(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The landing page leaves the site at its next publish. Releases already published keep it, so a rollback brings it back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void props.onDelete(deleting.id);
                setDeleting(null);
              }}
            >
              Delete landing page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
