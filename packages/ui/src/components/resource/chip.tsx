import type { ReactNode } from "react";
import { Badge } from "../ui/badge";
import { StatusBadge } from "../patterns/status-badge";
import { cn } from "../../utils";
import type { ChipTone } from "@marktiderman/genesis-core/resource";

/** A small status chip in one of the resource workspace's tones (tinted, AA-safe Genesis badges). */
export function Chip({
  tone,
  icon,
  children,
  className,
  testID,
}: {
  tone: ChipTone;
  icon?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  testID?: string | undefined;
}) {
  const inner = (
    <>
      {icon ? <span className="mr-1 inline-flex [&_svg]:size-3" aria-hidden>{icon}</span> : null}
      {children}
    </>
  );
  // Badge's destructive variant is a solid fill; the tinted red is StatusBadge's.
  if (tone === "danger") {
    return (
      <StatusBadge status="offTrack" className={cn("font-normal", className)} data-testid={testID}>
        {inner}
      </StatusBadge>
    );
  }
  return (
    <Badge variant={tone} className={cn("font-normal", className)} data-testid={testID}>
      {inner}
    </Badge>
  );
}
