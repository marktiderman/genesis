"use client";

import { useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { splitTabBarItems, TAB_BAR_MAX } from "@marktiderman/genesis-core/navigation";
import { Badge } from "../ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { cn } from "../../utils";
import { useUiMessages } from "../../messages";

/** A badge a screen reader can say: a count or a word; anything else stays visual. */
function badgeLabel(label: string, badge: ReactNode): string | undefined {
  return typeof badge === "string" || typeof badge === "number" ? `${label} (${badge})` : undefined;
}

/** One tab in a `TabBar`. */
export interface TabBarItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** A count or a word ("New") beside the icon. */
  badge?: ReactNode | undefined;
}

export interface TabBarProps {
  items: readonly TabBarItem[];
  /** The current tab's key. */
  value: string;
  onChange: (key: string) => void;
  /** Slots before "More" takes the last. Default 5. */
  max?: number | undefined;
  /** The nav's accessible name. Default the shell's "Primary navigation". */
  label?: string | undefined;
  className?: string | undefined;
  testID?: string | undefined;
}

/**
 * A bottom tab bar for a phone-width web screen, the twin of genesis-ui-native's
 * `NativeTabBar`: any number of items, and past `max` (5) the last slot is "More", which opens
 * a bottom sheet with the rest. AppShell's own phone bottom nav (links, from its nav items)
 * splits with the same `splitTabBarItems` (genesis-core/navigation); use `TabBar` for a bar of your own (a screen with
 * tabs that aren't routes). It is not fixed: place it.
 *
 * @stability Beta
 */
export function TabBar({ items, value, onChange, max = TAB_BAR_MAX, label, className, testID = "tab-bar" }: TabBarProps) {
  const m = useUiMessages().shell;
  const [moreOpen, setMoreOpen] = useState(false);
  const { shown, more } = splitTabBarItems(items, max);
  const moreActive = more.some((item) => item.key === value);
  const itemClass = (active: boolean) =>
    cn(
      "flex min-h-11 flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <>
      <nav
        aria-label={label ?? m.primaryNavigation}
        className={cn("flex border-t bg-background pb-[env(safe-area-inset-bottom)]", className)}
        data-testid={testID}
      >
        {shown.map((item) => {
          const active = item.key === value;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              aria-current={active ? "page" : undefined}
              aria-label={badgeLabel(item.label, item.badge)}
              className={itemClass(active)}
              data-testid={`${testID}-${item.key}`}
            >
              <span className="relative inline-flex [&_svg]:size-5" aria-hidden>
                {item.icon}
                {item.badge != null ? (
                  <span className="absolute -top-1.5 left-full -ml-1 inline-flex h-4 min-w-4 items-center justify-center whitespace-nowrap rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
                    {item.badge}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate px-0.5">{item.label}</span>
            </button>
          );
        })}
        {more.length > 0 ? (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-label={moreActive ? m.moreCurrent : undefined}
            className={itemClass(moreActive)}
            data-testid={`${testID}-more`}
          >
            <Ellipsis className="h-5 w-5" aria-hidden />
            <span className="max-w-full truncate px-0.5">{m.more}</span>
          </button>
        ) : null}
      </nav>
      {more.length > 0 ? (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]" data-testid={`${testID}-more-sheet`}>
            <SheetTitle>{m.more}</SheetTitle>
            <SheetDescription className="sr-only">{m.moreDescription}</SheetDescription>
            <ul className="-mx-2 space-y-0.5">
              {more.map((item) => {
                const active = item.key === value;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onChange(item.key);
                      }}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors [&_svg]:size-5 [&_svg]:shrink-0",
                        active ? "bg-accent text-primary" : "text-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                      data-testid={`${testID}-${item.key}`}
                    >
                      <span aria-hidden className="inline-flex">{item.icon}</span>
                      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                      {item.badge != null ? (
                        <Badge variant="secondary" className="shrink-0">
                          {item.badge}
                        </Badge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}
