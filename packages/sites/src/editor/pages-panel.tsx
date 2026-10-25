/**
 * The Pages panel: the site's pages (open, add from a template, change an
 * address, delete, reorder) and its menu.
 */
import * as React from "react";
import { ArrowDown, ArrowUp, FileText, Home, Plus, Trash2 } from "lucide-react";
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
import { Button } from "@marktiderman/genesis-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui/dialog";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { RadioGroup, RadioGroupItem } from "@marktiderman/genesis-ui/radio-group";
import { Separator } from "@marktiderman/genesis-ui/separator";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { MenuItem, PageMeta } from "../core/schemas";
import { isSafeHref, type ReservedPaths } from "../core/urls";
import { pageTemplates, pathProblems, slugify, type PageTemplate } from "./site-actions";

export interface NewPageRequest {
  title: string;
  path: string;
  template: PageTemplate;
  addToMenu: boolean;
}

export interface PagesPanelProps {
  pages: readonly PageMeta[];
  currentId: string | null;
  nav: readonly MenuItem[];
  reserved?: ReservedPaths | undefined;
  canReorder: boolean;
  busy: boolean;
  onOpen(pageId: string): void;
  onCreate(request: NewPageRequest): Promise<void>;
  onRename(pageId: string, path: string): Promise<void>;
  onDelete(pageId: string): Promise<void>;
  onReorder(pageId: string, by: -1 | 1): Promise<void>;
  onNavChange(nav: MenuItem[]): void;
  onEditFooter(): void;
}

