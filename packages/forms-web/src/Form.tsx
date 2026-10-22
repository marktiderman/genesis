import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent,
  type MouseEvent,
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
  useFormContext,
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
  /** True after `onSubmit` failed. The answers are kept, and submitting again resends them. */
  failed: boolean;
  onBack: () => void;
  submitLabel: string;
  nextLabel: string;
  retryLabel: string;
  className?: string;
}
export interface EndingSlotProps {
  title: string;
  description?: string;
  className?: string;
}
export interface ErrorSummaryItem {
  /** The field's block id. */
  id: string;
  /** The question, with recall resolved. */
  label: string;
  message: string;
  /** `#` + the field's element id: the control, or the fieldset of a group. */
  href: string;
}
export interface ErrorSummarySlotProps {
  count: number;
  /** Every invalid field, in form order. */
  errors: ErrorSummaryItem[];
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

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

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
  // Not a live region: focus moving to the question is the announcement.
  return (
    <div className={cn("space-y-1", className)}>
      <Progress
        value={percent}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Progress"
        className="motion-reduce:[&>div]:transition-none"
      />
      <p className="text-sm text-muted-foreground">
        Question {step} of {total}
      </p>
    </div>
  );
}

function DefaultNavigation({
  canGoBack,
  isLast,
  busy,
  failed,
  onBack,
  submitLabel,
  nextLabel,
  retryLabel,
  className,
}: NavigationSlotProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {canGoBack ? (
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
      ) : null}
      <Button type="submit" size="lg" loading={busy} className="motion-reduce:[&_.animate-spin]:animate-none">
        {busy ? "Sending…" : failed ? retryLabel : isLast ? submitLabel : nextLabel}
      </Button>
    </div>
  );
}

