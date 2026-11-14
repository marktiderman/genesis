import type { ReactNode } from "react";
import { WidgetTile } from "../data/widget/WidgetTile";

/**
 * One card of a summary column: an icon and a title, a short line on the right ("24
 * responses · average 4.1"), then whatever summarises it (bars, quotes, a split bar). The one
 * widget tile (`WidgetTile`, variant `summary`, part `summary-card`).
 */
export function SummaryCard({
  icon,
  title,
  meta,
  children,
  className,
  testID,
}: {
  icon?: ReactNode | undefined;
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string | undefined;
  testID?: string | undefined;
}) {
  return (
    <WidgetTile variant="summary" label={title} icon={icon} meta={meta} className={className} testID={testID}>
      {children}
    </WidgetTile>
  );
}
