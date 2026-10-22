import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
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

/** A whole number. With `commitOnBlur`, it is kept as typed until blur or Enter (for values that get clamped). */
export function NumberRow(props: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  hint?: ReactNode;
  testID?: string;
  commitOnBlur?: boolean;
}) {
  const id = useId();
  const toNumber = (raw: string) => {
    if (raw.trim() === "") return undefined;
    const n = Math.trunc(Number(raw));
    return Number.isFinite(n) ? n : null;
  };
  if (props.commitOnBlur) {
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
