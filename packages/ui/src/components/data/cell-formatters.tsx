import { Badge } from "../ui/badge";
import { formatDistanceToNow, format } from "date-fns";

/**
 * DateCell -- shows relative date by default, formatted date otherwise.
 * Compatible with DataTableColumn<T>'s `render` prop.
 */
export function DateCell(options?: { relative?: boolean; format?: string }) {
  return (_item: unknown, value: unknown) => {
    if (!value) return "\u2014";
    const date = new Date(String(value));
    if (isNaN(date.getTime())) return String(value);
    const relative = options?.relative !== false;
    const fmt = options?.format ?? "MMM d, yyyy";
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
