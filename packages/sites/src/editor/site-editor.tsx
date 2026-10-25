/**
 * `<SiteEditor>`: the visual editor for a genesis-sites site.
 *
 *   <SiteEditor siteId="riverside" store={store} brand={brand} />
 *
 * Puck runs the canvas, drag and drop, the fields and the history; every
 * panel around it is Genesis UI. The canvas is an iframe drawn by each
 * section's own renderer with the site's stylesheet and the brand's theme;
 * "Preview" runs the real `/web` request handler. Drafts autosave by
 * compare-and-swap; publishing runs the checks first.
 */
import * as React from "react";
import { Puck, createUsePuck, type Data } from "@puckeditor/core";
import { Monitor, Redo2, Smartphone, Tablet, Undo2 } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@marktiderman/genesis-ui/alert";
import { Button } from "@marktiderman/genesis-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui/dialog";
import { Spinner } from "@marktiderman/genesis-ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { FormsResolver, ResolvedForm } from "../core/forms";
import { PageDoc, SiteDoc, type MenuItem, type PageKind, type PageMeta, type Release, type ReleaseMeta } from "../core/schemas";
import type { SiteIssue } from "../core/a11y";
import { brandDisplayName, siteTheme, stableHash, themeCss, type BrandInput } from "../core/theme";
import type { ReservedPaths } from "../core/urls";
import { AssetPicker } from "./asset-picker";
import { scrollCanvasTo } from "./canvas-dom";
import { Autosaver, type AutosaveState } from "./autosave";
import { createEditorConfig, type CanvasMetadata } from "./config";
import { countTypes, fromEditorData, h1SectionId, placeholderSnapshot, toEditorData, type EditorData } from "./data";
import { genesisOverrides } from "./overrides";
import { PagesPanel, type NewPageRequest } from "./pages-panel";
import { loadSiteCss, renderPreview, styleText } from "./preview";
import { PublishPanel } from "./publish-panel";
import { EditorServicesContext, type EditorAssets, type EditorServices, type PickedImage } from "./services";
import { checkSite, movePageInList, publishSite, renamePage, type EditorSiteStore } from "./site-actions";

const usePuck = createUsePuck();

export interface SiteEditorProps {
  siteId: string;
  /** Any `SiteStore`: the Supabase one signed in as the editor, or the memory store. */
  store: EditorSiteStore;
  /** The site's brand: the canvas theme, and what a publish checks contrast against. */
  brand: BrandInput;
  /** Resolves form embeds' slugs, for the canvas and preview. */
  forms?: FormsResolver;
  /** The asset library and upload, beside the store's `putAsset`. */
  assets?: EditorAssets;
  /** After each publish. */
  onPublish?: (release: Release) => void;
  /** Paths the site can't use (default: the store's own rule). */
  reserved?: ReservedPaths;
  /** A link to the host's preview route for a page path (opens in a new tab). */
  previewUrl?: (path: string) => string;
  /** Milliseconds after the last change before a save (default 800). */
  autosaveDelay?: number;
  /** The page to open first (default: the home page). */
  initialPageId?: string;
  /**
   * The URL of the package's site stylesheet (`@marktiderman/genesis-sites/sites.css`, for example
   * Vite's `?url` import, or `/_gs/sites.<hash>.css` where `handleSiteRequest` is mounted). Without it
   * the canvas loads the stylesheet from the renderer's bundled assets, a larger download.
   */
  siteStylesheet?: string;
  className?: string;
}

interface OpenPage {
  id: string;
  path: string;
  kind: PageKind;
  data: EditorData;
  placeholders: Map<string, string>;
}

type Viewport = "desktop" | "tablet" | "phone";
const VIEWPORTS: Record<Viewport, { width: number | "100%"; label: string }> = {
  desktop: { width: "100%", label: "Desktop" },
  tablet: { width: 768, label: "Tablet" },
  phone: { width: 390, label: "Phone" },
};

const SAVE_LABEL: Record<AutosaveState<unknown>["status"], string> = {
  saved: "All changes saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  conflict: "Someone else saved: choose a version",
  error: "Couldn't save; retrying",
};

function worst(...states: (AutosaveState<unknown> | null)[]): AutosaveState<unknown>["status"] {
  const order: AutosaveState<unknown>["status"][] = ["conflict", "error", "saving", "pending", "saved"];
  for (const s of order) if (states.some((x) => x?.status === s)) return s;
  return "saved";
}

