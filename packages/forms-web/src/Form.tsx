import {
  useContext,
  useEffect,
  useId,
  useMemo,
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
import {
  contentText,
  type CreateFormOptions,
  type FieldBlock,
  type FormDefinition,
  type FormEngine,
  type FormProgress,
  type FormState,
  type HostOptions,
  type PhotoRef,
  type LinkParams,
} from "@marktiderman/genesis-forms";
import {
  FieldRenderer,
  formEngineOptions,
  FormRuntime,
  useForm,
  useFormContext,
  useFormController,
  type FocusTarget,
  type RendererRegistry,
} from "@marktiderman/genesis-forms-react";
import { FormPresentationProvider, useFormPresentation, type FormPresentation } from "./presentation";
import { defaultRegistry } from "./renderers";
import { themeCss, type FormTheme } from "./theme";
import { createPendingUploads, PendingUploadsContext, UPLOAD_WAIT_MESSAGE, UploadContext, type PendingUploads, type UploadHost } from "./upload";

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
  /** `theme.headerImage`: a banner over the title. */
  image?: { src: string; alt: string } | undefined;
  /**
   * The note that marks required questions ("Required", drawn as "* Required"),
   * set when the form has at least one required question. Empty when it has none
   * or `requiredLabel` is null.
   */
  requiredNote?: string | undefined;
  className?: string;
}
export interface BrandSlotProps {
  /** The organisation or business name, shown beside the logo. */
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
  /**
   * Buttons or links under the ending, such as "Send another response" or "Change your
   * answers": pass them through `slotProps.ending`. The default ending shows them in a
   * centred row.
   */
  actions?: ReactNode;
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

/** "* Required": the asterisk matches the one beside each required question. */
function RequiredNote({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} data-gf-required-note="">
      <span className="text-destructive" aria-hidden="true">
        *{" "}
      </span>
      {text}
    </p>
  );
}

function HeaderImage({ image, className }: { image: { src: string; alt: string }; className?: string }) {
  return (
    <img
      src={image.src}
      alt={image.alt}
      data-gf-header-image=""
      className={cn("block h-32 w-full object-cover sm:h-44", className)}
    />
  );
}

