import type { ReactNode } from "react";
import { Badge } from "../ui/badge";
import { StatusBadge } from "../patterns/status-badge";
import { cn } from "../../utils";
import type { ChipTone } from "@marktiderman/genesis-core/resource";

export interface ChipProps {
  tone: ChipTone;
  icon?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  testID?: string | undefined;
  /**
   * On or off, as `NativeChip` in a `NativeChipGroup`: with `onSelectedChange` the chip is a
   * toggle button (`aria-pressed`, Enter and Space), drawn with a ring while on.
   */
  selected?: boolean | undefined;
  /** Makes the chip pressable: called with the new state when it is pressed. */
  onSelectedChange?: ((selected: boolean) => void) | undefined;
  /** A pressable chip that can't be pressed now. */
  disabled?: boolean | undefined;
}

/**
 * A small status chip in one of the resource workspace's tones (tinted, AA-safe Genesis badges).
 * With `onSelectedChange` it is a filter chip that toggles `selected`.
 */
export function Chip({ tone, icon, children, className, testID, selected, onSelectedChange, disabled }: ChipProps) {
  const pressable = onSelectedChange != null;
  const inner = (
    <>
      {icon ? <span className="mr-1 inline-flex [&_svg]:size-3" aria-hidden>{icon}</span> : null}
      {children}
    </>
  );
  const classes = cn(
    "font-normal",
    selected && "font-medium ring-2 ring-primary ring-offset-1 ring-offset-background",
    pressable && "cursor-pointer",
    pressable && disabled && "cursor-not-allowed opacity-50",
    !pressable && className,
  );
  const testId = pressable ? undefined : testID;
  // Badge's destructive variant is a solid fill; the tinted red is StatusBadge's.
  const chip =
    tone === "danger" ? (
      <StatusBadge status="offTrack" className={classes} data-testid={testId}>
        {inner}
      </StatusBadge>
    ) : (
      <Badge variant={tone} className={classes} data-testid={testId}>
        {inner}
      </Badge>
    );
  if (!pressable) return chip;
  return (
    <button
      type="button"
      aria-pressed={Boolean(selected)}
      disabled={disabled}
      onClick={() => onSelectedChange(!selected)}
      className={cn(
        "inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      data-testid={testID}
    >
      {chip}
    </button>
  );
}
