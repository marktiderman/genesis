/**
 * Pagination — numeric page navigator with prev / next.
 *
 * Use for paged lists with discoverable totals. For infinite-scroll
 * patterns, prefer a load-more trigger or an inverted FlatList.
 *
 * Renders up to `maxVisible` numbered pages with leading/trailing
 * ellipses when the page count exceeds the window.
 *
 * @stability Beta
 */
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

export interface NativePaginationProps {
  /** Total page count (>= 1). */
  pageCount: number;
  /** Zero-indexed current page. */
  page: number;
  onChange: (page: number) => void;
  /** Max numbered pages shown around the current page. Default 5. */
  maxVisible?: number;
  className?: string;
  testID?: string;
}

function buildWindow(page: number, total: number, maxVisible: number) {
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i);
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(0, page - half);
  let end = Math.min(total, start + maxVisible);
  if (end - start < maxVisible) start = Math.max(0, end - maxVisible);
  return Array.from({ length: end - start }, (_, i) => start + i);
}

export function NativePagination({
  pageCount,
  page,
  onChange,
  maxVisible = 5,
  className,
  testID,
}: NativePaginationProps) {
  // Empty data sets render nothing rather than an inert "Page 1 of 0" row.
  if (pageCount <= 0) return null;
  const window = buildWindow(page, pageCount, maxVisible);
  const showLeadingEllipsis = window[0]! > 0;
  const showTrailingEllipsis =
    window[window.length - 1]! < pageCount - 1;

  return (
    <View
      testID={testID ?? "native-pagination"}
      accessibilityLabel={`Page ${page + 1} of ${pageCount}`}
      className={cn("flex-row items-center gap-1", className)}
    >
      <PageButton
        testID={testID ? `${testID}-prev` : "pagination-prev"}
        label="‹"
        a11y="Previous page"
        disabled={page <= 0}
        onPress={() => onChange(Math.max(0, page - 1))}
      />
      {showLeadingEllipsis ? <Ellipsis /> : null}
      {window.map((i) => (
        <PageButton
          key={i}
          testID={testID ? `${testID}-page-${i}` : `pagination-page-${i}`}
          label={String(i + 1)}
          a11y={`Page ${i + 1}`}
          selected={i === page}
          onPress={() => onChange(i)}
        />
      ))}
      {showTrailingEllipsis ? <Ellipsis /> : null}
      <PageButton
        testID={testID ? `${testID}-next` : "pagination-next"}
        label="›"
        a11y="Next page"
        disabled={page >= pageCount - 1}
        onPress={() => onChange(Math.min(pageCount - 1, page + 1))}
      />
    </View>
  );
}

interface PageButtonProps {
  testID?: string;
  label: string;
  a11y: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function PageButton({ testID, label, a11y, selected, disabled, onPress }: PageButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-[44px] min-w-[44px] items-center justify-center rounded-md border px-2",
        selected ? "border-primary bg-primary" : "border-border bg-background",
        disabled && "opacity-40"
      )}
    >
      <Text
        className={cn(
          "text-sm font-medium",
          selected ? "text-primary-foreground" : "text-foreground"
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Ellipsis() {
  return (
    <Text
      accessibilityElementsHidden
      className="px-1 text-sm text-muted-foreground"
    >
      …
    </Text>
  );
}