function DefaultHeader({ title, description, image, requiredNote, className }: HeaderSlotProps) {
  const { presentation, layout } = useFormPresentation();
  if (presentation === "page" && layout === "focus") {
    // A quiet line above the first question: the question is the headline.
    return (
      <header className={cn("space-y-1", className)}>
        {image ? <HeaderImage image={image} className="mb-4 rounded-lg" /> : null}
        <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground whitespace-pre-line">{description}</p> : null}
        {requiredNote ? <RequiredNote text={requiredNote} /> : null}
      </header>
    );
  }
  if (presentation === "page") {
    return (
      <header
        className={cn(
          "overflow-hidden rounded-xl border bg-card text-card-foreground",
          !image && "border-t-8 border-t-primary",
          className,
        )}
      >
        {image ? <HeaderImage image={image} /> : null}
        <div className={cn("px-5 py-6 sm:px-8 sm:py-8", image && "border-t-8 border-t-primary")}>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
          {description ? <p className="mt-3 text-base text-muted-foreground text-pretty whitespace-pre-line">{description}</p> : null}
          {requiredNote ? <RequiredNote text={requiredNote} className="mt-4" /> : null}
        </div>
      </header>
    );
  }
  return (
    <header className={cn("space-y-1", className)}>
      {image ? <HeaderImage image={image} className="mb-4 rounded-lg" /> : null}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-muted-foreground whitespace-pre-line">{description}</p> : null}
      {requiredNote ? <RequiredNote text={requiredNote} className="pt-1" /> : null}
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
  if (!total) return null;
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

/**
 * The built-in ending (a check, the title and description, then any `actions`). Exported
 * so a custom ending slot can wrap it rather than copy it.
 */
export function DefaultEnding({ title, description, actions, className }: EndingSlotProps) {
  const { presentation } = useFormPresentation();
  const actionRow = actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null;
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
        {description ? <p className="max-w-md text-lg text-muted-foreground text-pretty whitespace-pre-line">{description}</p> : null}
        {actionRow}
      </div>
    );
  }
  return (
    <div className={cn("space-y-2 py-8 text-center", className)}>
      {/* `<Form>` focuses the element marked data-gf-focus when the ending appears. */}
      <h2 tabIndex={-1} data-gf-focus="" className={cn("rounded-sm text-2xl font-semibold", focusRing)}>
        {title}
      </h2>
      {description ? <p className="text-muted-foreground whitespace-pre-line">{description}</p> : null}
      {actionRow}
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
  /**
   * Option lists this app supplies, by key, for choice questions whose
   * options come from the app (`props.optionsFrom: { source: "host", key }`),
   * such as `{ staff: [{ value: "8c1…", label: "Ada Lovelace" }] }`. Shown
   * after the question's own options. Like `options`, read when the response
   * starts; unused with `engine` (pass `hostOptions` to `useForm` then). Check
   * answers on the server with the same lists (`validateSubmission`'s
   * `hostOptions`).
   */
  hostOptions?: HostOptions | undefined;
  /**
   * The query parameters of the link the form was opened from, such as
   * `new URLSearchParams(location.search)`. A choice question with
   * `props.prefill: { param }` starts with that parameter's value picked when
   * it is one of its options (`prefillFromLink`), and with
   * `hideWhenPrefilled` it isn't shown at all. Read when the response starts;
   * unused with `engine` (pass `linkParams` to `useForm` then).
   */
  linkParams?: LinkParams | undefined;
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
  /** An organisation's or business's name and logo, shown small at the top of every step and on the ending. */
  brand?: FormBrand | undefined;
  /**
   * Colours and a header image: `accent` replaces the primary colour (buttons,
   * selected options, progress, focus ring), adjusted where needed so it keeps
   * at least 3:1 contrast with the page and its text 4.5:1; `headerImage` is a
   * banner over the title.
   */
  theme?: FormTheme | undefined;
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
   * Save answers as they go: with the definition's `settings.saveProgress` on,
   * called a moment after each step forward (in classic layout, a moment after
   * the answers change) with how far the respondent got (`formProgress`); read
   * the answers so far with `engine.answers()`. It never holds them up: it runs
   * after the step, and a rejection is ignored (the next call carries every
   * answer again). A pending call goes at once when the page is hidden, and none
   * is made once the form is submitted.
   */
  onProgress?: ((engine: FormEngine, progress: FormProgress) => void | Promise<void>) | undefined;
  /**
   * The note under the first question while answers save as they go (only with
   * `onProgress` and `settings.saveProgress`). `null` hides it. Default
   * "Your answers save as you go."
   */
  progressNotice?: string | null | undefined;
  /**
   * In focus layout, move on after a single pick (rating, yes/no, one choice).
   * Arrow keys only move through the options; a click, tap or Space picks.
   * Never moves on from the last question. Default true.
   */
  autoAdvance?: boolean | undefined;
  /** The send button's word, the same in every layout. Default "Send". */
  submitLabel?: string | undefined;
  /** The button that moves to the next question in focus layout. Default "OK". */
  nextLabel?: string | undefined;
  /**
   * The note shown with the title when any question is required, after an
   * asterisk ("* Required"). `null` hides it. Default "Required".
   */
  requiredLabel?: string | null | undefined;
  /** The submit button's label after `onSubmit` failed. Default "Try again". */
  retryLabel?: string | undefined;
  /**
   * Stores a file a respondent adds to a `photo` field and resolves to its
   * reference (`{ id, name, type, size }`), which is all the answer keeps; a
   * rejection shows under the field. While any upload is in flight the form
   * neither moves on nor sends. Without it (and without an `UploadContext`
   * above the form), photo fields say photos can't be added.
   */
  onUpload?: ((file: File, field: FieldBlock) => Promise<PhotoRef>) | undefined;
  /**
   * The upload adapter (genesis-forms' `UploadAdapter`): `signedUploadHost`, or any object of
   * that shape, such as genesis-media-library's `/forms` adapter. Unlike `onUpload` it brings
   * `url` too, for thumbnails. It wins over `onUpload` and an `UploadContext` above the form.
   */
  uploads?: UploadHost | undefined;
  slots?: { [K in keyof FormSlotMap]?: SlotOverride<FormSlotMap[K]> } | undefined;
  slotProps?: { [K in keyof FormSlotMap]?: Partial<FormSlotMap[K]> } | undefined;
  className?: string | undefined;
  testID?: string | undefined;
}

// The step and send logic lives in `useFormController` (genesis-forms-react), shared with the
// native renderer; these timings are its.
export { CLASSIC_PROGRESS_DELAY_MS, PROGRESS_DELAY_MS } from "@marktiderman/genesis-forms-react";

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
  const options = formEngineOptions(props.options, { hostOptions: props.hostOptions, linkParams: props.linkParams });
  const engine = useForm(props.form, options);
  return <FormWithEngine {...props} engine={engine} />;
}

