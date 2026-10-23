import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@marktiderman/genesis-ui/toggle-group";
import { cn } from "@marktiderman/genesis-ui/utils";

/**
 * The editing controls of a panel. In a `readOnly` builder it is a disabled
 * `<fieldset>`, which turns off every input, select, switch and button inside
 * it at once (also those of a host's own field-type panel), while the panel
 * around it, such as the rows that open a question, stays usable.
 */
export function Editable({ readOnly, className, children }: { readOnly?: boolean | undefined; className?: string; children: ReactNode }) {
  return (
    <fieldset
      disabled={!!readOnly}
      className={cn(
        "m-0 min-w-0 border-0 p-0",
        // Disabled text fields fade to placeholder grey by default, which makes
        // the content this mode exists to show hard to read. Keep the text at
        // full contrast and mark the fields as off with a muted fill instead.
        readOnly && "[&_:is(input,textarea):disabled]:bg-muted/50 [&_:is(input,textarea):disabled]:opacity-100",
        className,
      )}
      data-readonly={readOnly ? "" : undefined}
    >
      {children}
    </fieldset>
  );
}

/**
 * The props of a host's own settings row, the shape of genesis-ui's
 * `SettingsRow`: a label, a one-sentence description, then the control.
 */
export interface SettingsRowSlotProps {
  label: ReactNode;
  description?: ReactNode;
  /** The id of the control, for the row's `<label for>`. */
  htmlFor?: string;
  /** The id to give the description, which the control points at with `aria-describedby`. */
  descriptionId?: string;
  children?: ReactNode;
}

/** A host's row layout for the rows inside it (the builder sets it around its settings panel). */
export const RowLayoutContext = createContext<ComponentType<SettingsRowSlotProps> | null>(null);

