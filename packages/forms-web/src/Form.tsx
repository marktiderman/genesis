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
import { FormPresentationProvider, useFormPresentation, type FormPresentation } from "./presentation";
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
export interface BrandSlotProps {
  /** The practice or business name, shown beside the logo. */
  name: string;
  /** An image URL or your own element. Without one, the name's initials are shown. */
  logo?: ReactNode;
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
  /**
   * The key that continues from this question ("Enter ↵", or "Ctrl + Enter" in
   * long text). Set in page presentation's focus layout; the default
   * navigation shows it only on devices with a fine pointer (mouse, trackpad).
   */
  keyHint?: string;
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
  brand: BrandSlotProps;
  progress: ProgressSlotProps;
  navigation: NavigationSlotProps;
  ending: EndingSlotProps;
  errorSummary: ErrorSummarySlotProps;
}

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

function DefaultHeader({ title, description, className }: HeaderSlotProps) {
  const { presentation, layout } = useFormPresentation();
  if (presentation === "page" && layout === "focus") {
    // A quiet line above the first question: the question is the headline.
    return (
      <header className={cn("space-y-1", className)}>
        <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
    );
  }
  if (presentation === "page") {
    return (
      <header
        className={cn(
          "rounded-xl border border-t-8 border-t-primary bg-card px-5 py-6 text-card-foreground sm:px-8 sm:py-8",
          className,
        )}
      >
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 text-base text-muted-foreground text-pretty">{description}</p> : null}
      </header>
    );
  }
  return (
    <header className={cn("space-y-1", className)}>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </header>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

function DefaultBrand({ name, logo, className }: BrandSlotProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)} data-gf-brand="">
      {typeof logo === "string" ? (
        <img src={logo} alt="" className="size-8 shrink-0 rounded-md object-contain" />
      ) : logo ? (
        <span className="flex shrink-0 items-center" aria-hidden="true">
          {logo}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold tracking-wide text-primary-foreground"
        >
          {initials(name)}
        </span>
      )}
      <span className="truncate text-sm font-semibold tracking-tight">{name}</span>
    </div>
  );
}

