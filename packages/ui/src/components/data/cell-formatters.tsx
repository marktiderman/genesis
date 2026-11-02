import { Badge } from "../ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { relativeTime, type RelativeTimeWords } from "../../utils";

/**
 * DateCell -- shows relative date by default, formatted date otherwise.
 * `relative: "short"` words it as `relativeTime` does ("2 hours ago", "yesterday", "Oct 21")
 * instead of date-fns' distance ("about 2 hours ago"), in `words` (a screen's
 * `useUiMessages().time`, so a translation applies) or the English catalogue.
 * Compatible with DataTableColumn<T>'s `render` prop.
 */
export function DateCell(options?: { relative?: boolean | "short"; format?: string; words?: RelativeTimeWords | undefined }) {
  return (_item: unknown, value: unknown) => {
    if (!value) return "\u2014";
    const text = String(value);
    // A calendar day (YYYY-MM-DD) is the same day everywhere. `new Date(day)`
    // reads it as UTC midnight, which is the day before west of UTC, so build
    // it from its parts on the local clock instead.
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(text);
    if (isNaN(date.getTime())) return text;
    const relative = options?.relative ?? true;
    const fmt = options?.format ?? "MMM d, yyyy";
    if (relative === "short") return relativeTime(date, new Date(), { words: options?.words });
    return relative
      ? formatDistanceToNow(date, { addSuffix: true })
      : format(date, fmt);
  };
}

/**
 * NumberCell -- locale-aware number formatting.
 */
export function NumberCell(options?: Intl.NumberFormatOptions) {
  const formatter = new Intl.NumberFormat(undefined, options);
  return (_item: unknown, value: unknown) => {
    if (value == null) return "\u2014";
    const num = Number(value);
    return isNaN(num) ? String(value) : formatter.format(num);
  };
}

/**
 * CurrencyCell -- currency formatting with string-safe parsing.
 */
export function CurrencyCell(currency = "USD", locale?: string) {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  return (_item: unknown, value: unknown) => {
    if (value == null) return "\u2014";
    const str = String(value).replace(/[^0-9.-]/g, "");
    const num = Number(str);
    return isNaN(num) ? String(value) : formatter.format(num);
  };
}

/**
 * BadgeCell -- status badge with configurable color map.
 */
export function BadgeCell(
  colorMap?: Record<
    string,
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning"
    | "info"
    | "muted"
  >,
) {
  return (_item: unknown, value: unknown) => {
    if (value == null) return "\u2014";
    const str = String(value);
    const variant = colorMap?.[str] ?? "outline";
    return <Badge variant={variant}>{str}</Badge>;
  };
}
