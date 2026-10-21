import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@marktiderman/genesis-ui/button";
import { Progress } from "@marktiderman/genesis-ui/progress";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { CreateFormOptions, FormDefinition, FormEngine, FormState } from "@marktiderman/genesis-forms";
import {
  FieldRenderer,
  FormRuntime,
  useForm,
  useFormSelector,
  type RendererRegistry,
} from "@marktiderman/genesis-forms-react";
import { defaultRegistry } from "./renderers";

// ── Slots (the Genesis extension ladder, EXTENDING.md) ──────────────────────

type SlotOverride<P> = ComponentType<P> | null;

function renderSlot<P extends object>(
  Default: ComponentType<P>,
  override: SlotOverride<P> | undefined,
  props: P,
  extra?: Partial<P>,
): ReactNode {
  if (override === null) return null;
  const Component = override ?? Default;
  return <Component {...props} {...(extra as P)} />;
}

export interface HeaderSlotProps {
  title: string;
  description?: string;
  className?: string;
}
export interface ProgressSlotProps {
  step: number;
  total: number;
  className?: string;
}
export interface NavigationSlotProps {
  canGoBack: boolean;
  isLast: boolean;
  /** True while `onSubmit` is running. */
  busy: boolean;
  onBack: () => void;
  submitLabel: string;
  nextLabel: string;
  className?: string;
}
export interface EndingSlotProps {
  title: string;
  description?: string;
  className?: string;
}
export interface ErrorSummarySlotProps {
  count: number;
  className?: string;
}

/** Every interior part of `<Form>`. Replace one with `slots`, feed one with `slotProps`, drop one with `null`. */
export interface FormSlotMap {
  header: HeaderSlotProps;
  progress: ProgressSlotProps;
  navigation: NavigationSlotProps;
  ending: EndingSlotProps;
  errorSummary: ErrorSummarySlotProps;
}

function DefaultHeader({ title, description, className }: HeaderSlotProps) {
  return (
    <header className={cn("space-y-1", className)}>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </header>
  );
}

function DefaultProgress({ step, total, className }: ProgressSlotProps) {
  const percent = total ? Math.round((step / total) * 100) : 0;
  return (
    <div className={cn("space-y-1", className)}>
      <Progress value={percent} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Progress" />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Question {step} of {total}
      </p>
    </div>
  );
}

function DefaultNavigation({ canGoBack, isLast, busy, onBack, submitLabel, nextLabel, className }: NavigationSlotProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {canGoBack ? (
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
      ) : null}
      <Button type="submit" size="lg" loading={busy}>
        {busy ? "Sending…" : isLast ? submitLabel : nextLabel}
      </Button>
    </div>
  );
}

