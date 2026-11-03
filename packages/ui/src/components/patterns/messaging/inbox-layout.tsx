/**
 * InboxLayout — the 3-pane inbox on the web: views (Mine, Unassigned, All), a
 * list of conversations, the open thread, and an optional context sidebar
 * (who it's from, properties, linked records).
 *
 * It only positions its panes: fill them with `InboxPage` for the list and
 * `ThreadPage` for the thread (or the app's own), and keep which conversation
 * is open where the app keeps it (a route param, state). On narrow screens it
 * shows one pane at a time, like the phone: the list, or the thread with a
 * Back button (`onBack`) when `threadOpen`. The views and the context sidebar
 * show from `lg` and `xl` up; below that the app reaches them its own way (a
 * menu, a sheet).
 *
 * @stability Beta
 */
import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "../../../utils";
import { Button } from "../../ui/button";

export interface InboxLayoutProps {
  /** The views rail (a nav of saved views with counts). Hidden below `lg`. */
  views?: React.ReactNode;
  /** The list of conversations (an `InboxPage`). */
  list: React.ReactNode;
  /** The open conversation (a `ThreadPage`), or what shows when none is open. */
  thread?: React.ReactNode;
  /** Beside the thread: who it's from, its properties. Hidden below `xl`. */
  context?: React.ReactNode;
  /** A conversation is open: on narrow screens the thread shows instead of the list. */
  threadOpen?: boolean;
  /** Back to the list on narrow screens. Without it, no Back button shows. */
  onBack?: () => void;
  backLabel?: string;
  /** Names for the regions, for a screen reader. */
  labels?: { views?: string; list?: string; thread?: string; context?: string };
  className?: string;
  testID?: string;
}

export function InboxLayout({
  views,
  list,
  thread,
  context,
  threadOpen = false,
  onBack,
  backLabel = "Back",
  labels = {},
  className,
  testID = "inbox-layout",
}: InboxLayoutProps) {
  return (
    <div data-testid={testID} className={cn("flex h-full min-h-0 w-full overflow-hidden", className)}>
      {views ? (
        <nav data-testid={`${testID}-views`} aria-label={labels.views ?? "Views"} className="hidden w-56 shrink-0 overflow-y-auto border-r lg:block">
          {views}
        </nav>
      ) : null}
      <section
        data-testid={`${testID}-list`}
        aria-label={labels.list ?? "Conversations"}
        className={cn("min-h-0 w-full shrink-0 flex-col overflow-y-auto border-r md:flex md:w-80 lg:w-96", threadOpen ? "hidden" : "flex")}
      >
        {list}
      </section>
      <section
        data-testid={`${testID}-thread`}
        aria-label={labels.thread ?? "Conversation"}
        className={cn("min-h-0 min-w-0 flex-1 flex-col md:flex", threadOpen ? "flex" : "hidden")}
      >
        {onBack ? (
          <div className="border-b p-1 md:hidden">
            <Button variant="ghost" size="sm" onClick={onBack} data-testid={`${testID}-back`}>
              <ChevronLeft className="size-4" aria-hidden />
              {backLabel}
            </Button>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">{thread}</div>
      </section>
      {context ? (
        <aside data-testid={`${testID}-context`} aria-label={labels.context ?? "Details"} className="hidden w-80 shrink-0 overflow-y-auto border-l xl:block">
          {context}
        </aside>
      ) : null}
    </div>
  );
}
