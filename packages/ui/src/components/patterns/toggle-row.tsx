"use client";

import * as React from "react";
import { SettingsRow } from "./settings-row";
import { Switch } from "../ui/switch";

export interface ToggleRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Switch/label `id`. Auto-generated via `useId` when omitted. */
  id?: string;
  className?: string;
  /**
   * Stable test/automation selector for the **Switch** — emitted as
   * `data-testid` on the control itself, since that is the node automation
   * has to click to toggle. Use `rowTestID` to select the surrounding row.
   */
  testID?: string;
  /** Stable test/automation selector for the row wrapper. */
  rowTestID?: string;
}

/**
 * ToggleRow — `SettingsRow` pre-wired with a `Switch`: the common
 * label+description+on/off row for settings and preferences UI.
 *
 * Both halves of the row's text are wired to the control: the label via
 * `id`/`htmlFor`, and the description via `aria-describedby`, so a screen
 * reader focusing the switch hears the constraint ("this will notify all team
 * members") rather than skipping it.
 *
 * @stability Beta
 */
export function ToggleRow({
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  id,
  className,
  testID,
  rowTestID,
}: ToggleRowProps) {
  const reactId = React.useId();
  const switchId = id ?? `${reactId}-switch`;
  const descriptionId = `${reactId}-description`;
  // Mirrors FormDescription's own falsy check — it renders nothing for an
  // empty/absent description, so pointing aria-describedby at that id would
  // dangle at a node that was never emitted.
  const hasDescription = Boolean(description);

  return (
    <SettingsRow
      label={label}
      description={description}
      htmlFor={switchId}
      descriptionId={hasDescription ? descriptionId : undefined}
      disabled={disabled}
      className={className}
      testID={rowTestID}
    >
      <Switch
        id={switchId}
        data-testid={testID}
        aria-describedby={hasDescription ? descriptionId : undefined}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </SettingsRow>
  );
}
