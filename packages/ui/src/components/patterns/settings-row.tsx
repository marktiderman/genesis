import * as React from "react";
import { Label } from "../ui/label";
import { FormDescription } from "./form-field";
import { cn } from "../../utils";

export interface SettingsRowProps {
  /** Row label. */
  label: React.ReactNode;
  /** Supporting copy shown under the label, muted. */
  description?: React.ReactNode;
  /** Control(s) rendered on the trailing side. */
  children?: React.ReactNode;
  /**
   * `id` of the control this row labels (e.g. a Switch), for a11y and
   * click-to-focus. Supply it whenever the trailing control is labelable —
   * the label text is then a real `<label for>`. Omit it for rows whose
   * control names itself (a Button) or has none (a Badge); the text renders
   * as a plain `<span>` rather than a `<label>` associated with nothing.
   */
  htmlFor?: string;
  /**
   * `id` applied to the description paragraph so the trailing control can point
   * at it with `aria-describedby` — otherwise the description is an unrelated
   * `<p>` that a screen reader skips while navigating controls. `ToggleRow`
   * wires this automatically; pass it yourself when supplying your own control.
   */
  descriptionId?: string;
  /** Dims the row to indicate the control it wraps is disabled. */
  disabled?: boolean;
  className?: string;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * SettingsRow — label + description on one side, an arbitrary trailing
 * control (Switch, Select, Button, Badge, ...) on the other. This is the
 * shared layout behind every settings/preferences list row; see `ToggleRow`
 * for the common label+description+Switch case pre-wired.
 *
 * @stability Beta
 */
export function SettingsRow({
  label,
  description,
  children,
  htmlFor,
  descriptionId,
  disabled,
  className,
  testID,
}: SettingsRowProps) {
  return (
    <div
      data-slot="settings-row"
      data-testid={testID}
      className={cn(
        "flex items-center justify-between gap-4 py-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        {htmlFor ? (
          <Label htmlFor={htmlFor}>{label}</Label>
        ) : (
          // A <label> with no `for` and no control nested inside it associates
          // with nothing — it renders identically and is an accessibility
          // no-op. Rows whose control names itself (Button) or has no control
          // at all (Badge, a version string) take this branch.
          <span
            data-slot="settings-row-label"
            className="block text-sm font-medium leading-none"
          >
            {label}
          </span>
        )}
        <FormDescription id={descriptionId}>{description}</FormDescription>
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}