/** The site's stylesheet and theme in the canvas iframe. */
function useCanvasFrame(css: string | null, href: string | undefined, theme: string, dark: boolean, lang: string) {
  return React.useCallback(
    ({ children, document }: { children: React.ReactNode; document?: Document }) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useEffect(() => {
        if (!document) return;
        const nodes: HTMLElement[] = [];
        if (href) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          link.dataset.gsSiteCss = "";
          nodes.push(link);
        } else if (css) {
          const site = document.createElement("style");
          site.dataset.gsSiteCss = "";
          site.textContent = styleText(css);
          nodes.push(site);
        }
        const vars = document.createElement("style");
        vars.dataset.gsTheme = "";
        // Raised above the host app's own :root variables, which Puck copies into the frame (and may copy again later).
        vars.textContent = styleText(theme.replace(/:root/g, "html:root"));
        nodes.push(vars);
        for (const n of nodes) document.head.appendChild(n);
        // Puck copies the host app's stylesheets into the frame (its own canvas styles are among them) and copies
        // them again as they change; the site's styles stay last, so the canvas draws what publishes.
        const keepLast = new MutationObserver(() => {
          const last = document.head.lastElementChild;
          if (last && !nodes.includes(last as HTMLElement)) for (const n of nodes) document.head.appendChild(n);
        });
        keepLast.observe(document.head, { childList: true });
        const html = document.documentElement;
        html.lang = lang;
        html.dataset.gsSite = "";
        html.classList.toggle("dark", dark);
        document.body.classList.add("bg-background", "font-sans", "text-foreground", "antialiased");
        return () => {
          keepLast.disconnect();
          for (const n of nodes) n.remove();
        };
      }, [document]);
      return <>{children}</>;
    },
    [css, href, theme, dark, lang],
  );
}