function DefaultEnding({ title, description, className }: EndingSlotProps) {
  return (
    <div className={cn("space-y-2 py-8 text-center", className)} role="status">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function DefaultErrorSummary({ count, className }: ErrorSummarySlotProps) {
  return (
    <p role="alert" className={cn("text-sm font-medium text-destructive", className)}>
      {count === 1 ? "One answer needs attention." : `${count} answers need attention.`}
    </p>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

export interface FormProps {
  /** A `defineForm` result or a canonical definition. */
  form: FormDefinition | { definition: FormDefinition };
  /** Bring your own engine (from `useForm`) to read state outside the form. */
  engine?: FormEngine;
  options?: CreateFormOptions;
  /** Overrides the definition's layout. */
  layout?: "focus" | "classic";
  registry?: RendererRegistry;
  /**
   * Called once the form completes. The ending shows only after it resolves;
   * if it rejects, the form stays on screen with an error and can be sent again.
   */
  onSubmit?: (engine: FormEngine) => void | Promise<void>;
  /** Called after every answer (debounce it to save drafts). */
  onChange?: (state: FormState, engine: FormEngine) => void;
  /** In focus layout, move on after a single pick (rating, yes/no, one choice). Default true. */
  autoAdvance?: boolean;
  submitLabel?: string;
  nextLabel?: string;
  slots?: { [K in keyof FormSlotMap]?: SlotOverride<FormSlotMap[K]> };
  slotProps?: { [K in keyof FormSlotMap]?: Partial<FormSlotMap[K]> };
  className?: string;
  testID?: string;
}

const ADVANCE_DELAY_MS = 250;

export function Form(props: FormProps) {
  const owned = useForm(props.form, props.options);
  const engine = props.engine ?? owned;
  return (
    <FormRuntime engine={engine} registry={props.registry ?? defaultRegistry}>
      <FormBody {...props} engine={engine} />
    </FormRuntime>
  );
}

function FormBody({
  engine,
  layout: layoutProp,
  onSubmit,
  onChange,
  autoAdvance = true,
  submitLabel = "Submit",
  nextLabel = "OK",
  slots,
  slotProps,
  className,
  testID,
}: FormProps & { engine: FormEngine }) {
  const def = engine.definition;
  const layout = layoutProp ?? def.layout?.mode ?? "classic";
  const status = useFormSelector(engine, (s) => s.status);
  const current = useFormSelector(engine, (s) => s.current);
  const pathKey = useFormSelector(engine, (s) => s.path.join(","));
  const errorCount = useFormSelector(engine, (s) => Object.keys(s.errors).length);
  const ending = useFormSelector(engine, (s) => s.ending);
  const historyLength = useFormSelector(engine, (s) => s.history.length);
  const path = pathKey ? pathKey.split(",") : [];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const sending = useRef(false);

  useEffect(() => {
    if (!onChange) return;
    return engine.subscribe(() => onChange(engine.getState(), engine));
  }, [engine, onChange]);

  // Focus moves to each new question so screen readers announce it.
  useEffect(() => {
    if (layout !== "focus") return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [current, layout]);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const finish = async () => {
    if (sending.current || !engine.submit()) return;
    if (!onSubmit) {
      setPhase("sent");
      return;
    }
    sending.current = true;
    setPhase("sending");
    try {
      await onSubmit(engine);
      setPhase("sent");
    } catch {
      setPhase("failed");
    } finally {
      sending.current = false;
    }
  };

  const advance = () => {
    const state = engine.getState();
    const isLast = state.current === state.path[state.path.length - 1];
    if (isLast) void finish();
    else engine.next();
  };

  const handleSubmit = (e: ReactFormEvent) => {
    e.preventDefault();
    clearTimeout(advanceTimer.current);
    if (layout === "focus") advance();
    else void finish();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // In long text, Enter is a newline; Ctrl/Cmd+Enter moves on.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target instanceof HTMLTextAreaElement) {
      e.preventDefault();
      handleSubmit(e as unknown as ReactFormEvent);
    }
  };

  const scheduleAdvance =
    layout === "focus" && autoAdvance
      ? () => {
          clearTimeout(advanceTimer.current);
          advanceTimer.current = setTimeout(advance, ADVANCE_DELAY_MS);
        }
      : undefined;

  if (status === "completed" && (phase === "sent" || !onSubmit)) {
    const end = def.endings?.find((x) => x.id === ending) ?? def.endings?.[0];
    return (
      <div className={cn("mx-auto w-full max-w-xl", className)} data-testid={testID}>
        {renderSlot(
          DefaultEnding,
          slots?.ending,
          {
            title: engine.text(end?.title ?? "Thank you."),
            description: end?.description ? engine.text(end.description) : undefined,
          },
          slotProps?.ending,
        )}
      </div>
    );
  }

  const renderBlock = (id: string, focus: boolean) => {
    const block = engine.block(id);
    if (!block || block.kind === "page-break") return null;
    if (block.kind === "content") {
      return block.type === "heading" ? (
        <h2 key={id} className="text-xl font-semibold">
          {engine.text(block.text)}
        </h2>
      ) : (
        <p key={id} className="text-muted-foreground">
          {engine.text(block.text)}
        </p>
      );
    }
    return (
      <div key={id} data-block={id}>
        <FieldRenderer id={id} autoFocus={focus && mounted.current} onAdvance={focus ? scheduleAdvance : undefined} />
      </div>
    );
  };

  const visiblePath = path.filter((id) => engine.isVisible(id) || engine.block(id)?.kind === "content");
  const step = current ? Math.max(1, visiblePath.indexOf(current) + 1) : 1;
  const isLast = layout === "classic" || current === path[path.length - 1];

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      data-layout={layout}
      data-testid={testID}
      className={cn("mx-auto w-full max-w-xl space-y-8", className)}
    >
      {renderSlot(DefaultHeader, slots?.header, { title: def.title, description: def.description }, slotProps?.header)}
      {layout === "focus" ? (
        <>
          {renderSlot(DefaultProgress, slots?.progress, { step, total: visiblePath.length }, slotProps?.progress)}
          <section aria-labelledby="gf-step-heading">
            <h2 id="gf-step-heading" ref={headingRef} tabIndex={-1} className="sr-only">
              Question {step}
            </h2>
            {current ? renderBlock(current, true) : null}
          </section>
        </>
      ) : (
        <div className="space-y-8">{visiblePath.map((id) => renderBlock(id, false))}</div>
      )}
      {phase === "failed" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          We couldn't send your answers. Check your connection and try again.
        </p>
      ) : null}
      {errorCount > 0 && layout === "classic"
        ? renderSlot(DefaultErrorSummary, slots?.errorSummary, { count: errorCount }, slotProps?.errorSummary)
        : null}
      {renderSlot(
        DefaultNavigation,
        slots?.navigation,
        {
          canGoBack: layout === "focus" && historyLength > 0 && phase !== "sending",
          isLast: isLast || status === "completed",
          busy: phase === "sending",
          onBack: () => engine.back(),
          submitLabel,
          nextLabel,
        },
        slotProps?.navigation,
      )}
    </form>
  );
}
