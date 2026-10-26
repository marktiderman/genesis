import type { ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { cn } from "../../utils";
import { Check, Eye, Loader2, Redo2, Rocket, Share2, TriangleAlert, Undo2 } from "lucide-react";
import { Chip } from "./chip";
import { SAVE_STATE_LABEL, type ChipTone, type SaveState } from "./status";

export interface ResourceHeaderProps {
  /** The title, shown once: as the heading and the breadcrumb's last part. */
  title: string;
  /** Shown when the title is empty. Default "Untitled". */
  untitled?: string | undefined;
  /**
   * The breadcrumb's parent link, e.g. `<Link to="/courses">Courses</Link>`: one element, so
   * the host's router renders it.
   */
  parent?: ReactNode;
  /** The status chip, e.g. "Live · version 3" or "Draft" (forms-studio's formStatusChip makes a form's). */
  status?: { label: string; tone: ChipTone } | undefined;
  /** Where saving the draft stands; no chip when absent. */
  saveState?: SaveState | undefined;
  /** Undo and redo buttons, shown when given (for example the builder's history). */
  onUndo?: (() => void) | undefined;
  onRedo?: (() => void) | undefined;
  canUndo?: boolean | undefined;
  canRedo?: boolean | undefined;
  /** A Preview button. */
  onPreview?: (() => void) | undefined;
  /** A Share button (open a share dialog). */
  onShare?: (() => void) | undefined;
  /** The primary button: "Publish", or "Publish changes" once it is live. */
  publish?:
    | {
        onClick: () => void;
        label?: string | undefined;
        loading?: boolean | undefined;
        disabled?: boolean | undefined;
      }
    | undefined;
  /** Before the title, in the leading area: a switcher between records, say. */
  leading?: ReactNode;
  /** Anything else for the right-hand side, before Preview (a Reload button, a menu). */
  actions?: ReactNode;
  className?: string | undefined;
}

const SAVE_TONE: Record<SaveState, ChipTone> = {
  saved: "muted",
  saving: "muted",
  unsaved: "muted",
  failed: "warning",
  stopped: "danger",
  conflict: "danger",
};

/**
 * The header of a page that edits one publishable thing (a form, a course, a lesson, a
 * worksheet): the breadcrumb ("Courses › name"), the title once, its status and save-state
 * chips, and on the right undo and redo, Preview, Share and Publish. Every action is the
 * host's; a button shows only when its handler is given.
 */
export function ResourceHeader({
  title,
  untitled = "Untitled",
  parent,
  status,
  saveState,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
  onPreview,
  onShare,
  publish,
  actions,
  leading,
  className,
}: ResourceHeaderProps) {
  const history = onUndo || onRedo;
  const name = title.trim() || untitled;
  return (
    <header
      data-slot="resource-header"
      className={cn("flex flex-col gap-3 md:flex-row md:items-start md:justify-between", className)}
    >
      <div className="min-w-0 flex-1 space-y-1">
        {parent ? (
          <Breadcrumb>
            <BreadcrumbList className="text-xs">
              {/* The host's own link, as is: BreadcrumbLink would wrap it in a second <a>. */}
              <BreadcrumbItem className="[&_a:hover]:text-foreground [&_a]:transition-colors">{parent}</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">{name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {leading ? (
            <div data-slot="resource-header-leading" className="flex shrink-0 items-center">
              {leading}
            </div>
          ) : null}
          <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
          {status ? (
            <Chip tone={status.tone} testID="resource-status">
              {status.label}
            </Chip>
          ) : null}
          {saveState ? (
            <span aria-live="polite">
              <Chip
                tone={SAVE_TONE[saveState]}
                testID="resource-save-state"
                icon={
                  saveState === "saved" ? (
                    <Check />
                  ) : saveState === "saving" ? (
                    <Loader2 className="animate-spin" />
                  ) : saveState === "unsaved" ? null : (
                    <TriangleAlert />
                  )
                }
              >
                {SAVE_STATE_LABEL[saveState]}
              </Chip>
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {history ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Undo"
              title="Undo"
              disabled={!onUndo || !canUndo}
              onClick={onUndo}
              data-testid="resource-undo"
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Redo"
              title="Redo"
              disabled={!onRedo || !canRedo}
              onClick={onRedo}
              data-testid="resource-redo"
            >
              <Redo2 className="size-4" />
            </Button>
            <Separator orientation="vertical" className="mx-1 h-6" />
          </>
        ) : null}
        {actions}
        {onPreview ? (
          <Button variant="ghost" startIcon={<Eye className="size-4" />} onClick={onPreview} data-testid="resource-preview">
            Preview
          </Button>
        ) : null}
        {onShare ? (
          <Button variant="outline" startIcon={<Share2 className="size-4" />} onClick={onShare} data-testid="resource-share">
            Share
          </Button>
        ) : null}
        {publish ? (
          <Button
            startIcon={<Rocket className="size-4" />}
            loading={publish.loading}
            disabled={publish.disabled}
            onClick={publish.onClick}
            data-testid="resource-publish"
          >
            {publish.label ?? "Publish"}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
