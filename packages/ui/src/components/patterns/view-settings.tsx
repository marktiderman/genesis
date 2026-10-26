import { useId } from "react";
import { Settings2 } from "lucide-react";
import { fillMessage, useUiMessages } from "../../messages";
import { Button } from "../ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { Density } from "../../hooks/use-view-settings";

interface ViewSettingsProps {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DENSITY_OPTIONS: { value: Density; label: "compact" | "comfortable" | "spacious" }[] = [
  { value: "compact", label: "compact" },
  { value: "comfortable", label: "comfortable" },
  { value: "spacious", label: "spacious" },
];

export function ViewSettings({
  pageSize,
  onPageSizeChange,
  density,
  onDensityChange,
}: ViewSettingsProps) {
  const m = useUiMessages();
  // Radix renders each `SelectTrigger` as a <button>, and a <label> cannot be
  // associated with a button via `htmlFor`. `aria-labelledby` pointing at the
  // visible label is the association that actually reaches assistive tech.
  // `useId` keeps the ids unique when more than one ViewSettings is mounted.
  const baseId = useId();
  const pageSizeLabelId = `${baseId}-page-size`;
  const densityLabelId = `${baseId}-density`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={m.view.settings}
          // Icon-only trigger: `title` is not a dependable accessible name.
          aria-label={m.view.settings}
          testID="view-settings-trigger"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-4">
        <h4 className="text-sm font-semibold">{m.view.settingsTitle}</h4>

        <div className="space-y-2">
          <span
            id={pageSizeLabelId}
            className="block text-xs text-muted-foreground"
          >
            {m.view.pageSize}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger
              className="h-8 text-xs"
              aria-labelledby={pageSizeLabelId}
              data-testid="view-settings-page-size"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {fillMessage(m.view.pageSizeOption, { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <span
            id={densityLabelId}
            className="block text-xs text-muted-foreground"
          >
            {m.view.density}
          </span>
          <Select
            value={density}
            onValueChange={(v) => onDensityChange(v as Density)}
          >
            <SelectTrigger
              className="h-8 text-xs"
              aria-labelledby={densityLabelId}
              data-testid="view-settings-density"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {DENSITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {m.view[opt.label]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
