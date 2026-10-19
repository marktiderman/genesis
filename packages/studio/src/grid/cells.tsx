// How a value looks in the grid: choices as colored pills, yes/no as a
// check, links as chips, numbers right-aligned. Editing and copying always
// use the plain text (`editText`), so what you see never changes what you save.

import type { ReactNode } from "react";
import {
  Braces,
  Calendar,
  Check,
  CircleChevronDown,
  Clock,
  Hash,
  KeyRound,
  Link2,
  List,
  SquareCheck,
  Type,
} from "lucide-react";
import type { FieldSchema } from "@marktiderman/genesis-core/schema";
import { cn } from "@marktiderman/genesis-ui/utils";
import { displayText } from "../values";

/** An icon for the field's type, as Airtable shows in each column header. */
export function FieldIcon({ field, isKey }: { field: FieldSchema; isKey?: boolean }) {
  const className = "h-3.5 w-3.5";
  if (isKey) return <KeyRound className={className} />;
  if (field.array) return <List className={className} />;
  if (field.references) return <Link2 className={className} />;
  if (field.enumValues) return <CircleChevronDown className={className} />;
  switch (field.type) {
    case "number":
      return <Hash className={className} />;
    case "boolean":
      return <SquareCheck className={className} />;
    case "json":
      return <Braces className={className} />;
    case "datetime":
      return field.dbType === "date" || field.widget === "date" ? <Calendar className={className} /> : <Clock className={className} />;
    default:
      return <Type className={className} />;
  }
}

/** Tints from the design system's palette, one per choice. */
const PILL_TINTS = [
  "bg-info/20",
  "bg-chart-2/25",
  "bg-chart-4/30",
  "bg-chart-1/20",
  "bg-chart-5/25",
  "bg-chart-3/20",
  "bg-primary/15",
];
const POSITIVE = /^(active|paid|done|shipped|published|complete(d)?|approved|open|live|yes|true)$/i;
const PENDING = /^(draft|pending|paused|review|in[ _-]?progress|waiting|scheduled|new)$/i;
const NEGATIVE = /^(archived|cancel(l)?ed|closed|rejected|failed|deleted|inactive|no|false)$/i;

/** A choice's tint: status-like words get their meaning's color, others a stable one by position. */
export function pillTint(value: string, choices: readonly string[] = []): string {
  if (POSITIVE.test(value)) return "bg-success/20";
  if (PENDING.test(value)) return "bg-warning/25";
  if (NEGATIVE.test(value)) return "bg-muted";
  const at = choices.indexOf(value);
  const index = at >= 0 ? at : [...value].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return PILL_TINTS[index % PILL_TINTS.length]!;
}

export function Pill({ value, tint, className }: { value: string; tint: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs text-foreground", tint, className)}>
      {value}
    </span>
  );
}

/** A Postgres timestamp, shortened to the minute for the grid. The full value is still what's edited. */
function shortTimestamp(text: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(text);
  return m ? `${m[1]} ${m[2]}` : text;
}

/** The cell's display. `linkLabel` is the linked row's name, when one is known. */
export function CellValue({ field, value, linkLabel }: { field: FieldSchema; value: unknown; linkLabel?: string }): ReactNode {
  const text = displayText(value);
  if (text === null || text === "") return null;
  if (field.type === "boolean" && !field.array) {
    return value === true || text === "true" ? (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-success/20" aria-label="Yes">
        <Check className="h-3 w-3" aria-hidden />
      </span>
    ) : (
      <span className="inline-block h-4 w-4 rounded border" aria-label="No" />
    );
  }
  if (field.enumValues && !field.array) return <Pill value={text} tint={pillTint(text, field.enumValues)} />;
  if (field.references) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 truncate rounded bg-info/15 px-1.5 py-0.5 text-xs text-foreground" title={text}>
        {linkLabel ?? text}
      </span>
    );
  }
  if (field.array && Array.isArray(value)) {
    return (
      <span className="flex gap-1 overflow-hidden">
        {value.map((item, i) => (
          <Pill key={i} value={displayText(item) ?? ""} tint="bg-muted" />
        ))}
      </span>
    );
  }
  if (field.type === "datetime" && !(field.dbType === "date" || field.widget === "date")) {
    return <span title={text}>{shortTimestamp(text)}</span>;
  }
  if (field.type === "json") return <span className="font-mono text-xs">{text}</span>;
  return <>{text}</>;
}
