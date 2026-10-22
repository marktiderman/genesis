import * as React from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@marktiderman/genesis-ui/tabs";
import { Kbd } from "@marktiderman/genesis-ui/kbd";
import { Button } from "@marktiderman/genesis-ui/button";
import { Skeleton } from "@marktiderman/genesis-ui/skeleton";
import {
  RadioGroup,
  RadioGroupItem,
} from "@marktiderman/genesis-ui/radio-group";
import { Label } from "@marktiderman/genesis-ui/label";
import type { Prefs } from "../prefs";
import { connectSurface, type Surface, type SurfaceMode } from "../surfaces";
import { commandKeys, shortcutKeys } from "../keys";

/**
 * React pieces for an extension's pages, built on Genesis UI. Bring your own
 * Genesis theme (import its CSS in the page) and wrap the page in Genesis's
 * ThemeProvider as any Genesis app does.
 */

/** The extension's settings, kept current when any page changes them. `null` until loaded. */
export function usePrefs<T extends Record<string, unknown>>(
  prefs: Prefs<T>,
): [T | null, (patch: Partial<T>) => Promise<void>] {
  const [value, setValue] = React.useState<T | null>(null);
  React.useEffect(() => {
    let live = true;
    prefs.get().then((v) => live && setValue(v));
    const stop = prefs.subscribe((v) => live && setValue(v));
    return () => {
      live = false;
      stop();
    };
  }, [prefs]);
  return [value, prefs.set];
}

/** This page as a surface (panel, bar, side panel or popup); see `connectSurface`. */
export function useSurface(): Surface {
  const ref = React.useRef<Surface | null>(null);
  ref.current ||= connectSurface();
  return ref.current;
}

/**
 * A shortcut as keys, in Mac names on a Mac. With `command`, shows the keys
 * Chrome has for it now (people can change them), else `keys`.
 */