function FormWithEngine(props: FormProps & { engine: FormEngine }) {
  const { onUpload, uploads } = props;
  // `uploads` wins, then `onUpload`; otherwise a host's own UploadContext above the form is kept.
  const outer = useContext(UploadContext);
  const host = useMemo(() => uploads ?? (onUpload ? { upload: onUpload } : outer), [uploads, onUpload, outer]);
  const [pending] = useState(createPendingUploads);
  return (
    <UploadContext.Provider value={host}>
      <PendingUploadsContext.Provider value={pending}>
        <FormRuntime engine={props.engine} registry={props.registry ?? defaultRegistry}>
          <FormBody key={keyOf(props.engine)} {...props} pendingUploads={pending} />
        </FormRuntime>
      </PendingUploadsContext.Provider>
    </UploadContext.Provider>
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
  theme,
  onSubmit,
  onChange,
  onProgress,
  progressNotice = "Your answers save as you go.",
  autoAdvance = true,
  submitLabel = "Send",
  requiredLabel = "Required",
  nextLabel = "OK",
  retryLabel = "Try again",
  slots,
  slotProps,
  className,
  testID,
  pendingUploads,
}: FormProps & { engine: FormEngine; pendingUploads: PendingUploads }) {
  const { idPrefix } = useFormContext();
  const def = engine.definition;
  const formRef = useRef<HTMLFormElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef<HTMLDivElement>(null);
  // "Ctrl" until mounted, so the server and the first client render agree.
  const [modKey, setModKey] = useState("Ctrl");
  const page = presentation === "page";

  // The controller decides when focus moves; this decides where in the DOM.
  const focus = (target: FocusTarget) => {
    if (target.kind === "step") focusWithin(stepRef.current);
    else if (target.kind === "ending") focusWithin(endingRef.current);
    else if (target.kind === "errorSummary") {
      const form = formRef.current;
      const summary = form?.querySelector<HTMLElement>("[data-gf-error-summary]");
      if (summary) summary.focus();
      else form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    } else {
      // The submit button is disabled while sending, which drops focus; put it back on "Try again".
      const form = formRef.current;
      if (form && !form.contains(document.activeElement)) form.querySelector<HTMLElement>('[type="submit"]')?.focus();
    }
  };
  const controller = useFormController(engine, {
    layout: layoutProp,
    onSubmit,
    onChange,
    onProgress,
    autoAdvance,
    waitFor: () => (pendingUploads.count() === 0 ? null : UPLOAD_WAIT_MESSAGE),
    focus,
  });
  const {
    layout,
    status,
    current,
    path,
    historyLength,
    description,
    phase,
    announcement,
    showEnding,
    locked,
    saveProgress,
  } = controller;

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setModKey("⌘");
  }, []);

  // Leaving the page (closing the tab, switching away on a phone) sends a pending save now.
  const { flushProgress } = controller;
  useEffect(() => {
    if (!saveProgress) return;
    window.addEventListener("pagehide", flushProgress);
    return () => window.removeEventListener("pagehide", flushProgress);
  }, [saveProgress, flushProgress]);

  const handleSubmit = (e: ReactFormEvent) => {
    e.preventDefault();
    controller.submit();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    // In long text, Enter is a newline; Ctrl/Cmd+Enter moves on.
    if (target instanceof HTMLTextAreaElement) {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        controller.submit();
      }
      return;
    }
    // Radios and checkboxes leave Enter unused (WAI-ARIA APG); in focus layout
    // it continues, like the OK button. A text input submits natively.
    if (layout === "focus" && target.matches('[role="radio"], [role="checkbox"]')) {
      e.preventDefault();
      controller.submit();
    }
  };

  // Auto-advance never submits: on the last question the respondent presses Submit.
  const scheduleAdvance = controller.onAdvance;
  const goBack = controller.back;

  // Rendered in both branches at the same position, so it exists before anything is announced.
  const liveRegion = (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-gf-live="">
      {announcement}
    </div>
  );

  const presentationValue = { presentation, layout };
  const themeId = `gf-theme-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const themeStyle = themeCss(theme, `[data-gf-theme="${themeId}"]`);
  // The theme's colours apply to everything inside: the form, or the ending in its place.
  const themed = themeStyle ? { "data-gf-theme": themeId } : {};
  const styleNode = themeStyle ? <style>{themeStyle}</style> : null;
  const brandNode = brand
    ? renderSlot(DefaultBrand, slots?.brand, { name: brand.name, logo: brand.logo }, slotProps?.brand)
    : null;

  if (showEnding) {
    const end = controller.ending;
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
        {styleNode}
        {page ? (
          <div
            ref={endingRef}
            {...themed}
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
          <div ref={endingRef} {...themed} className={cn("mx-auto w-full max-w-xl space-y-6", className)} data-testid={testID}>
            {brandNode}
            {endingNode}
          </div>
        )}
      </FormPresentationProvider>
    );
  }

  const pageFocus = page && layout === "focus";
  const pageClassic = page && layout === "classic";
  // Under the first question (focus layout) or the title (classic), until they move on.
  const notice =
    saveProgress && progressNotice && historyLength === 0 ? (
      <p className="text-sm text-muted-foreground" data-gf-progress-notice="">
        {progressNotice}
      </p>
    ) : null;

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
            {engine.text(contentText(block))}
          </h2>
        ) : (
          <p
            key={id}
            className={cn("rounded-sm text-muted-foreground", pageFocus && "text-lg sm:text-xl text-pretty", focusRing)}
            {...focusable}
          >
            {engine.text(contentText(block))}
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

  const { step, isLast } = controller;
  const errorItems: ErrorSummaryItem[] = controller.errorList.map((e) => ({ ...e, href: `#${idPrefix}-${e.id}` }));
  const currentField = pageFocus && current ? engine.field(current) : undefined;
  const keyHint = currentField ? (currentField.type === "long-text" ? `${modKey} + Enter` : "Enter ↵") : undefined;

  const hasRequired = def.blocks.some((b) => b.kind === "field" && b.required === true);
  const header = renderSlot(
    DefaultHeader,
    slots?.header,
    {
      title: def.title,
      description,
      image: theme?.headerImage ? { src: theme.headerImage, alt: theme.headerImageAlt ?? "" } : undefined,
      requiredNote: hasRequired && requiredLabel ? requiredLabel : undefined,
    },
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
    // No questions on the path: no "Question 1 of 0".
    layout === "focus" && path.length > 0
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
            pageFocus && (controller.direction === "back" ? "starting:-translate-y-6" : "starting:translate-y-6"),
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
      canGoBack: controller.canGoBack,
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
    ...themed,
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
      {styleNode}
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
              {notice ? <div className="mt-4">{notice}</div> : null}
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
            {notice}
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
          {layout === "classic" ? notice : null}
          {errorSummary}
          {progress}
          {fields}
          {layout === "focus" ? notice : null}
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