function DefaultEnding({ title, description, className }: EndingSlotProps) {
  return (
    <div className={cn("space-y-2 py-8 text-center", className)}>
      {/* `<Form>` focuses the element marked data-gf-focus when the ending appears. */}
      <h2 tabIndex={-1} data-gf-focus="" className={cn("rounded-sm text-2xl font-semibold", focusRing)}>
        {title}
      </h2>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/** Follow a summary link: focus the control, or the first (checked) option of a group. */
function focusErrorTarget(event: MouseEvent<HTMLAnchorElement>) {
  const id = event.currentTarget.hash.slice(1);
  const target = id ? document.getElementById(id) : null;
  if (!target) return;
  event.preventDefault();
  const control = target.matches("input, textarea, select, button")
    ? target
    : (target.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)') ??
      target.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), button:not(:disabled)"));
  (control ?? target).focus();
}

function DefaultErrorSummary({ count, errors, className }: ErrorSummarySlotProps) {
  const titleId = useId();
  return (
    // `<Form>` focuses the element marked data-gf-error-summary after a failed submit.
    <div
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-gf-error-summary=""
      className={cn("space-y-2 rounded-md border border-destructive p-4", focusRing, className)}
    >
      <h2 id={titleId} className="text-base font-semibold text-destructive">
        {count === 1 ? "One answer needs attention." : `${count} answers need attention.`}
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {errors.map((e) => (
          <li key={e.id}>
            <a href={e.href} onClick={focusErrorTarget} className="font-medium text-destructive underline underline-offset-4">
              {e.label}: {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

export interface FormProps {
  /** A `defineForm` result or a canonical definition. */
  form: FormDefinition | { definition: FormDefinition };
  /** Bring your own engine (from `useForm`) to read state outside the form. `form` and `options` are then unused. */
  engine?: FormEngine;
  options?: CreateFormOptions;
  /** Overrides the definition's layout. */
  layout?: "focus" | "classic";
  registry?: RendererRegistry;
  /**
   * Called once the form completes. The ending shows only after it resolves.
   * If it rejects, the answers stay on screen, read-only (a completed response
   * is final), with an error and a "Try again" button that sends them again.
   */
  onSubmit?: (engine: FormEngine) => void | Promise<void>;
  /** Called after every answer (debounce it to save drafts). */
  onChange?: (state: FormState, engine: FormEngine) => void;
  /**
   * In focus layout, move on after a single pick (rating, yes/no, one choice).
   * Arrow keys only move through the options; a click, tap or Space picks.
   * Never moves on from the last question. Default true.
   */
  autoAdvance?: boolean;
  submitLabel?: string;
  nextLabel?: string;
  /** The submit button's label after `onSubmit` failed. Default "Try again". */
  retryLabel?: string;
  slots?: { [K in keyof FormSlotMap]?: SlotOverride<FormSlotMap[K]> };
  slotProps?: { [K in keyof FormSlotMap]?: Partial<FormSlotMap[K]> };
  className?: string;
  testID?: string;
}

const ADVANCE_DELAY_MS = 250;

// A stable key per engine, so a new engine starts the form body over.
const engineKeys = new WeakMap<FormEngine, number>();
let nextEngineKey = 0;
function keyOf(engine: FormEngine): number {
  let key = engineKeys.get(engine);
  if (key === undefined) {
    key = nextEngineKey++;
    engineKeys.set(engine, key);
  }
  return key;
}

export function Form(props: FormProps) {
  return props.engine ? <FormWithEngine {...props} engine={props.engine} /> : <OwnedForm {...props} />;
}

function OwnedForm(props: FormProps) {
  const engine = useForm(props.form, props.options);
  return <FormWithEngine {...props} engine={engine} />;
}

function FormWithEngine(props: FormProps & { engine: FormEngine }) {
  return (
    <FormRuntime engine={props.engine} registry={props.registry ?? defaultRegistry}>
      <FormBody key={keyOf(props.engine)} {...props} />
    </FormRuntime>
  );
}

/** Focus what a step or an ending marks, else its question text, else the container. */
function focusWithin(root: HTMLElement | null) {
  if (!root) return;
  const target =
    root.querySelector<HTMLElement>("[data-gf-focus]") ??
    root.querySelector<HTMLElement>("[data-gf-question]") ??
    root.querySelector<HTMLElement>("h1, h2, h3");
  if (target && target.tabIndex < 0 && !target.hasAttribute("tabindex")) target.tabIndex = -1;
  (target ?? root).focus();
}

function FormBody({
  engine,
  layout: layoutProp,
  onSubmit,
  onChange,
  autoAdvance = true,
  submitLabel = "Submit",
  nextLabel = "OK",
  retryLabel = "Try again",
  slots,
  slotProps,
  className,
  testID,
}: FormProps & { engine: FormEngine }) {
  const { idPrefix } = useFormContext();
  const def = engine.definition;
  const layout = layoutProp ?? def.layout?.mode ?? "classic";
  const status = useFormSelector(engine, (s) => s.status);
  const current = useFormSelector(engine, (s) => s.current);
  const pathKey = useFormSelector(engine, (s) => s.path.join(","));
  // A string, so typing (which builds a new errors object) doesn't re-render the whole form.
  const errorsKey = useFormSelector(engine, (s) => JSON.stringify(s.errors));
  const ending = useFormSelector(engine, (s) => s.ending);
  const historyLength = useFormSelector(engine, (s) => s.history.length);
  const path = pathKey ? pathKey.split(",") : [];
  const errors = JSON.parse(errorsKey) as Record<string, string>;
  const formRef = useRef<HTMLFormElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef<HTMLDivElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousCurrent = useRef(current);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [announcement, setAnnouncement] = useState("");
  const [summaryRequest, setSummaryRequest] = useState(0);
  const sending = useRef(false);

  const showEnding = status === "completed" && (phase === "sent" || !onSubmit);
  // A completed response is final: the engine ignores edits, so the fields say so.
  const locked = status === "completed";

  useEffect(() => {
    if (!onChange) return;
    return engine.subscribe(() => onChange(engine.getState(), engine));
  }, [engine, onChange]);

  // A new question cancels a pending auto-advance and, in focus layout, takes
  // focus: the input of a text field, otherwise the visible question. Comparing
  // with the previous question (not a "mounted" flag) keeps StrictMode's
  // double effect run from stealing focus on first render. A layout effect, so
  // keys typed right after advancing land in the new input.
  useLayoutEffect(() => {
    if (previousCurrent.current === current) return;
    previousCurrent.current = current;
    clearTimeout(advanceTimer.current);
    if (layout === "focus") focusWithin(stepRef.current);
  }, [current, layout]);

  useLayoutEffect(() => {
    if (showEnding) focusWithin(endingRef.current);
  }, [showEnding]);

  useLayoutEffect(() => {
    if (!summaryRequest) return;
    const form = formRef.current;
    const summary = form?.querySelector<HTMLElement>("[data-gf-error-summary]");
    if (summary) summary.focus();
    else form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [summaryRequest]);

  // The submit button is disabled while sending, which drops focus; put it back on "Try again".
  useLayoutEffect(() => {
    if (phase !== "failed") return;
    const form = formRef.current;
    if (form && !form.contains(document.activeElement)) form.querySelector<HTMLElement>('[type="submit"]')?.focus();
  }, [phase]);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  /** Say something once in the persistent live region, even if it's the same text as last time. */
  const announce = (message: string) =>
    setAnnouncement((previous) => (previous === message ? `${message} ` : message));
  const announceStepError = () => {
    const state = engine.getState();
    const message = state.current ? state.errors[state.current] : undefined;
    if (message) announce(message);
  };

  const finish = async () => {
    if (sending.current) return;
    // A retry after a failed onSubmit finds the response already completed.
    if (engine.getState().status !== "completed" && !engine.submit()) {
      if (layout === "classic") setSummaryRequest((n) => n + 1);
      else announceStepError();
      return;
    }
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

  const isLastStep = (state: FormState) => state.current === state.path[state.path.length - 1];

  const advance = () => {
    if (isLastStep(engine.getState())) void finish();
    else if (!engine.next()) announceStepError();
  };

  const submit = () => {
    clearTimeout(advanceTimer.current);
    if (layout === "focus") advance();
    else void finish();
  };

  const handleSubmit = (e: ReactFormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    // In long text, Enter is a newline; Ctrl/Cmd+Enter moves on.
    if (target instanceof HTMLTextAreaElement) {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        submit();
      }
      return;
    }
    // Radios and checkboxes leave Enter unused (WAI-ARIA APG); in focus layout
    // it continues, like the OK button. A text input submits natively.
    if (layout === "focus" && target.matches('[role="radio"], [role="checkbox"]')) {
      e.preventDefault();
      submit();
    }
  };

  // Auto-advance never submits: on the last question the respondent presses Submit.
  const scheduleAdvance =
    layout === "focus" && autoAdvance
      ? () => {
          clearTimeout(advanceTimer.current);
          advanceTimer.current = setTimeout(() => {
            const state = engine.getState();
            if (state.status === "completed" || isLastStep(state)) return;
            if (!engine.next()) announceStepError();
          }, ADVANCE_DELAY_MS);
        }
      : undefined;

  const goBack = () => {
    clearTimeout(advanceTimer.current);
    engine.back();
  };

  // Rendered in both branches at the same position, so it exists before anything is announced.
  const liveRegion = (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-gf-live="">
      {announcement}
    </div>
  );

  if (showEnding) {
    const end = def.endings?.find((x) => x.id === ending) ?? def.endings?.[0];
    return (
      <>
        {liveRegion}
        <div ref={endingRef} className={cn("mx-auto w-full max-w-xl", className)} data-testid={testID}>
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
      </>
    );
  }

  const renderBlock = (id: string, focus: boolean) => {
    const block = engine.block(id);
    if (!block || block.kind === "page-break") return null;
    if (block.kind === "content") {
      // In focus layout a content step is its own question text, so it takes focus.
      const focusable = focus ? { tabIndex: -1, "data-gf-question": "" } : {};
      return block.type === "heading" ? (
        <h2 key={id} className={cn("rounded-sm text-xl font-semibold", focusRing)} {...focusable}>
          {engine.text(block.text)}
        </h2>
      ) : (
        <p key={id} className={cn("rounded-sm text-muted-foreground", focusRing)} {...focusable}>
          {engine.text(block.text)}
        </p>
      );
    }
    return (
      <div key={id} data-block={id}>
        <FieldRenderer id={id} onAdvance={focus ? scheduleAdvance : undefined} />
      </div>
    );
  };

  const visiblePath = path.filter((id) => engine.isVisible(id) || engine.block(id)?.kind === "content");
  const step = current ? Math.max(1, visiblePath.indexOf(current) + 1) : 1;
  const isLast = layout === "classic" || current === path[path.length - 1];
  const errorItems: ErrorSummaryItem[] = path
    .filter((id) => errors[id])
    .map((id) => ({
      id,
      label: engine.text(engine.field(id)?.label ?? id),
      message: errors[id]!,
      href: `#${idPrefix}-${id}`,
    }));

  return (
    <>
      {liveRegion}
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        data-layout={layout}
        data-testid={testID}
        className={cn("mx-auto w-full max-w-xl space-y-8", className)}
      >
        {renderSlot(DefaultHeader, slots?.header, { title: def.title, description: def.description }, slotProps?.header)}
        {errorItems.length > 0 && layout === "classic"
          ? renderSlot(
              DefaultErrorSummary,
              slots?.errorSummary,
              { count: errorItems.length, errors: errorItems },
              slotProps?.errorSummary,
            )
          : null}
        {layout === "focus"
          ? renderSlot(DefaultProgress, slots?.progress, { step, total: visiblePath.length }, slotProps?.progress)
          : null}
        {/* Disabled once the response is completed (sending, or after a failed send): read-only, not dead. */}
        <fieldset disabled={locked} className="min-w-0 border-0 p-0">
          {layout === "focus" ? (
            <div ref={stepRef} tabIndex={-1} className="outline-none">
              {current ? renderBlock(current, true) : null}
            </div>
          ) : (
            <div className="space-y-8">{visiblePath.map((id) => renderBlock(id, false))}</div>
          )}
        </fieldset>
        {phase === "failed" ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            We couldn't send your answers. They're kept here: press {retryLabel} to send them again.
          </p>
        ) : null}
        {renderSlot(
          DefaultNavigation,
          slots?.navigation,
          {
            canGoBack: layout === "focus" && historyLength > 0 && !locked,
            isLast: isLast || status === "completed",
            busy: phase === "sending",
            failed: phase === "failed",
            onBack: goBack,
            submitLabel,
            nextLabel,
            retryLabel,
          },
          slotProps?.navigation,
        )}
      </form>
    </>
  );
}