function AddPageDialog({ open, onOpenChange, pages, reserved, onCreate }: { open: boolean; onOpenChange(open: boolean): void; pages: readonly PageMeta[]; reserved?: ReservedPaths | undefined; onCreate(r: NewPageRequest): Promise<void> }) {
  const templates = React.useMemo(() => pageTemplates(), []);
  const [title, setTitle] = React.useState("");
  const [path, setPath] = React.useState("");
  const [pathEdited, setPathEdited] = React.useState(false);
  const [templateId, setTemplateId] = React.useState("blank");
  const [addToMenu, setAddToMenu] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  React.useEffect(() => {
    if (open) {
      setTitle("");
      setPath("");
      setPathEdited(false);
      setTemplateId("blank");
      setAddToMenu(true);
      setError(null);
    }
  }, [open]);
  const problems = path ? pathProblems(path, pages, { ...(reserved ? { reserved } : {}) }) : [];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Give the page a title.");
    if (problems.length) return setError(problems.join(" "));
    setBusy(true);
    try {
      await onCreate({ title: title.trim(), path, template: templates.find((t) => t.id === templateId)!, addToMenu });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a page</DialogTitle>
            <DialogDescription>Start blank, from a template, or with a landing page made from your brand.</DialogDescription>
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
                if (!pathEdited) setPath(t.trim() ? slugify(t) : "");
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-path`}>Address</Label>
            <Input
              id={`${id}-path`}
              value={path}
              placeholder="/about"
              aria-invalid={problems.length > 0 || undefined}
              aria-describedby={`${id}-path-hint`}
              onChange={(e) => {
                setPath(e.currentTarget.value);
                setPathEdited(true);
              }}
            />
            <p id={`${id}-path-hint`} className={problems.length ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {problems.length ? problems.join(" ") : "Lowercase letters, digits and hyphens, starting with /."}
            </p>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Start from</legend>
            <RadioGroup value={templateId} onValueChange={setTemplateId} className="flex flex-col gap-2">
              {templates.map((t) => (
                <div key={t.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                  <RadioGroupItem id={`${id}-t-${t.id}`} value={t.id} className="mt-0.5" aria-describedby={`${id}-t-${t.id}-d`} />
                  <div className="flex flex-col">
                    <Label htmlFor={`${id}-t-${t.id}`}>{t.label}</Label>
                    <span id={`${id}-t-${t.id}-d`} className="text-sm text-muted-foreground">
                      {t.description}
                    </span>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex items-center gap-2">
            <Switch id={`${id}-menu`} checked={addToMenu} onCheckedChange={setAddToMenu} />
            <Label htmlFor={`${id}-menu`}>Add it to the menu</Label>
          </div>
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
              Add page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ page, pages, reserved, onClose, onRename }: { page: PageMeta | null; pages: readonly PageMeta[]; reserved?: ReservedPaths | undefined; onClose(): void; onRename(id: string, path: string): Promise<void> }) {
  const [path, setPath] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  React.useEffect(() => {
    setPath(page?.path ?? "");
    setError(null);
  }, [page]);
  if (!page) return null;
  const problems = path && path !== page.path ? pathProblems(path, pages, { except: page.id, ...(reserved ? { reserved } : {}) }) : [];
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (path === page.path) return onClose();
            if (problems.length) return setError(problems.join(" "));
            setBusy(true);
            try {
              await onRename(page.id, path);
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
            <DialogDescription>The old address, {page.path}, will redirect here, so links and search results keep working.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-path`}>New address</Label>
            <Input id={`${id}-path`} value={path} autoFocus aria-invalid={problems.length > 0 || undefined} aria-describedby={`${id}-hint`} onChange={(e) => setPath(e.currentTarget.value)} />
            <p id={`${id}-hint`} className={problems.length ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {problems.length ? problems.join(" ") : "Lowercase letters, digits and hyphens, starting with /."}
            </p>
          </div>
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
              Change address
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const menuProblems = (item: MenuItem): string[] => {
  const out: string[] = [];
  if (!item.label.trim()) out.push("Needs a label.");
  else if (item.label.trim().length > 40) out.push("At most 40 characters.");
  if (!isSafeHref(item.href)) out.push("Use a site path (/about), a #section, or an https, mailto or tel link.");
  return out;
};

/** The menu editor: labels and links, in order. Saves only a menu that is valid. */
function MenuEditor({ nav, pages, onChange }: { nav: readonly MenuItem[]; pages: readonly PageMeta[]; onChange(nav: MenuItem[]): void }) {
  const [items, setItems] = React.useState<MenuItem[]>(() => nav.map((n) => ({ ...n })));
  const sent = React.useRef(JSON.stringify(nav));
  React.useEffect(() => {
    const incoming = JSON.stringify(nav);
    if (incoming !== sent.current) {
      sent.current = incoming;
      setItems(nav.map((n) => ({ ...n })));
    }
  }, [nav]);
  const id = React.useId();
  const commit = (next: MenuItem[]) => {
    setItems(next);
    if (next.every((i) => menuProblems(i).length === 0)) {
      const clean = next.map((i) => ({ label: i.label.trim(), href: i.href.trim() }));
      sent.current = JSON.stringify(clean);
      onChange(clean);
    }
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...items];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    commit(next);
  };
  const unlinked = pages.filter((p) => !items.some((i) => i.href === p.path));
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? <p className="text-sm text-muted-foreground">The menu is empty.</p> : null}
      <ol className="flex flex-col gap-3">
        {items.map((item, i) => {
          const problems = menuProblems(item);
          return (
            <li key={i} className="flex flex-col gap-2 rounded-md border border-border p-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-${i}-label`} className="text-xs">
                  Label
                </Label>
                <Input id={`${id}-${i}-label`} value={item.label} maxLength={40} onChange={(e) => commit(items.map((x, k) => (k === i ? { ...x, label: e.currentTarget.value } : x)))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-${i}-href`} className="text-xs">
                  Link
                </Label>
                <Input id={`${id}-${i}-href`} value={item.href} aria-invalid={problems.length > 0 || undefined} aria-describedby={`${id}-${i}-err`} onChange={(e) => commit(items.map((x, k) => (k === i ? { ...x, href: e.currentTarget.value } : x)))} />
              </div>
              {problems.length ? (
                <p id={`${id}-${i}-err`} className="text-xs text-destructive">
                  {problems.join(" ")} Not saved until fixed.
                </p>
              ) : null}
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label={`Move ${item.label || "item"} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Move ${item.label || "item"} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${item.label || "item"} from the menu`} onClick={() => commit(items.filter((_, k) => k !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        {unlinked.slice(0, 4).map((p) => (
          <Button key={p.id} type="button" size="sm" variant="outline" disabled={items.length >= 12} onClick={() => commit([...items, { label: p.title.slice(0, 40), href: p.path }])}>
            <Plus className="mr-1 h-3 w-3" /> {p.title}
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={items.length >= 12} onClick={() => commit([...items, { label: "", href: "" }])}>
          <Plus className="mr-1 h-3 w-3" /> Link
        </Button>
      </div>
    </div>
  );
}

export function PagesPanel(props: PagesPanelProps) {
  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState<PageMeta | null>(null);
  const [deleting, setDeleting] = React.useState<PageMeta | null>(null);
  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Pages</h2>
        <Button type="button" size="sm" onClick={() => setAdding(true)} disabled={props.busy}>
          <Plus className="mr-1 h-4 w-4" /> Add page
        </Button>
      </div>
      <ul className="flex flex-col gap-1" aria-label="Pages">
        {props.pages.map((p, i) => {
          const current = p.id === props.currentId;
          return (
            <li key={p.id} className={cn("group flex flex-col gap-1 rounded-md border p-2", current ? "border-primary bg-muted" : "border-transparent hover:border-border")}>
              <button type="button" className="flex items-center gap-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring" aria-current={current ? "page" : undefined} onClick={() => props.onOpen(p.id)} disabled={props.busy}>
                {p.path === "/" ? <Home aria-hidden className="h-4 w-4 shrink-0" /> : <FileText aria-hidden className="h-4 w-4 shrink-0" />}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{p.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {p.path}
                    {p.kind === "landing" ? " · landing" : ""}
                  </span>
                </span>
              </button>
              <div className="flex flex-wrap gap-1">
                {p.path !== "/" ? (
                  <Button type="button" size="sm" variant="ghost" disabled={props.busy} onClick={() => setRenaming(p)} aria-label={`Change the address of ${p.title}`}>
                    Address
                  </Button>
                ) : null}
                {props.canReorder ? (
                  <>
                    <Button type="button" size="icon" variant="ghost" disabled={props.busy || i === 0} aria-label={`Move ${p.title} up`} onClick={() => props.onReorder(p.id, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" disabled={props.busy || i === props.pages.length - 1} aria-label={`Move ${p.title} down`} onClick={() => props.onReorder(p.id, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
                {p.path !== "/" ? (
                  <Button type="button" size="icon" variant="ghost" disabled={props.busy} aria-label={`Delete ${p.title}`} onClick={() => setDeleting(p)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <Separator />
      <section aria-labelledby="gs-menu-heading" className="flex flex-col gap-2">
        <h2 id="gs-menu-heading" className="text-sm font-semibold">
          Menu
        </h2>
        <p className="text-sm text-muted-foreground">The links in the site's header. Use the arrows to reorder them.</p>
        <MenuEditor nav={props.nav} pages={props.pages} onChange={props.onNavChange} />
      </section>
      <Separator />
      <section aria-labelledby="gs-footer-heading" className="flex flex-col gap-2">
        <h2 id="gs-footer-heading" className="text-sm font-semibold">
          Footer links
        </h2>
        <p className="text-sm text-muted-foreground">The footer's links and columns are fields of the footer section.</p>
        <Button type="button" size="sm" variant="outline" onClick={props.onEditFooter}>
          Edit the footer
        </Button>
      </section>

      <AddPageDialog open={adding} onOpenChange={setAdding} pages={props.pages} reserved={props.reserved} onCreate={props.onCreate} />
      <RenameDialog page={renaming} pages={props.pages} reserved={props.reserved} onClose={() => setRenaming(null)} onRename={props.onRename} />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => (o ? null : setDeleting(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The page leaves the site at its next publish. Releases already published keep it, so a rollback brings it back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void props.onDelete(deleting.id);
                setDeleting(null);
              }}
            >
              Delete page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
