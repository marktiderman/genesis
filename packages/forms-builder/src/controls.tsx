import { useEffect, useId, useState, type ReactNode } from "react";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";

/** A labelled control. `hint` sits under the control. */
export function Row({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextRow(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  multiline?: boolean;
  testID?: string;
  onBlur?: () => void;
}) {
  const id = useId();
  const common = {
    id,
    value: props.value,
    placeholder: props.placeholder,
    "data-testid": props.testID,
    onBlur: props.onBlur,
  };
  return (
    <Row label={props.label} hint={props.hint} htmlFor={id}>
      {props.multiline ? (
        <Textarea {...common} rows={2} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <Input {...common} onChange={(e) => props.onChange(e.target.value)} />
      )}
    </Row>
  );
}

/**
 * A text row that commits on blur or Enter instead of on every keystroke, for
 * values that are normalized when saved (keys, names): typing "first_" must not
 * be cut back to "first" before the next letter arrives.
 */
export function DraftRow(props: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  hint?: ReactNode;
  testID?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const commit = () => {
    if (draft !== props.value) props.onCommit(draft);
    setDraft(props.value);
  };
  return (
    <Row label={props.label} hint={props.hint} htmlFor={id}>
      <DraftInput id={id} value={draft} onChange={setDraft} onCommit={commit} testID={props.testID} />
    </Row>
  );
}

/** The input of a DraftRow, without its label. */
export function DraftInput(props: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  id?: string;
  ariaLabel?: string;
  testID?: string;
}) {
  return (
    <Input
      id={props.id}
      aria-label={props.ariaLabel}
      data-testid={props.testID}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onBlur={props.onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onCommit();
      }}
    />
  );
}

export function NumberRow(props: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  hint?: ReactNode;
  testID?: string;
}) {
  const id = useId();
  return (
    <Row label={props.label} hint={props.hint} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        value={props.value ?? ""}
        data-testid={props.testID}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return props.onChange(undefined);
          const n = Math.trunc(Number(raw));
          if (Number.isFinite(n)) props.onChange(n);
        }}
      />
    </Row>
  );
}

export interface Choice {
  value: string;
  label: string;
}

export function SelectRow(props: {
  label: string;
  value: string;
  options: readonly Choice[];
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  testID?: string;
  className?: string;
}) {
  const id = useId();
  const { label, hint, className, ...pick } = props;
  return (
    <Row label={label} hint={hint} htmlFor={id} className={className}>
      <Pick id={id} {...pick} />
    </Row>
  );
}

/** A select without its own label, for compact rows (logic clauses). */
export function Pick(props: {
  id?: string;
  value: string;
  options: readonly Choice[];
  onChange: (value: string) => void;
  placeholder?: string;
  testID?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger id={props.id} aria-label={props.ariaLabel} data-testid={props.testID} className={props.className}>
        <SelectValue placeholder={props.placeholder ?? "Choose…"} />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SwitchRow(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  testID?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{props.label}</Label>
        {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
      </div>
      <Switch id={id} checked={props.checked} onCheckedChange={props.onChange} data-testid={props.testID} />
    </div>
  );
}
