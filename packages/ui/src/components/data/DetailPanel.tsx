import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Pencil, Trash2, X } from "lucide-react";
import { cn } from "../../utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "../ui/sheet";

/**
 * Props for {@link DetailPanel} — a shell-agnostic record detail view.
 * `layout` selects only the surrounding shell (inline / dialog / sheet);
 * the header and content below it render identically across all three.
 *
 * @stability Beta
 */
export interface DetailPanelProps<T> {
  /** The record to display */
  item: T | null;
  /** Whether panel is visible */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Header title */
  title?: string;
  /** Header subtitle */
  subtitle?: string;
  /** Shows edit button if provided */
  onEdit?: (item: T) => void;
  /** Shows delete button if provided */
  onDelete?: (item: T) => void;
  /** Custom content renderer */
  children?: (item: T) => ReactNode;
  /** Field definitions for auto-rendering */
  fields?: Array<{
    key: string;
    label: string;
    render?: (value: unknown, item: T) => ReactNode;
  }>;
  /**
   * Panel width. For `"sheet"` / `"inline"` this is a fixed pixel width
   * (matching this component's original, pre-`layout` sizing exactly). For
   * `"dialog"` it maps to Tailwind's modal max-width scale instead, since a
   * centered modal has a different sizing idiom than an edge-anchored panel.
   */
  width?: "sm" | "md" | "lg";
  /**
   * Rendering shell for the header + content below.
   * - `"sheet"` (default): fixed, right-anchored slide-in panel, composed
   *   from the shared `Sheet` primitive. Matches this component's original
   *   (pre-`layout`-prop) behavior — existing consumers that don't pass
   *   `layout` see no change, other than an overlay now present at all
   *   breakpoints (previously mobile-only) since it's a real `Sheet`.
   * - `"dialog"`: centered modal overlay, composed from the shared `Dialog`
   *   primitive.
   * - `"inline"`: plain in-flow panel — no overlay, backdrop, or fixed
   *   positioning — for master-detail / split-pane layouts.
   */
  layout?: "inline" | "dialog" | "sheet";
}

const widthClasses = {
  sm: "w-80",
  md: "w-96",
  lg: "w-[480px]",
} as const;

/** `dialog` layout's width idiom: a centered modal, not an edge panel. */
const dialogMaxWidthClasses = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
} as const;

/** Convert a snake_case or camelCase key to Title Case label */
function keyToLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Title/subtitle block for the panel header. `"dialog"` / `"sheet"` render
 * through the composed primitive's own `Title`/`Description` so Radix's
 * accessibility wiring (`aria-labelledby` / `aria-describedby`) stays
 * correct — falling back to visually-hidden text when `title`/`subtitle`
 * are omitted so Radix always has something to point at, without changing
 * what's visibly shown. `"inline"` isn't a Radix primitive, so it renders
 * the original plain conditional markup.
 */
function renderTitleBlock(
  layout: "inline" | "dialog" | "sheet",
  title: string | undefined,
  subtitle: string | undefined,
) {
  const titleText = title || "Detail panel";

  if (layout === "dialog") {
    return (
      <>
        <DialogTitle className={cn("text-sm font-semibold truncate", !title && "sr-only")}>
          {titleText}
        </DialogTitle>
        <DialogDescription
          className={cn("text-xs text-muted-foreground truncate", !subtitle && "sr-only")}
        >
          {subtitle || titleText}
        </DialogDescription>
      </>
    );
  }

  if (layout === "sheet") {
    return (
      <>
        <SheetTitle className={cn("text-sm font-semibold truncate", !title && "sr-only")}>
          {titleText}
        </SheetTitle>
        <SheetDescription
          className={cn("text-xs text-muted-foreground truncate", !subtitle && "sr-only")}
        >
          {subtitle || titleText}
        </SheetDescription>
      </>
    );
  }

  return (
    <>
      {title && <h2 className="text-sm font-semibold truncate">{title}</h2>}
      {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
    </>
  );
}

export function DetailPanel<T extends Record<string, unknown>>({
  item,
  open,
  onClose,
  title,
  subtitle,
  onEdit,
  onDelete,
  children,
  fields,
  width = "md",
  layout = "sheet",
}: DetailPanelProps<T>) {
  if (!open || !item) return null;

  const renderContent = () => {
    if (children) {
      return children(item);
    }

    if (fields) {
      return (
        <dl className="space-y-0">
          {fields.map((field, index) => (
            <div key={field.key}>
              {index > 0 && <Separator />}
              <div className="py-3">
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {field.label}
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {field.render
                    ? field.render(item[field.key], item)
                    : formatValue(item[field.key])}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      );
    }

    // Auto-render all fields except "id"
    const entries = Object.entries(item).filter(([key]) => key !== "id");
    return (
      <dl className="space-y-0">
        {entries.map(([key, value], index) => (
          <div key={key}>
            {index > 0 && <Separator />}
            <div className="py-3">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {keyToLabel(key)}
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {formatValue(value)}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    );
  };

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">{renderTitleBlock(layout, title, subtitle)}</div>
      <div className="flex items-center gap-1 shrink-0">
        {onEdit && (
          <Button
            testID="detail-panel-edit"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(item)}
            aria-label="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            testID="detail-panel-delete"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(item)}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button
          testID="detail-panel-close"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const content = (
    <div className="flex-1 overflow-y-auto px-4 py-3">{renderContent()}</div>
  );

  // ── "dialog": centered modal overlay, composed from the shared Dialog ──
  if (layout === "dialog") {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={cn(
            "flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0",
            dialogMaxWidthClasses[width],
          )}
        >
          {header}
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  // ── "sheet" (default): fixed right-anchored slide-in, composed from the
  //    shared Sheet primitive — this is the original DetailPanel look. ──
  if (layout === "sheet") {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0 max-w-[90vw] sm:max-w-[90vw]",
            widthClasses[width],
          )}
        >
          {header}
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  // ── "inline": plain in-flow panel, no overlay/backdrop/fixed position ──
  return (
    <div
      role="region"
      aria-label={title || "Detail panel"}
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card",
        widthClasses[width],
      )}
    >
      {header}
      {content}
    </div>
  );
}