function Toolbar({ siteName, pageTitle, saveStatus, viewport, onViewport, onPreview }: { siteName: string; pageTitle: string; saveStatus: AutosaveState<unknown>["status"]; viewport: Viewport; onViewport(v: Viewport): void; onPreview(): void }) {
  const history = usePuck((s) => s.history);
  const dispatch = usePuck((s) => s.dispatch);
  const choose = (v: Viewport) => {
    onViewport(v);
    dispatch({ type: "setUi", ui: (ui) => ({ viewports: { ...ui.viewports, current: { width: VIEWPORTS[v].width, height: "auto" } } }) });
  };
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-muted-foreground">{siteName}</span>
        <span className="truncate text-sm font-semibold">{pageTitle}</span>
      </div>
      <div className="flex items-center gap-1" role="toolbar" aria-label="Editor">
        <Button type="button" size="icon" variant="ghost" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.hasPast} onClick={() => history.back()}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.hasFuture} onClick={() => history.forward()}>
          <Redo2 className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        {(["desktop", "tablet", "phone"] as const).map((v) => {
          const Icon = v === "desktop" ? Monitor : v === "tablet" ? Tablet : Smartphone;
          return (
            <Button key={v} type="button" size="icon" variant={viewport === v ? "secondary" : "ghost"} aria-label={`${VIEWPORTS[v].label} width`} aria-pressed={viewport === v} onClick={() => choose(v)}>
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span role="status" aria-live="polite" className={cn("text-xs", saveStatus === "conflict" || saveStatus === "error" ? "text-destructive" : "text-muted-foreground")}>
          {SAVE_LABEL[saveStatus]}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={onPreview}>
          Preview
        </Button>
      </div>
    </header>
  );
}

/** Selects the footer's first section (from the Pages panel's "Edit the footer"). */
function useSelectFooter() {
  const dispatch = usePuck((s) => s.dispatch);
  const getSelectorForId = usePuck((s) => s.getSelectorForId);
  const footer = usePuck((s) => (s.appState.data.root.props as EditorData["root"]["props"] | undefined)?.footer);
  return () => {
    const first = footer?.[0];
    const selector = first ? getSelectorForId(first.props.id) : undefined;
    if (selector) dispatch({ type: "setUi", ui: { itemSelector: selector, rightSideBarVisible: true } });
  };
}

/** Selecting a section on the canvas opens its fields. */
function SelectionWatcher({ onSelect }: { onSelect(): void }) {
  const selected = usePuck((s) => s.selectedItem?.props.id as string | undefined);
  React.useEffect(() => {
    if (selected) onSelect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  return null;
}

function PagesTab(props: Omit<React.ComponentProps<typeof PagesPanel>, "onEditFooter"> & { onFooter(): void }) {
  const selectFooter = useSelectFooter();
  return (
    <PagesPanel
      {...props}
      onEditFooter={() => {
        selectFooter();
        props.onFooter();
      }}
    />
  );
}

/**
 * The visual editor.
 *
 * @stability Beta
 */
export function SiteEditor({ siteId, store, brand, forms, assets, onPublish, reserved, previewUrl, autosaveDelay, initialPageId, siteStylesheet, className }: SiteEditorProps) {
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [site, setSite] = React.useState<SiteDoc | null>(null);
  const [pages, setPages] = React.useState<PageMeta[]>([]);
  const [open, setOpen] = React.useState<OpenPage | null>(null);
  const [editorKey, setEditorKey] = React.useState(0);
  const [siteState, setSiteState] = React.useState<AutosaveState<SiteDoc> | null>(null);
  const [pageState, setPageState] = React.useState<AutosaveState<PageDoc> | null>(null);
  const [invalid, setInvalid] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [css, setCss] = React.useState<string | null>(null);
  const [h1Id, setH1Id] = React.useState<string | null>(null);
  const [formMap, setFormMap] = React.useState<ReadonlyMap<string, ResolvedForm | null>>(new Map());
  const [issues, setIssues] = React.useState<SiteIssue[] | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [releases, setReleases] = React.useState<ReleaseMeta[]>([]);
  const [liveId, setLiveId] = React.useState<string | null>(null);
  const [leftTab, setLeftTab] = React.useState("add");
  const [rightTab, setRightTab] = React.useState("edit");
  const [viewport, setViewport] = React.useState<Viewport>("desktop");
  const [picker, setPicker] = React.useState<{ current?: PickedImage; resolve(v: PickedImage | null): void } | null>(null);
  const [preview, setPreview] = React.useState<{ mode: "preview" | "live"; path: string; html: string | null; note?: string } | null>(null);

  const siteSaver = React.useRef<Autosaver<SiteDoc> | null>(null);
  const pageSaver = React.useRef<Autosaver<PageDoc> | null>(null);
  const counts = React.useRef<ReadonlyMap<string, number>>(new Map());

  const kind = open?.kind ?? "page";
  const editor = React.useMemo(() => createEditorConfig({ kind, counts: () => counts.current }), [kind]);
  const theme = React.useMemo(() => {
    try {
      return siteTheme(brand, site?.theme ?? {});
    } catch (err) {
      console.error("[genesis-sites/editor] the brand can't make a theme; the canvas uses Genesis's default.", err);
      return siteTheme({ name: brandDisplayName(brand), colors: { primary: "#4f46e5" } }, site?.theme ?? {});
    }
  }, [brand, site?.theme]);
  const iframe = useCanvasFrame(css, siteStylesheet, themeCss(theme), theme.colorScheme === "dark", site?.lang ?? "en");

  // ── Loading ───────────────────────────────────────────────────────────────
  const loadPage = React.useCallback(
    async (pageId: string, siteDoc: SiteDoc) => {
      const draft = await store.getPageDraft(pageId);
      if (!draft) throw new Error("That page no longer exists, or you can't edit it.");
      pageSaver.current?.dispose();
      const saver = new Autosaver<PageDoc>({ rev: draft.rev, save: (rev, doc) => store.savePageDraft(pageId, rev, doc), delay: autosaveDelay ?? 800, onState: setPageState }, draft.doc);
      pageSaver.current = saver;
      setPageState(saver.current);
      const placeholders = placeholderSnapshot(draft.doc.content);
      placeholderSnapshot(siteDoc.header, placeholders);
      placeholderSnapshot(siteDoc.footer, placeholders);
      const data = toEditorData(draft.doc, siteDoc, editor.slotKeys);
      counts.current = countTypes(data);
      setH1Id(h1SectionId(data.content));
      setInvalid(null);
      setOpen({ id: pageId, path: draft.path, kind: draft.kind, data, placeholders });
      setEditorKey((k) => k + 1);
    },
    [store, autosaveDelay, editor.slotKeys],
  );

  const refreshPublishing = React.useCallback(async () => {
    const [list, live] = await Promise.all([store.listReleases(siteId), store.getLive(siteId)]);
    setReleases(list);
    setLiveId(live?.id ?? null);
  }, [store, siteId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await store.getDraft(siteId);
        if (!draft) throw new Error(`There's no site "${siteId}", or you can't edit it.`);
        const list = await store.listPages(siteId);
        if (cancelled) return;
        siteSaver.current?.dispose();
        const saver = new Autosaver<SiteDoc>({ rev: draft.rev, save: (rev, doc) => store.saveSiteDraft(siteId, rev, doc), delay: autosaveDelay ?? 800, onState: setSiteState }, draft.site);
        siteSaver.current = saver;
        setSiteState(saver.current);
        setSite(draft.site);
        setPages(list);
        const first = list.find((p) => p.id === initialPageId) ?? list.find((p) => p.path === "/") ?? list[0];
        if (first) await loadPage(first.id, draft.site);
        await refreshPublishing();
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    if (!siteStylesheet) loadSiteCss().then(setCss, (err: unknown) => console.error("[genesis-sites/editor] the site stylesheet didn't load; the canvas is unstyled.", err));
    return () => {
      cancelled = true;
      siteSaver.current?.dispose();
      pageSaver.current?.dispose();
    };
    // Reload only for another site or store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, store]);

  // Nothing unsaved is lost by closing the tab without being asked.
  React.useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (siteSaver.current?.dirty || pageSaver.current?.dirty || invalid) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [invalid]);

  // Forms on the page, for the canvas.
  const formSlugs = React.useMemo(() => {
    const slugs = new Set<string>();
    for (const item of open?.data.content ?? []) if (item.type.startsWith("form-embed") && typeof item.props.form === "string") slugs.add(item.props.form);
    return [...slugs].sort().join(",");
  }, [open]);
  React.useEffect(() => {
    if (!forms || !formSlugs) return;
    let cancelled = false;
    Promise.all(formSlugs.split(",").map(async (slug) => [slug, await Promise.resolve(forms(slug, { siteId, pagePath: open?.path ?? "/", mode: "preview" })).catch(() => null)] as const)).then((entries) => {
      if (!cancelled) setFormMap(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [forms, formSlugs, siteId, open?.path]);

  // ── Changes ───────────────────────────────────────────────────────────────
  const onChange = React.useCallback(
    (data: Data) => {
      if (!open || !site) return;
      const editorData = data as unknown as EditorData;
      counts.current = countTypes(editorData);
      setH1Id(h1SectionId(editorData.content ?? []));
      const result = fromEditorData(data as never, { slotKeys: editor.slotKeys, placeholders: open.placeholders });
      const page = PageDoc.safeParse(result.page);
      const current = siteSaver.current?.latest ?? site;
      const nextSite = SiteDoc.safeParse({ ...current, header: result.header, footer: result.footer });
      const problems = [
        ...(page.success ? [] : page.error.issues.map((i) => (i.path.join(".") === "root.props.title" ? "The page needs a title." : `${i.path.join(".")}: ${i.message}`))),
        ...(nextSite.success ? [] : nextSite.error.issues.map((i) => `Site ${i.path.join(".")}: ${i.message}`)),
      ];
      setInvalid(problems.length ? problems.join(" ") : null);
      if (page.success) {
        // The parsed document, so what is stored has the schema's key order and an unchanged page compares equal.
        pageSaver.current?.update(page.data);
        const title = page.data.root.props.title;
        setPages((list) => (list.some((p) => p.id === open.id && p.title !== title) ? list.map((p) => (p.id === open.id ? { ...p, title } : p)) : list));
      }
      if (nextSite.success && (stableHash(current.header) !== stableHash(nextSite.data.header) || stableHash(current.footer) !== stableHash(nextSite.data.footer))) {
        siteSaver.current?.update(nextSite.data);
        setSite(nextSite.data);
      }
    },
    [open, site, editor.slotKeys],
  );

  const onNavChange = React.useCallback(
    (nav: MenuItem[]) => {
      const current = siteSaver.current?.latest ?? site;
      if (!current) return;
      const next = SiteDoc.safeParse({ ...current, nav });
      if (!next.success) return setNotice({ tone: "error", text: `The menu can't be saved: ${next.error.issues[0]?.message ?? "invalid"}` });
      siteSaver.current?.update(next.data);
      setSite(next.data);
    },
    [site],
  );

  /** Save everything now; false (with a notice) when something can't be. */
  const flushAll = React.useCallback(async (): Promise<boolean> => {
    if (invalid) {
      setNotice({ tone: "error", text: `Fix this first: ${invalid}` });
      return false;
    }
    try {
      await Promise.all([pageSaver.current?.flush(), siteSaver.current?.flush()]);
      return true;
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message });
      return false;
    }
  }, [invalid]);

  /** The store moved a document on (a move, a create, a publish): adopt its revisions, keep unsaved edits. */
  const resync = React.useCallback(async () => {
    const [draft, list] = await Promise.all([store.getDraft(siteId), store.listPages(siteId)]);
    setPages(list);
    if (draft && siteSaver.current) {
      const unsaved = siteSaver.current.dirty;
      siteSaver.current.rebase(draft.rev, unsaved ? undefined : draft.site);
      if (!unsaved) setSite(draft.site);
    }
    if (open && pageSaver.current) {
      const p = await store.getPageDraft(open.id);
      if (p) {
        const unsaved = pageSaver.current.dirty;
        // Key order differs once the store has parsed a document: compare by content.
        const before = stableHash(pageSaver.current.latest);
        pageSaver.current.rebase(p.rev, unsaved ? undefined : p.doc);
        if (p.path !== open.path) setOpen((o) => (o ? { ...o, path: p.path } : o));
        // A publish that migrated the page's props: show what the store has now.
        if (!unsaved && stableHash(p.doc) !== before && draft) {
          const data = toEditorData(p.doc, draft.site, editor.slotKeys);
          setOpen((o) => (o ? { ...o, data } : o));
          setEditorKey((k) => k + 1);
        }
      }
    }
    return { draft, list };
  }, [store, siteId, open, editor.slotKeys]);

  const runCheck = React.useCallback(async () => {
    if (!(await flushAll())) return;
    setChecking(true);
    try {
      const result = await checkSite(store, siteId, { brand, ...(reserved ? { reserved } : {}) });
      setIssues(result.issues);
    } catch (err) {
      setIssues([{ severity: "error", code: "check-failed", message: `The checks couldn't run: ${(err as Error).message}` }]);
    } finally {
      setChecking(false);
    }
  }, [flushAll, store, siteId, brand, reserved]);

  // Re-check a moment after the drafts settle, while the Publish tab is open.
  const settled = worst(siteState, pageState) === "saved" && !invalid;
  React.useEffect(() => {
    if (rightTab !== "publish" || !settled) return;
    const t = setTimeout(() => void runCheck(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab, settled, siteState?.rev, pageState?.rev]);

  // ── Pages ─────────────────────────────────────────────────────────────────
  const openPage = async (pageId: string) => {
    if (pageId === open?.id) return;
    if (!(await flushAll())) return;
    setBusy(true);
    try {
      await loadPage(pageId, siteSaver.current?.latest ?? site!);
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const createPage = async (request: NewPageRequest) => {
    if (!(await flushAll())) throw new Error("Save your changes first.");
    const doc = request.template.doc({ title: request.title, brand });
    const meta = await store.createPage(siteId, { path: request.path, kind: request.template.kind, doc });
    const { draft } = await resync();
    if (request.addToMenu && draft) {
      const nav = [...draft.site.nav, { label: request.title.slice(0, 40), href: request.path }];
      if (nav.length <= 12) onNavChange(nav);
      await siteSaver.current?.flush().catch(() => undefined);
    }
    await loadPage(meta.id, siteSaver.current?.latest ?? draft?.site ?? site!);
    setNotice({ tone: "info", text: `Added ${request.title} at ${request.path}.` });
  };

  const rename = async (pageId: string, path: string) => {
    if (!(await flushAll())) throw new Error("Save your changes first.");
    const before = pages.find((p) => p.id === pageId)?.path;
    const moved = await renamePage(store, pageId, path, reserved ? { reserved } : {});
    const { draft } = await resync();
    // Menu links to the old address follow the page.
    if (draft && before && draft.site.nav.some((n) => n.href === before)) onNavChange(draft.site.nav.map((n) => (n.href === before ? { ...n, href: moved.path } : n)));
    setNotice({ tone: "info", text: `Moved to ${moved.path}. ${before} now redirects there.` });
  };

  const remove = async (pageId: string) => {
    if (!(await flushAll())) return;
    setBusy(true);
    try {
      const gone = pages.find((p) => p.id === pageId);
      await store.deletePage(pageId);
      const { draft, list } = await resync();
      if (draft && gone && draft.site.nav.some((n) => n.href === gone.path)) onNavChange(draft.site.nav.filter((n) => n.href !== gone.path));
      if (pageId === open?.id) {
        const home = list.find((p) => p.path === "/") ?? list[0];
        if (home && draft) await loadPage(home.id, siteSaver.current?.latest ?? draft.site);
      }
      setNotice({ tone: "info", text: `Deleted ${gone?.title ?? "the page"}.` });
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const reorder = async (pageId: string, by: -1 | 1) => {
    try {
      setPages(await movePageInList(store, siteId, pageId, by));
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message });
    }
  };

  // ── Publishing ────────────────────────────────────────────────────────────
  const publish = async (note: string): Promise<boolean> => {
    if (!(await flushAll())) return false;
    setPublishing(true);
    try {
      const result = await publishSite(store, siteId, { brand, note, ...(reserved ? { reserved } : {}) });
      if ("blocked" in result) {
        setIssues(result.blocked);
        setNotice({ tone: "error", text: "Not published: fix the problems the checks list." });
        return false;
      }
      await resync();
      await refreshPublishing();
      setNotice({ tone: "info", text: `Published release ${result.release.number}.` });
      onPublish?.(result.release);
      return true;
    } catch (err) {
      setNotice({ tone: "error", text: `Publishing failed: ${(err as Error).message}` });
      return false;
    } finally {
      setPublishing(false);
    }
  };

  const rollback = async (releaseId: string) => {
    try {
      const release = await store.rollback(siteId, releaseId);
      await refreshPublishing();
      setNotice({ tone: "info", text: `The live site is release ${release.number} again.` });
    } catch (err) {
      setNotice({ tone: "error", text: `Rolling back failed: ${(err as Error).message}` });
    }
  };

  const showPreview = async (mode: "preview" | "live") => {
    if (!open) return;
    if (mode === "preview" && !(await flushAll())) return;
    setPreview({ mode, path: open.path, html: null });
    try {
      const result = await renderPreview({ store, siteId, brand, path: open.path, mode, ...(forms ? { forms } : {}) });
      setPreview({
        mode,
        path: open.path,
        html: result.html,
        ...(result.html ? {} : { note: result.location ? `This address redirects to ${result.location}.` : mode === "live" ? "This page isn't on the live site." : "This page couldn't be drawn." }),
      });
    } catch (err) {
      setPreview({ mode, path: open.path, html: null, note: `The preview failed: ${(err as Error).message}` });
    }
  };

  // ── Conflicts ─────────────────────────────────────────────────────────────
  const conflict = pageState?.status === "conflict" ? "page" : siteState?.status === "conflict" ? "site" : null;
  const resolveConflict = async (choice: "reload" | "overwrite") => {
    if (!open || !site) return;
    if (choice === "overwrite") {
      const saver = conflict === "page" ? pageSaver.current : siteSaver.current;
      await (saver as Autosaver<unknown> | null)?.overwrite().catch((err: Error) => setNotice({ tone: "error", text: err.message }));
      return;
    }
    if (conflict === "site") {
      const theirs = siteSaver.current?.reload();
      if (theirs) {
        setSite(theirs);
        const page = pageSaver.current?.latest;
        if (page) {
          const placeholders = placeholderSnapshot(page.content);
          placeholderSnapshot(theirs.header, placeholders);
          placeholderSnapshot(theirs.footer, placeholders);
          setOpen({ ...open, data: toEditorData(page, theirs, editor.slotKeys), placeholders });
        }
        setEditorKey((k) => k + 1);
      }
    } else {
      const theirs = pageSaver.current?.reload();
      if (theirs) {
        setPages((list) => list.map((p) => (p.id === open.id ? { ...p, title: theirs.root.props.title } : p)));
        const siteDoc = siteSaver.current?.latest ?? site;
        // Their placeholders, and the header's and footer's, so a sample section stays one until it is edited.
        const placeholders = placeholderSnapshot(theirs.content);
        placeholderSnapshot(siteDoc.header, placeholders);
        placeholderSnapshot(siteDoc.footer, placeholders);
        setOpen({ ...open, data: toEditorData(theirs, siteDoc, editor.slotKeys), placeholders });
        setEditorKey((k) => k + 1);
      }
    }
  };

  // ── Services for fields ───────────────────────────────────────────────────
  const services = React.useMemo<EditorServices>(
    () => ({
      siteId,
      store,
      ...(assets ? { assets } : {}),
      pickImage: (opts) => new Promise((resolve) => setPicker({ ...(opts?.current ? { current: opts.current } : {}), resolve })),
    }),
    [siteId, store, assets],
  );

  const metadata = React.useMemo<CanvasMetadata>(
    () => ({
      site: { name: site?.name ?? "", lang: site?.lang ?? "en", nav: site?.nav ?? [], ...(brand && "logo" in brand && brand.logo ? { logo: { src: brand.logo.src, alt: brand.logo.alt?.trim() || brandDisplayName(brand) } } : {}) },
      pagePath: open?.path ?? "/",
      forms: Object.fromEntries(formMap),
      h1Id,
      placeholders: Object.fromEntries(open?.placeholders ?? []),
    }),
    [site?.name, site?.lang, site?.nav, brand, open?.path, open?.placeholders, formMap, h1Id],
  );

  const overrides = React.useMemo(() => genesisOverrides(editor.components, { iframe: iframe as never }), [editor.components, iframe]);

  if (loadError) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTitle>The editor couldn't open this site</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!site || !open) {
    return (
      <div className={cn("flex h-full min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground", className)} role="status">
        <Spinner /> Opening the editor…
      </div>
    );
  }

  const saveStatus = worst(siteState, pageState);
  const pageMeta = pages.find((p) => p.id === open.id);
  const pageTitle = pageMeta?.title ?? open.data.root.props.title;
  const blockedReason = invalid ? `Fix this first: ${invalid}` : conflict ? "Choose a version in the conflict first." : null;

  return (
    <EditorServicesContext.Provider value={services}>
      <div className={cn("flex h-full min-h-0 flex-col bg-background text-foreground", className)} data-gs-editor="">
        <Puck
          key={editorKey}
          config={editor.config}
          data={open.data as unknown as Data}
          onChange={onChange}
          overrides={overrides}
          metadata={metadata as unknown as Record<string, unknown>}
          iframe={{ enabled: true, waitForStyles: true }}
          viewports={[
            { width: 390, label: "Phone", icon: "Smartphone" },
            { width: 768, label: "Tablet", icon: "Tablet" },
            { width: "100%", label: "Desktop", icon: "Monitor" },
          ]}
          headerTitle={site.name}
        >
          <div className="flex h-full min-h-0 flex-col">
          <SelectionWatcher onSelect={() => setRightTab("edit")} />
          <Toolbar siteName={site.name} pageTitle={`${pageTitle} (${open.path})`} saveStatus={saveStatus} viewport={viewport} onViewport={setViewport} onPreview={() => void showPreview("preview")} />
          {notice || invalid ? (
            <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
              {invalid ? (
                <p role="alert" className="text-sm text-destructive">
                  Not saved yet: {invalid}
                </p>
              ) : null}
              {notice ? (
                <div role={notice.tone === "error" ? "alert" : "status"} className={cn("flex items-center justify-between gap-2 text-sm", notice.tone === "error" ? "text-destructive" : "text-foreground")}>
                  <span>{notice.text}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setNotice(null)} aria-label="Dismiss">
                    Dismiss
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_20rem]">
            <aside className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r" aria-label="Sections and pages">
              <Tabs defaultValue="add" value={leftTab} onValueChange={setLeftTab} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="m-2 grid grid-cols-3">
                  <TabsTrigger value="add">Add</TabsTrigger>
                  <TabsTrigger value="outline">Outline</TabsTrigger>
                  <TabsTrigger value="pages">Pages</TabsTrigger>
                </TabsList>
                <TabsContent value="add" className="mt-0 min-h-0 flex-1 overflow-y-auto px-2 pb-4" data-gs-drawer="">
                  <p className="px-1 pb-2 text-xs text-muted-foreground">Drag a section onto the page.</p>
                  <Puck.Components />
                </TabsContent>
                <TabsContent value="outline" className="mt-0 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
                  <Puck.Outline />
                </TabsContent>
                <TabsContent value="pages" className="mt-0 min-h-0 flex-1 overflow-y-auto">
                  <PagesTab
                    pages={pages}
                    currentId={open.id}
                    nav={site.nav}
                    reserved={reserved}
                    canReorder={Boolean(store.reorderPages)}
                    busy={busy}
                    onOpen={(id) => void openPage(id)}
                    onCreate={createPage}
                    onRename={rename}
                    onDelete={remove}
                    onReorder={reorder}
                    onNavChange={onNavChange}
                    onFooter={() => setRightTab("edit")}
                  />
                </TabsContent>
              </Tabs>
            </aside>
            <main className="relative min-h-[28rem] min-w-0 bg-muted" aria-label="Page canvas" data-gs-canvas="">
              <Puck.Preview />
            </main>
            <aside className="flex min-h-0 flex-col border-t border-border lg:border-l lg:border-t-0" aria-label="Section settings and publishing">
              <Tabs defaultValue="edit" value={rightTab} onValueChange={setRightTab} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="m-2 grid grid-cols-2">
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="publish">Publish</TabsTrigger>
                </TabsList>
                <TabsContent value="edit" className="mt-0 min-h-0 flex-1 overflow-y-auto px-2 pb-4" data-gs-fields="">
                  <Puck.Fields />
                </TabsContent>
                <TabsContent value="publish" className="mt-0 min-h-0 flex-1 overflow-y-auto">
                  <PublishPanel
                    pagePath={open.path}
                    pageTitle={pageTitle}
                    siteName={site.name}
                    issues={issues}
                    checking={checking}
                    publishing={publishing}
                    blockedReason={blockedReason}
                    releases={releases}
                    liveReleaseId={liveId}
                    previewUrl={previewUrl}
                    currentPageId={open.id}
                    onCheck={() => void runCheck()}
                    onPublish={publish}
                    onRollback={rollback}
                    onPreview={(mode) => void showPreview(mode)}
                    onOpenPage={(id) => void openPage(id)}
                    onShowSection={(id) => {
                      setRightTab("edit");
                      scrollCanvasTo(id);
                    }}
                  />
                </TabsContent>
              </Tabs>
            </aside>
          </div>
          </div>
        </Puck>

        <AssetPicker
          open={picker !== null}
          siteId={siteId}
          store={store}
          assets={assets}
          current={picker?.current}
          onDone={(image) => {
            picker?.resolve(image);
            setPicker(null);
          }}
        />

        <AlertDialog open={conflict !== null}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{conflict === "page" ? "Someone else saved this page" : "Someone else saved the site's header, footer or menu"}</AlertDialogTitle>
              <AlertDialogDescription>
                Their changes reached the server while you were editing. Load their version (your unsaved changes here are dropped), or keep yours (theirs are replaced).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => void resolveConflict("reload")}>Load their version</AlertDialogCancel>
              <AlertDialogAction onClick={() => void resolveConflict("overwrite")}>Keep mine</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={preview !== null} onOpenChange={(o) => (o ? null : setPreview(null))}>
          <DialogContent className="flex h-[90vh] w-[95vw] max-w-6xl flex-col sm:max-w-6xl">
            <DialogHeader>
              <DialogTitle>{preview?.mode === "live" ? `Live: ${preview.path}` : `Preview: ${preview?.path}`}</DialogTitle>
              <DialogDescription>{preview?.mode === "live" ? "What visitors get now, from the published release." : "Your drafts, drawn by the same renderer the live site uses."}</DialogDescription>
            </DialogHeader>
            {preview?.html ? (
              <iframe title={`${preview.mode === "live" ? "Live page" : "Preview"} of ${preview.path}`} srcDoc={preview.html} sandbox="" className="min-h-0 w-full flex-1 rounded-md border border-border bg-background" />
            ) : preview?.note ? (
              <p className="text-sm">{preview.note}</p>
            ) : (
              <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Drawing the page…
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </EditorServicesContext.Provider>
  );
}