export function ShortcutKeys({
  command,
  keys,
  className,
}: {
  command?: string;
  keys?: string;
  className?: string;
}) {
  const [parts, setParts] = React.useState<string[]>(() =>
    shortcutKeys(keys || ""),
  );
  React.useEffect(() => {
    if (!command) return;
    let live = true;
    commandKeys(command).then(
      (found) => live && found.length && setParts(found),
    );
    return () => {
      live = false;
    };
  }, [command]);
  return (
    <span className={className} data-testid="shortcut-keys">
      {parts.map((part, i) => (
        <React.Fragment key={`${part}-${i}`}>
          {i > 0 && <span aria-hidden="true"> + </span>}
          <Kbd>{part}</Kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

export interface SettingsTab {
  id: string;
  label: React.ReactNode;
  /** Rendered only while the tab is shown, so a tab's data loads when it's opened. */
  render: () => React.ReactNode;
}

/**
 * The options page's frame: a header (name, mark, an account area) and tabs
 * (Library, Capture, Settings, Account, say). The chosen tab is kept in the
 * address (#tab=…), so a link can open a tab and reloading keeps it; each
 * tab's content is only rendered while it's open.
 */
export function ExtensionSettings({
  title,
  mark,
  account,
  tabs,
  defaultTab,
}: {
  title: React.ReactNode;
  mark?: React.ReactNode;
  account?: React.ReactNode;
  tabs: SettingsTab[];
  defaultTab?: string;
}) {
  const fromHash = () => new URLSearchParams(location.hash.slice(1)).get("tab");
  const valid = (id: string | null) =>
    id && tabs.some((t) => t.id === id) ? id : null;
  const [active, setActive] = React.useState(
    () => valid(fromHash()) || defaultTab || tabs[0]?.id || "",
  );
  React.useEffect(() => {
    const onHash = () => {
      const id = valid(fromHash());
      if (id) setActive(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
  const choose = (id: string) => {
    setActive(id);
    const params = new URLSearchParams(location.hash.slice(1));
    params.set("tab", id);
    history.replaceState(null, "", `#${params}`);
  };
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-testid="extension-settings"
    >
      <header className="flex items-center gap-3 border-b px-6 py-3">
        {mark}
        <h1 className="text-base font-semibold">{title}</h1>
        <div className="ml-auto flex items-center gap-3">{account}</div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-6">
        <Tabs value={active} defaultValue={active} onValueChange={choose}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                data-testid={`tab-${tab.id}`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="pt-4">
              {active === tab.id ? tab.render() : null}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}

const MODE_TEXT: Record<SurfaceMode, { label: string; description: string }> = {
  panel: {
    label: "Floating panel",
    description:
      "Over the page, at the top right. It stays open while you scroll, click and play.",
  },
  bar: {
    label: "Top bar",
    description:
      "A compact strip across the top of the page, with the main fields in a row.",
  },
  side: {
    label: "Side panel",
    description:
      "Chrome moves the page aside to make room, and it follows the tab you're on.",
  },
};

/** Choose where the extension's main page opens. */
export function SurfaceModePicker({
  value,
  onChange,
  modes = ["panel", "bar", "side"],
}: {
  value: SurfaceMode;
  onChange: (mode: SurfaceMode) => void;
  modes?: SurfaceMode[];
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as SurfaceMode)}
      data-testid="surface-mode"
    >
      {modes.map((mode) => (
        <div key={mode} className="flex items-start gap-3">
          <RadioGroupItem value={mode} id={`surface-${mode}`} />
          <Label
            htmlFor={`surface-${mode}`}
            className="font-normal leading-snug"
          >
            <span className="font-semibold">{MODE_TEXT[mode].label}</span>
            <span className="text-muted-foreground">
              : {MODE_TEXT[mode].description}
            </span>
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

export interface LazyList<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  done: boolean;
  /** Load the next page now. */
  loadMore(): void;
  /** Start again from the first page (a new search or filter). */
  reset(): void;
  /** Put on an element after the list: the next page loads as it scrolls into view. */
  sentinel: React.RefCallback<Element>;
}

/**
 * A list loaded a page at a time as it's scrolled, for a library of
 * hundreds of items: the first page shows at once, the rest follow. `load`
 * gets the offset and page size; a page shorter than the size is the last.
 * A newer reset drops answers still on the way for an older one.
 */
export function useLazyList<T>(
  load: (offset: number, limit: number) => Promise<T[]>,
  { pageSize = 25, deps = [] as React.DependencyList } = {},
): LazyList<T> {
  const [items, setItems] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const generation = React.useRef(0);
  const busy = React.useRef(false);
  const count = React.useRef(0);
  const loadRef = React.useRef(load);
  loadRef.current = load;

  const loadMore = React.useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const mine = generation.current;
    setLoading(true);
    setError(null);
    loadRef
      .current(count.current, pageSize)
      .then((page) => {
        if (mine !== generation.current) return;
        count.current += page.length;
        setItems((prev) => [...prev, ...page]);
        if (page.length < pageSize) setDone(true);
      })
      .catch(
        (err: unknown) =>
          mine === generation.current &&
          setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => {
        if (mine !== generation.current) return;
        busy.current = false;
        setLoading(false);
      });
  }, [pageSize]);

  const reset = React.useCallback(() => {
    generation.current++;
    busy.current = false;
    count.current = 0;
    setItems([]);
    setDone(false);
    setError(null);
    loadMore();
  }, [loadMore]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(reset, deps);

  const observer = React.useRef<IntersectionObserver | null>(null);
  const state = React.useRef({ done, loading, error });
  state.current = { done, loading, error };
  const sentinel = React.useCallback<React.RefCallback<Element>>(
    (node) => {
      observer.current?.disconnect();
      if (!node || typeof IntersectionObserver === "undefined") return;
      observer.current = new IntersectionObserver((entries) => {
        const s = state.current;
        if (
          entries.some((e) => e.isIntersecting) &&
          !s.done &&
          !s.loading &&
          !s.error
        )
          loadMore();
      });
      observer.current.observe(node);
    },
    [loadMore],
  );
  return { items, loading, error, done, loadMore, reset, sentinel };
}

/** Rows of placeholders while a list's first page loads. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      data-testid="list-skeleton"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-12 w-20" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The end of a lazy list: loading, an error with Retry, or nothing more. */
export function LazyListFooter({
  list,
  empty,
}: {
  list: LazyList<unknown>;
  empty?: React.ReactNode;
}) {
  if (list.error) {
    return (
      <div
        className="flex items-center gap-3 py-3 text-sm text-destructive"
        role="alert"
      >
        Couldn't load more: {list.error}
        <Button variant="outline" size="sm" onClick={list.loadMore}>
          Retry
        </Button>
      </div>
    );
  }
  if (list.loading && !list.items.length) return <ListSkeleton />;
  if (list.done && !list.items.length) return <>{empty}</>;
  return <div ref={list.sentinel} className="h-8" aria-hidden="true" />;
}
