import type { ReactNode } from "react";
import {
  AlignLeft,
  Calculator,
  Calendar,
  CircleDot,
  Clapperboard,
  Gauge,
  Hash,
  Heading,
  Highlighter,
  List,
  ListChecks,
  Mail,
  Phone,
  Pilcrow,
  SeparatorHorizontal,
  SquareCheck,
  SquareChevronDown,
  Star,
  Table,
  ToggleLeft,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { Block } from "@marktiderman/genesis-forms";
import { editorFor, type BuilderConfig } from "./editors";

const TYPE_ICONS: Record<string, LucideIcon> = {
  "short-text": Type,
  "long-text": AlignLeft,
  email: Mail,
  phone: Phone,
  rating: Star,
  nps: Gauge,
  "single-choice": CircleDot,
  "multi-choice": ListChecks,
  "yes-no": ToggleLeft,
  dropdown: SquareChevronDown,
  number: Hash,
  date: Calendar,
  consent: SquareCheck,
  list: List,
  table: Table,
  "media-notes": Clapperboard,
  "text-highlights": Highlighter,
  calculated: Calculator,
};

/**
 * The small icon for a block in the outline, the flow map and the rule pills:
 * the host's editor icon for the type, else a built-in one, else a "T".
 */
export function BlockIcon({ block, config, className = "size-4" }: { block: Block; config: BuilderConfig; className?: string }): ReactNode {
  if (block.kind === "content") {
    const Icon = block.type === "heading" ? Heading : Pilcrow;
    return <Icon className={className} aria-hidden />;
  }
  if (block.kind === "page-break") return <SeparatorHorizontal className={className} aria-hidden />;
  const custom = editorFor(config, block.type)?.icon;
  if (custom !== undefined) return <span aria-hidden className="inline-flex [&_svg]:size-4">{custom}</span>;
  const Icon = TYPE_ICONS[block.type] ?? Type;
  return <Icon className={className} aria-hidden />;
}