/** A labelled control. `hint` sits under the control. */
export function Row({
  label,
  hint,
  htmlFor,
  children,
  className,
  hideLabel,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  /** Keep the label for assistive tech only (the field's placeholder says what it is). */
  hideLabel?: boolean;
}) {
  const Layout = useContext(RowLayoutContext);
  if (Layout && !hideLabel) {
    // Text fields and selects go under the host's row, full width: a row's trailing control
    // column (genesis-ui's SettingsRow keeps it from shrinking) would let a textarea widen the page.
    return (
      <div className={cn("min-w-0", className)} data-row-stacked="">
        <Layout label={label} description={hint} htmlFor={htmlFor} />
        <div className="min-w-0 pb-3">{children}</div>
      </div>
    );
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className={hideLabel ? "sr-only" : undefined}>{label}</Label>
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
  /** Focus the field when it mounts (a question just added). */
  autoFocus?: boolean;
  /** Marks the field invalid for assistive tech and draws it in the error colour. */
  invalid?: boolean;
  /** The input type of a one-line field, such as `"date"`. Default text. */
  type?: string;
  /** Keep the label for assistive tech only. */
  hideLabel?: boolean;
  /** Classes for the input or textarea itself. */
  inputClassName?: string;
  /** Rows of a multiline field. Default 2. */
  rows?: number;
}) {
  const id = useId();
  // Focused after the menu that added the question has closed and handed focus back.
  const autoFocus = !!props.autoFocus;
  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, id]);
  const common = {
    id,
    value: props.value,
    placeholder: props.placeholder,
    "data-testid": props.testID,
    onBlur: props.onBlur,
    "aria-invalid": props.invalid || undefined,
    className: props.inputClassName,
  };
  return (
    <Row label={props.label} hint={props.hint} htmlFor={id} hideLabel={props.hideLabel}>
      {props.multiline ? (
        <Textarea {...common} rows={props.rows ?? 2} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <Input {...common} type={props.type} onChange={(e) => props.onChange(e.target.value)} />
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
  return (
    <Row label={props.label} hint={props.hint} htmlFor={id}>
      <DraftInput id={id} value={props.value} onCommit={props.onCommit} testID={props.testID} />
    </Row>
  );
}

/** Where pending drafts register, so the builder can commit them on demand (`flush`) and when it unmounts. */
export interface DraftRegistry {
  add(flush: () => void): () => void;
}

export const DraftsContext = createContext<DraftRegistry | null>(null);

/** A registry of draft flushers, for a builder's `flush()`. */
export function createDraftRegistry(): DraftRegistry & { flush(): void } {
  const all = new Set<() => void>();
  return {
    add(flush) {
      all.add(flush);
      return () => void all.delete(flush);
    },
    flush() {
      for (const f of [...all]) f();
    },
  };
}

/**
 * Text kept as typed until blur or Enter. Then `onCommit` gets it if it
 * changed, and the field shows the value again (normalized by the commit).
 * Text still pending is committed when the builder flushes, and when the
 * input unmounts.
 */
export function useDraft(value: string, onCommit: (value: string) => void) {
  const [draft, setDraftState] = useState(value);
  const pending = useRef<string | null>(null);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  useLayoutEffect(() => {
    onCommitRef.current = onCommit;
  });
  useLayoutEffect(() => {
    valueRef.current = value;
    // A new value from outside (a commit, undo) replaces what was typed.
    pending.current = null;
    setDraftState(value);
  }, [value]);
  const commit = useCallback(() => {
    const typed = pending.current;
    pending.current = null;
    if (typed !== null && typed !== valueRef.current) onCommitRef.current(typed);
    setDraftState(valueRef.current);
  }, []);
  const drafts = useContext(DraftsContext);
  useLayoutEffect(() => {
    const off = drafts?.add(commit);
    return () => {
      off?.();
      commit();
    };
  }, [drafts, commit]);
  const setDraft = useCallback((next: string) => {
    pending.current = next;
    setDraftState(next);
  }, []);
  return { draft, setDraft, commit };
}

/** The input of a DraftRow, without its label. */
export function DraftInput(props: {
  value: string;
  onCommit: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  testID?: string;
  className?: string;
  type?: "text" | "number";
}) {
  const { draft, setDraft, commit } = useDraft(props.value, props.onCommit);
  return (
    <Input
      id={props.id}
      type={props.type}
      inputMode={props.type === "number" ? "numeric" : undefined}
      aria-label={props.ariaLabel}
      data-testid={props.testID}
      className={props.className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

/**
 * A whole number (any number with `decimal`). With `commitOnBlur`, it is kept
 * as typed until blur or Enter (for values that get clamped); `decimal` rows
 * always commit on blur, so "0." is not cut back while typing "0.5".
 */
export function NumberRow(props: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  hint?: ReactNode;
  testID?: string;
  commitOnBlur?: boolean;
  decimal?: boolean;
}) {
  const id = useId();
  const toNumber = (raw: string) => {
    if (raw.trim() === "") return undefined;
    const n = props.decimal ? Number(raw) : Math.trunc(Number(raw));
    return Number.isFinite(n) ? n : null;
  };
  if (props.commitOnBlur || props.decimal) {
    return (
      <Row label={props.label} hint={props.hint} htmlFor={id}>
        <DraftInput
          id={id}
          type="number"
          testID={props.testID}
          value={props.value === undefined ? "" : String(props.value)}
          onCommit={(raw) => {
            const n = toNumber(raw);
            if (n !== null) props.onChange(n);
          }}
        />
      </Row>
    );
  }
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
          const n = toNumber(e.target.value);
          if (n !== null) props.onChange(n);
        }}
      />
    </Row>
  );
}

export interface Choice {
  value: string;
  label: string;
  /** Shown before the label, in the list and on the closed control. */
  icon?: ReactNode;
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
            {o.icon ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {o.icon}
                <span className="truncate">{o.label}</span>
              </span>
            ) : (
              o.label
            )}
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
  const Layout = useContext(RowLayoutContext);
  if (Layout) {
    return (
      <Layout label={props.label} description={props.hint} htmlFor={id} descriptionId={props.hint ? `${id}-hint` : undefined}>
        <Switch
          id={id}
          checked={props.checked}
          onCheckedChange={props.onChange}
          data-testid={props.testID}
          aria-describedby={props.hint ? `${id}-hint` : undefined}
        />
      </Layout>
    );
  }
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

/**
 * A segmented control: a few mutually exclusive choices in one track, the
 * chosen one raised. A single-select toggle group, so arrow keys move between
 * the choices and each is a button with `aria-pressed`.
 */
export function Segmented(props: {
  value: string;
  options: readonly (Choice & { testID?: string; ariaLabel?: string })[];
  onChange: (value: string) => void;
  ariaLabel: string;
  testID?: string;
  className?: string;
  /** Compact (28px) items. Default true. */
  small?: boolean;
}) {
  const small = props.small ?? true;
  return (
    <ToggleGroup
      type="single"
      value={props.value}
      // Pressing the chosen item again would clear it: a segmented control always has one.
      onValueChange={(v) => {
        if (v) props.onChange(v);
      }}
      aria-label={props.ariaLabel}
      data-testid={props.testID}
      className={cn("inline-flex w-fit gap-0.5 rounded-md bg-muted p-0.5", props.className)}
    >
      {props.options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          data-testid={o.testID}
          aria-label={o.ariaLabel}
          title={o.ariaLabel}
          className={cn(
            "min-w-0 rounded-[0.3rem] text-muted-foreground hover:bg-transparent hover:text-foreground",
            "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
            small ? "h-7 px-2.5 text-[0.8125rem]" : "h-8 px-3",
          )}
        >
          {o.icon ?? null}
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** An uppercase section label inside a card ("ANSWER", "ENDING"). */
export function SectionLabel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <p id={id} className={cn("text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </p>
  );
}