function DefaultProgress({ step, total, className }: ProgressSlotProps) {
  const { presentation } = useFormPresentation();
  const page = presentation === "page";
  // In page mode the bar fills with questions answered (empty on the first), like Typeform.
  const percent = total ? Math.round(((page ? step - 1 : step) / total) * 100) : 0;
  // Not a live region: focus moving to the question is the announcement.
  const bar = (
    <Progress
      value={percent}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`Question ${step} of ${total}`}
      aria-label="Progress"
      className={cn("motion-reduce:[&>div]:transition-none", page && "h-1 rounded-none bg-primary/15")}
    />
  );
  if (page) {
    return (
      <div className={cn("fixed inset-x-0 top-0 z-10", className)} data-gf-progress="">
        {bar}
      </div>
    );
  }
  return (
    <div className={cn("space-y-1", className)} data-gf-progress="">
      {bar}
      <p className="text-sm text-muted-foreground">
        Question {step} of {total}
      </p>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
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
  keyHint,
  className,
}: NavigationSlotProps) {
  const { presentation, layout } = useFormPresentation();
  const label = busy ? "Sending…" : failed ? retryLabel : isLast ? submitLabel : nextLabel;
  if (presentation === "page") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", layout === "classic" && "pt-2", className)}>
        <Button
          type="submit"
          size="lg"
          loading={busy}
          className="h-12 min-w-28 px-6 text-base font-semibold motion-reduce:[&_.animate-spin]:animate-none [&_svg]:size-5"
        >
          {label}
          {!busy && !failed && !isLast ? <CheckIcon /> : null}
        </Button>
        {keyHint && !busy ? (
          <span className="hidden text-sm text-muted-foreground pointer-fine:inline" data-gf-key-hint="">
            press <kbd className="font-sans font-semibold text-foreground">{keyHint}</kbd>
          </span>
        ) : null}
        {canGoBack ? (
          // After OK in the tab order, drawn quietly at the page's top-left.
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Back"
            onClick={onBack}
            disabled={busy}
            // Centred on the brand row: h-16 (sm:h-20) minus its own 44px, halved.
            className="absolute left-2 top-2.5 size-11 text-muted-foreground sm:left-4 sm:top-4.5 [&_svg]:size-6"
          >
            <ChevronLeftIcon />
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {canGoBack ? (
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
      ) : null}
      <Button type="submit" size="lg" loading={busy} className="motion-reduce:[&_.animate-spin]:animate-none">
        {label}
      </Button>
    </div>
  );
}

function DefaultEnding({ title, description, className }: EndingSlotProps) {
  const { presentation } = useFormPresentation();
  if (presentation === "page") {
    return (
      <div className={cn("flex flex-col items-center gap-4 text-center", className)}>
        <span
          aria-hidden="true"
          className="mb-2 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <CheckIcon className="size-8" />
        </span>
        {/* `<Form>` focuses the element marked data-gf-focus when the ending appears. */}
        <h2
          tabIndex={-1}
          data-gf-focus=""
          className={cn(
            "rounded-sm text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl",
            focusRing,
          )}
        >
          {title}
        </h2>
        {description ? <p className="max-w-md text-lg text-muted-foreground text-pretty">{description}</p> : null}
      </div>
    );
  }
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

export interface FormBrand {
  name: string;
  /** An image URL or your own element (decorative: the name is the text). Without one, the name's initials are shown. */
  logo?: ReactNode | undefined;
}

export interface FormProps {
  /** A `defineForm` result or a canonical definition. */
  form: FormDefinition | { definition: FormDefinition };
  /** Bring your own engine (from `useForm`) to read state outside the form. `form` and `options` are then unused. */
  engine?: FormEngine | undefined;
  options?: CreateFormOptions | undefined;
  /** Overrides the definition's layout. */
  layout?: "focus" | "classic" | undefined;
  /**
   * `"embedded"` (default): a block inside your own page. `"page"`: the
   * respondent's whole screen, for a QR code or a shared link. It fills the
   * viewport with no card around it; in focus layout each question is centred
   * under a thin progress bar with large type and tap targets, and in classic
   * layout the questions are sections on one scrolling page.
   */
  presentation?: FormPresentation | undefined;
  /** A practice's name and logo, shown small at the top of every step and on the ending. */
  brand?: FormBrand | undefined;
  registry?: RendererRegistry | undefined;
  /**
   * Called once the form completes. The ending shows only after it resolves.
   * If it rejects, the answers stay on screen, read-only (a completed response
   * is final), with an error and a "Try again" button that sends them again.
   */
  onSubmit?: ((engine: FormEngine) => void | Promise<void>) | undefined;
  /**
   * Called on every state change: an answer, a step forward or back, a
   * submit attempt (debounce it to save drafts).
   */
  onChange?: ((state: FormState, engine: FormEngine) => void) | undefined;
  /**
   * In focus layout, move on after a single pick (rating, yes/no, one choice).
   * Arrow keys only move through the options; a click, tap or Space picks.
   * Never moves on from the last question. Default true.
   */
  autoAdvance?: boolean | undefined;
  submitLabel?: string | undefined;
  nextLabel?: string | undefined;
  /** The submit button's label after `onSubmit` failed. Default "Try again". */
  retryLabel?: string | undefined;
  slots?: { [K in keyof FormSlotMap]?: SlotOverride<FormSlotMap[K]> } | undefined;
  slotProps?: { [K in keyof FormSlotMap]?: Partial<FormSlotMap[K]> } | undefined;
  className?: string | undefined;
  testID?: string | undefined;
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
  presentation = "embedded",
  brand,
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
  const pathKey = useFormSelector(engine, (s) => JSON.stringify(s.path));
  // A string, so typing (which builds a new errors object) doesn't re-render the whole form.
  const errorsKey = useFormSelector(engine, (s) => JSON.stringify(s.errors));
  const ending = useFormSelector(engine, (s) => s.ending);
  const historyLength = useFormSelector(engine, (s) => s.history.length);
  // The introduction recalls like endings do ({{field:name}}, {{hidden:coach}}), so it follows
  // the answers; a string, so it re-renders only when the recalled text changes.
  const description = useFormSelector(engine, () => (def.description ? engine.text(def.description) : undefined));
  const path = JSON.parse(pathKey) as string[];
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
  // Which way the last step went, so page mode slides the new question in from that side.
  const direction = useRef<"forward" | "back">("forward");
  // "Ctrl" until mounted, so the server and the first client render agree.
  const [modKey, setModKey] = useState("Ctrl");
  const page = presentation === "page";

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setModKey("⌘");
  }, []);

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
    direction.current = "forward";
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
            direction.current = "forward";
            if (!engine.next()) announceStepError();
          }, ADVANCE_DELAY_MS);
        }
      : undefined;

  const goBack = () => {
    clearTimeout(advanceTimer.current);
    direction.current = "back";
    engine.back();
  };

  // Rendered in both branches at the same position, so it exists before anything is announced.
  const liveRegion = (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-gf-live="">
      {announcement}
    </div>
  );

  const presentationValue = { presentation, layout };
  const brandNode = brand
    ? renderSlot(DefaultBrand, slots?.brand, { name: brand.name, logo: brand.logo }, slotProps?.brand)
    : null;

  if (showEnding) {
    const end = def.endings?.find((x) => x.id === ending) ?? def.endings?.[0];
    const endingNode = renderSlot(
      DefaultEnding,
      slots?.ending,
      {
        title: engine.text(end?.title ?? "Thank you."),
        description: end?.description ? engine.text(end.description) : undefined,
      },
      slotProps?.ending,
    );
    return (
      <FormPresentationProvider value={presentationValue}>
        {liveRegion}
        {page ? (
          <div
            ref={endingRef}
            data-presentation="page"
            data-testid={testID}
            className={cn("flex min-h-dvh w-full flex-col bg-background text-foreground", className)}
          >
            {brandNode ? (
              <div className="flex h-16 shrink-0 items-center justify-center px-16 sm:h-20">{brandNode}</div>
            ) : null}
            <div className="flex flex-1 items-center justify-center px-4 pb-24 pt-8 sm:px-6">
              <div className="w-full max-w-xl">{endingNode}</div>
            </div>
          </div>
        ) : (
          <div ref={endingRef} className={cn("mx-auto w-full max-w-xl space-y-6", className)} data-testid={testID}>
            {brandNode}
            {endingNode}
          </div>
        )}
      </FormPresentationProvider>
    );
  }

  const pageFocus = page && layout === "focus";
  const pageClassic = page && layout === "classic";

  const renderBlock = (id: string, focus: boolean) => {
    const block = engine.block(id);
    if (!block || block.kind === "page-break") return null;
    if (block.kind === "content") {
      // In focus layout a content step is its own question text, so it takes focus.
      const focusable = focus ? { tabIndex: -1, "data-gf-question": "" } : {};
      const content =
        block.type === "heading" ? (
          <h2
            key={id}
            className={cn(
              "rounded-sm text-xl font-semibold",
              pageFocus && "text-2xl leading-tight tracking-tight text-balance sm:text-3xl",
              focusRing,
            )}
            {...focusable}
          >
            {engine.text(block.text)}
          </h2>
        ) : (
          <p
            key={id}
            className={cn("rounded-sm text-muted-foreground", pageFocus && "text-lg sm:text-xl text-pretty", focusRing)}
            {...focusable}
          >
            {engine.text(block.text)}
          </p>
        );
      return pageClassic ? (
        <section key={id} className={classicSection}>
          {content}
        </section>
      ) : (
        content
      );
    }
    const field = <FieldRenderer id={id} onAdvance={focus ? scheduleAdvance : undefined} />;
    return (
      <div key={id} data-block={id} className={pageClassic ? classicSection : undefined}>
        {field}
      </div>
    );
  };

  const step = current ? Math.max(1, path.indexOf(current) + 1) : 1;
  const isLast = layout === "classic" || current === path[path.length - 1];
  const errorItems: ErrorSummaryItem[] = path
    .filter((id) => errors[id])
    .map((id) => ({
      id,
      label: engine.text(engine.field(id)?.label ?? id),
      message: errors[id]!,
      href: `#${idPrefix}-${id}`,
    }));
  const currentField = pageFocus && current ? engine.field(current) : undefined;
  const keyHint = currentField ? (currentField.type === "long-text" ? `${modKey} + Enter` : "Enter ↵") : undefined;

  const header = renderSlot(
    DefaultHeader,
    slots?.header,
    { title: def.title, description },
    slotProps?.header,
  );
  const errorSummary =
    errorItems.length > 0 && layout === "classic"
      ? renderSlot(
          DefaultErrorSummary,
          slots?.errorSummary,
          {
            count: errorItems.length,
            errors: errorItems,
            className: page ? "bg-card" : undefined,
          },
          slotProps?.errorSummary,
        )
      : null;
  const progress =
    layout === "focus"
      ? renderSlot(DefaultProgress, slots?.progress, { step, total: path.length }, slotProps?.progress)
      : null;
  const fields = (
    // Disabled once the response is completed (sending, or after a failed send): read-only, not dead.
    <fieldset disabled={locked} className="min-w-0 border-0 p-0">
      {layout === "focus" ? (
        <div
          // A new element per question, so page mode's entry transition runs for each one.
          key={pageFocus ? (current ?? "") : undefined}
          ref={stepRef}
          tabIndex={-1}
          className={cn(
            "outline-none",
            pageFocus &&
              "transition-[opacity,translate] duration-300 ease-out starting:opacity-0 motion-reduce:transition-none",
            pageFocus && (direction.current === "back" ? "starting:-translate-y-6" : "starting:translate-y-6"),
          )}
        >
          {current ? renderBlock(current, true) : null}
        </div>
      ) : (
        <div className={pageClassic ? "space-y-4" : "space-y-8"}>{path.map((id) => renderBlock(id, false))}</div>
      )}
    </fieldset>
  );
  const failure =
    phase === "failed" ? (
      <p role="alert" className={cn("text-sm font-medium text-destructive", page && "text-base")}>
        We couldn't send your answers. They're kept here: press {retryLabel} to send them again.
      </p>
    ) : null;
  const navigation = renderSlot(
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
      keyHint,
    },
    slotProps?.navigation,
  );

  const formProps = {
    ref: formRef,
    noValidate: true,
    onSubmit: handleSubmit,
    onKeyDown: handleKeyDown,
    "data-layout": layout,
    "data-presentation": presentation,
    "data-testid": testID,
  };

  return (
    <FormPresentationProvider value={presentationValue}>
      {liveRegion}
      {pageFocus ? (
        <form
          {...formProps}
          className={cn("relative flex min-h-dvh w-full flex-col bg-background text-foreground", className)}
        >
          {progress}
          {/* Side padding keeps the brand clear of the Back button at the top-left. */}
          <div className="flex h-16 shrink-0 items-center justify-center px-16 sm:h-20">{brandNode}</div>
          <div className="flex flex-1 flex-col justify-center px-4 pb-20 pt-4 sm:px-6 sm:pb-28">
            <div className="mx-auto w-full max-w-xl">
              {/* The form's name introduces the first question, then stays for assistive tech only. */}
              <div className={historyLength === 0 ? "mb-5" : "sr-only"}>{header}</div>
              {fields}
              {failure ? <div className="mt-6">{failure}</div> : null}
              <div className="mt-10">{navigation}</div>
            </div>
          </div>
        </form>
      ) : pageClassic ? (
        <form
          {...formProps}
          className={cn("min-h-dvh w-full bg-muted/40 px-4 py-8 text-foreground sm:py-12", className)}
        >
          <div className="mx-auto w-full max-w-2xl space-y-4">
            {brandNode ? <div className="flex justify-center pb-2">{brandNode}</div> : null}
            {header}
            {errorSummary}
            {fields}
            {failure}
            {navigation}
          </div>
        </form>
      ) : (
        <form {...formProps} className={cn("mx-auto w-full max-w-xl space-y-8", className)}>
          {brandNode}
          {header}
          {errorSummary}
          {progress}
          {fields}
          {failure}
          {navigation}
        </form>
      )}
    </FormPresentationProvider>
  );
}

/** One question per section on a classic page, Google Forms style; an invalid one gets a red edge. */
const classicSection =
  "rounded-xl border bg-card px-5 py-6 text-card-foreground sm:px-8 has-[[aria-invalid=true]]:border-destructive";
