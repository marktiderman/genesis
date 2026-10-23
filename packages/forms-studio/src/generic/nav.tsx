
import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import { Chip } from "./chip";
import { readinessChip, type Readiness } from "./status";

/**
 * "Ready to publish", or how many problems to fix: for the trailing slot of a resource
 * page's row of tabs (genesis-ui's `<AppShellSubNavEnd>`). With `onClick` it is a button (open the checks).
 */
export function ReadinessChip({
  readiness,
  onClick,
  className,
}: {
  readiness: Readiness;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const { label, tone } = readinessChip(readiness);
  const icon =
    readiness.state === "ready" ? <Check /> : readiness.state === "problems" ? <CircleAlert /> : readiness.state === "warnings" ? <TriangleAlert /> : null;
  const chip = (
    <Chip tone={tone} icon={icon} testID="readiness" className={className}>
      {label}
    </Chip>
  );
  if (!onClick) return chip;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {chip}
    </button>
  );
}
