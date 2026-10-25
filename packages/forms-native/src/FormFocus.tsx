/**
 * `<FormFocus>`: a form one question (or content step) per screen, on React Native, driven by
 * genesis-forms-react's `useFormController`, so it steps, validates, sends and announces exactly
 * as the web's `<Form>` does in focus layout. A flow (onboarding, a check-in, a guided exercise) is
 * a form definition shown here.
 */
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { CreateFormOptions, FormDefinition, FormEngine, FormProgress, FormState, HostOptions, Json, LinkParams } from "@marktiderman/genesis-forms";
import {
  formEngineOptions,
  FormRuntime,
  useForm,
  useFormController,
  type FocusTarget,
  type RendererRegistry,
} from "@marktiderman/genesis-forms-react";
import { useReducedMotion } from "@marktiderman/genesis-ui-native/hooks";
import { composeHeaderOptions, useKeyboardScroll } from "@marktiderman/genesis-ui-native/layouts";
import { ContentStep, defaultContentRegistry, type ContentRendererRegistry } from "./content";
import {
  accessibilityFocus,
  createPendingUploads,
  FormNativeContext,
  useFocusTargets,
  type FormHaptics,
  type FormNativeContextValue,
  type PhotoHost,
} from "./context";
import { defaultRegistry, NativeFieldRenderer } from "./renderers";
import { submissionStatus, type FormDraftLike, type OutboxItemLike, type OutboxLike, type SubmissionStatus } from "./seams";
import {
  DefaultBrand,
  DefaultEnding,
  DefaultErrorSummary,
  DefaultHeader,
  DefaultNavigation,
  DefaultNotice,
  DefaultProgress,
  DefaultStatus,
  renderSlot,
  type FormSlotProps,
  type FormSlots,
  type NoticeSlotProps,
} from "./slots";
import { useFormStyles } from "./styles";
import { FormThemeProvider, type FormThemeInput } from "./theme";

/** Said when the respondent tries to move on or send while a photo is still uploading. */
export const UPLOAD_WAIT_MESSAGE = "Wait for the photo to finish uploading.";

/** A platform header screen, such as expo-router's `Stack.Screen`: `<FormFocus screen={Stack.Screen}>`. */
export type HeaderScreen = ComponentType<{ options: Record<string, unknown> }>;

export interface FormFocusProps {
  /** A `defineForm` result or a canonical definition. Unused with `engine` or `draft`. */
  form?: FormDefinition | { definition: FormDefinition } | undefined;
  /** Bring your own engine (from `useForm`), to read its state outside the form. */
  engine?: FormEngine | undefined;
  /**
   * A draft on the device (`useFormDraft` from genesis-forms-react): its engine is used, with the
   * saved answers put back; the draft is flushed when the app goes to the background and cleared
   * once the submission is safe (queued, or `onSubmit` resolved). While it is read, a loading
   * screen shows.
   */
  draft?: FormDraftLike | undefined;
  /** Engine options, read when the response starts. Unused with `engine` or `draft`: pass them to `useForm` or `useFormDraft`. */
  options?: CreateFormOptions | undefined;
  /**
   * Option lists this app supplies, by key, for `optionsFrom: { source: "host", key }` questions.
   * Unused with `engine` or `draft`: pass them to `useForm` or `useFormDraft`.
   */
  hostOptions?: HostOptions | undefined;
  /**
   * The parameters of the link the form was opened with: questions with `props.prefill` take
   * them. Unused with `engine` or `draft`: pass them to `useForm` or `useFormDraft`.
   */
  linkParams?: LinkParams | undefined;
  /** Field renderers. Default `defaultRegistry`; `defaultRegistry.extend([...])` adds kinds. */
  registry?: RendererRegistry | undefined;
  /** Content-step renderers. Default `defaultContentRegistry`. */
  contentRegistry?: ContentRendererRegistry | undefined;
  /** The colors: a brand `tint`, or any theme role. Default: the device's (system colors on iOS). */
  theme?: FormThemeInput | undefined;
  /** An organisation's name and logo, shown small above every step and the ending. */
  brand?: { name: string; logo?: ReactNode } | undefined;
  /**
   * Send the answers. The ending shows once it resolves; if it rejects, the answers stay (read
   * only), with "Try again". Unused with `outbox`.
   */
  onSubmit?: ((engine: FormEngine) => void | Promise<void>) | undefined;
  /**
   * Queue the answers on the device instead (`createSubmitOutbox` from genesis-forms): the
   * ending shows as soon as the submission is stored, with its status, and it is sent when the
   * device is online. If storing fails, the answers stay with "Try again".
   */
  outbox?: OutboxLike | undefined;
  /** The form id the outbox sends under. Default the definition's id. */
  formId?: string | undefined;
  /** The app's details kept beside a queued submission (never sent), such as the form's title. */
  submissionMeta?: Record<string, Json> | undefined;
  /** Makes the submission's idempotency key (expo-crypto's `randomUUID`). Default `crypto.randomUUID`, else a random v4-shaped id (`randomKey`). */
  createKey?: (() => string) | undefined;
  /** Called once a submission is queued. */
  onQueued?: ((item: OutboxItemLike, engine: FormEngine) => void) | undefined;
  onChange?: ((state: FormState, engine: FormEngine) => void) | undefined;
  /** With `settings.saveProgress`: called after each step, and at once when the app goes to the background. */
  onProgress?: ((engine: FormEngine, progress: FormProgress) => void | Promise<void>) | undefined;
  /** Move on after a single pick (one choice, a rating, yes or no). Never from the last question. Default true. */
  autoAdvance?: boolean | undefined;
  /** Where `photo` answers come from and are stored. */
  photos?: PhotoHost | undefined;
  /** Taps and outcomes to make felt (expo-haptics). */
  haptics?: FormHaptics | undefined;
  /**
   * The platform header: pass expo-router's `Stack.Screen` (or any component taking `options`)
   * and the form's title goes in the native navigation bar. Without it the title is drawn above
   * the first step.
   */
  screen?: HeaderScreen | undefined;
  /** Merged into the header's options (`headerLargeTitle`, `headerBackTitle`, …). */
  headerOptions?: Record<string, unknown> | undefined;
  /** The main button on the last step. Default "Send". */
  submitLabel?: string | undefined;
  /** The main button on other steps. Default "Next". */
  nextLabel?: string | undefined;
  backLabel?: string | undefined;
  /** The main button after a failed send. Default "Try again". */
  retryLabel?: string | undefined;
  /** The note shown with the first step when a question is required. `null` hides it. Default "Required". */
  requiredLabel?: string | null | undefined;
  /** The note under the first step while answers save as they go. `null` hides it. */
  progressNotice?: string | null | undefined;
  slots?: FormSlots | undefined;
  slotProps?: FormSlotProps | undefined;
  /**
   * The root's testID, and the prefix of every part's: `<testID>-<question key>` for a field,
   * `<testID>-next`, `-back`, `-progress`, `-ending`, `-status`, `-notice`, `-error-summary`.
   * Default "form".
   */
  testID?: string | undefined;
}

export function FormFocus(props: FormFocusProps) {
  if (props.engine) return <FormWithEngine {...props} engine={props.engine} />;
  if (props.draft) return <DraftForm {...props} draft={props.draft} />;
  return <OwnedForm {...props} />;
}

function OwnedForm(props: FormFocusProps) {
  if (!props.form) throw new Error("<FormFocus> needs a `form`, an `engine` or a `draft`.");
  const engine = useForm(props.form, formEngineOptions(props.options, { hostOptions: props.hostOptions, linkParams: props.linkParams }));
  return <FormWithEngine {...props} engine={engine} />;
}

function DraftForm(props: FormFocusProps & { draft: FormDraftLike }) {
  if (props.draft.engine) return <FormWithEngine {...props} engine={props.draft.engine} />;
  return (
    <FormThemeProvider theme={props.theme}>
      <Loading testID={props.testID ?? "form"} />
    </FormThemeProvider>
  );
}

function Loading({ testID }: { testID: string }) {
  const s = useFormStyles();
  return (
    <View style={[s.screen, s.loading]} testID={`${testID}-loading`} accessibilityLabel="Loading the form" accessible>
      <Text style={s.hint}>Loading…</Text>
    </View>
  );
}

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

function FormWithEngine(props: FormFocusProps & { engine: FormEngine }) {
  return (
    <FormThemeProvider theme={props.theme}>
      <FormRuntime engine={props.engine} registry={props.registry ?? defaultRegistry}>
        <FormBody key={keyOf(props.engine)} {...props} />
      </FormRuntime>
    </FormThemeProvider>
  );
}

const DRAFT_NOTICES: Partial<Record<FormDraftLike["draft"], { kind: NoticeSlotProps["kind"]; message: string }>> = {
  restored: { kind: "restored", message: "We kept your answers from last time." },
  discarded: { kind: "discarded", message: "This form changed since you started it, so it starts again." },
  error: { kind: "draftError", message: "Your saved answers couldn't be read, so the form starts empty." },
};

const STATUS_MESSAGES: Record<SubmissionStatus, string> = {
  waiting: "Saved on this device. Your answers send when you're back online.",
  sending: "Sending your answers…",
  sent: "Your answers were sent.",
  failed: "We couldn't send your answers. They're kept on this device.",
  discarded: "Your answers were removed from this device without being sent.",
};

/**
 * An idempotency key: `crypto.randomUUID` where there is one, else a random v4-shaped id (Hermes
 * has no `crypto` without a polyfill). Never none, so a retry always queues the same submission.
 */
export function randomKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** Said when a send (or storing it on the device) failed. */
export function failedMessage(queued: boolean, retryLabel: string): string {
  return queued
    ? `We couldn't save your answers on this device. Press ${retryLabel} to save them again.`
    : `We couldn't send your answers. They're kept here: press ${retryLabel} to send them again.`;
}

function FormBody(props: FormFocusProps & { engine: FormEngine }) {
  const {
    engine,
    draft,
    outbox,
    registry = defaultRegistry,
    contentRegistry = defaultContentRegistry,
    brand,
    autoAdvance = true,
    submitLabel = "Send",
    nextLabel = "Next",
    backLabel = "Back",
    retryLabel = "Try again",
    requiredLabel = "Required",
    progressNotice = "Your answers save as you go.",
    slots,
    slotProps,
    screen: Screen,
    headerOptions,
    testID = "form",
  } = props;
  const s = useFormStyles();
  const def = engine.definition;
  const haptics = props.haptics ?? {};
  const reducedMotion = useReducedMotion();
  const focusTargets = useFocusTargets();
  const [pending] = useState(createPendingUploads);
  const submitRef = useRef<ComponentRef<typeof View>>(null);
  const endingRef = useRef<unknown>(null);
  const summaryRef = useRef<unknown>(null);
  // The latest props, read when a submission runs.
  const latest = useRef(props);
  latest.current = props;
  const keyRef = useRef<string | undefined>(undefined);
  const [queued, setQueued] = useState<string | null>(null);
  // The submission once it is stored: a retry after that never queues it again.
  const queuedItem = useRef<OutboxItemLike | null>(null);

  const send = async (e: FormEngine) => {
    const p = latest.current;
    let item: OutboxItemLike | null = null;
    try {
      if (p.outbox) {
        if (!queuedItem.current) {
          // One key per response: "Try again" after a failed store queues the same submission.
          keyRef.current ??= p.createKey?.() ?? randomKey();
          const state = e.getState();
          queuedItem.current = await p.outbox.enqueue({
            formId: p.formId ?? def.id,
            submission: { events: state.events, ...(Object.keys(state.hidden).length ? { hidden: state.hidden as Record<string, Json> } : {}) },
            idempotencyKey: keyRef.current,
            meta: { title: def.title, ...p.submissionMeta },
          });
          item = queuedItem.current;
        }
        setQueued(queuedItem.current.id);
      } else {
        await p.onSubmit?.(e);
      }
    } catch (error) {
      haptics.error?.();
      throw error;
    }
    haptics.success?.();
    // The host's callback can't turn a stored submission into a failed send.
    if (item) {
      try {
        p.onQueued?.(item, e);
      } catch (error) {
        console.warn("[forms-native] onQueued threw.", error);
      }
    }
    // Only now is the submission safe; a draft that can't be removed is reported, not fatal.
    try {
      await p.draft?.clear();
    } catch (error) {
      console.warn("[forms-native] The draft couldn't be removed after sending.", error);
    }
  };

  const focus = (target: FocusTarget) => {
    if (target.kind === "step") {
      if (target.id) focusTargets.focusStep(target.id);
    } else if (target.kind === "ending") {
      setTimeout(() => accessibilityFocus(endingRef.current), 120);
    } else if (target.kind === "submit") {
      accessibilityFocus(submitRef.current);
    }
  };

  const controller = useFormController(engine, {
    layout: "focus",
    onSubmit: send,
    onChange: props.onChange,
    onProgress: props.onProgress,
    autoAdvance,
    waitFor: () => (pending.count() === 0 ? null : UPLOAD_WAIT_MESSAGE),
    focus,
  });
  const { current, path, phase, announcement, showEnding, locked } = controller;

  // A live announcement for a failed step or a wait: VoiceOver and TalkBack say it once.
  useEffect(() => {
    const message = announcement.trim();
    if (!message) return;
    AccessibilityInfo.announceForAccessibility(message);
    if (current && controller.errors[current]) haptics.error?.();
    // Only a new announcement speaks (a repeat gets a trailing space, so it is new).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement]);

  // A failed send is said, not only shown: iOS has no live alert role.
  useEffect(() => {
    if (phase === "failed") AccessibilityInfo.announceForAccessibility(failedMessage(!!outbox, retryLabel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Going to the background saves what is waiting: the draft and any progress save.
  const { flushProgress } = controller;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") return;
      flushProgress();
      void latest.current.draft?.flush().catch((error) => console.warn("[forms-native] The draft couldn't be saved.", error));
    });
    return () => sub.remove();
  }, [flushProgress]);

  // A send that finds several answers wanting (an earlier answer a filter cleared, say) moves to
  // the first. While any of them is off screen, the ones still wanting are listed, each a link
  // back to its question. Only a send's errors count: a step's own error left behind by Back
  // is not a reason for a summary.
  const [sendErrors, setSendErrors] = useState<readonly string[]>([]);
  useEffect(
    () =>
      engine.subscribe(() => {
        const state = engine.getState();
        if (state.status === "completed") setSendErrors([]);
        else if (state.events[state.events.length - 1]?.type === "submit") setSendErrors(Object.keys(state.errors));
      }),
    [engine],
  );
  const wanting = locked ? [] : controller.errorList.filter((e) => sendErrors.includes(e.id));
  const others = wanting.some((e) => e.id !== current) ? wanting : [];
  const othersKey = others.map((e) => e.id).join(",");
  useEffect(() => {
    if (!othersKey) return;
    const n = othersKey.split(",").length;
    AccessibilityInfo.announceForAccessibility(n === 1 ? "One answer needs attention." : `${n} answers need attention.`);
    const t = setTimeout(() => accessibilityFocus(summaryRef.current), 150);
    return () => clearTimeout(t);
  }, [othersKey]);
  const goTo = (id: string) => {
    const start = engine.getState();
    if (start.current === id) return;
    if (start.history.includes(id)) {
      // Back through the questions answered so far; answers survive Back.
      for (let i = 0; i < 1000; i++) {
        const state = engine.getState();
        if (state.current === id || state.history.length === 0) break;
        controller.back();
        if (engine.getState().current === state.current) break;
      }
      return;
    }
    // Later on the path: forward, through the controller's Next (so it waits for uploads and
    // slides the right way). It stops, and says why, at a question that still needs an answer:
    // the engine never skips one. The target is on the path, so this never reaches Send.
    for (let i = 0; i < 1000; i++) {
      const state = engine.getState();
      if (state.current === id) break;
      controller.advance();
      if (engine.getState().current === state.current) break;
    }
  };

  // The notice under the first step shown: a draft put back (or not), or answers saving.
  const firstStep = useRef(current);
  const draftNotice = draft ? DRAFT_NOTICES[draft.draft] : undefined;
  const notice =
    current === firstStep.current
      ? (draftNotice ?? (controller.saveProgress && progressNotice ? { kind: "saving" as const, message: progressNotice } : undefined))
      : undefined;

  // The step's entry: a short slide and fade in the direction it went, none with reduced motion.
  const enter = useRef(new Animated.Value(1)).current;
  // Before paint, so a new step never flashes fully shown first.
  useLayoutEffect(() => {
    if (reducedMotion) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [current, reducedMotion, enter]);
  const offset = controller.direction === "back" ? -16 : 16;
  const stepStyle = reducedMotion
    ? null
    : { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] };

  const context = useMemo<FormNativeContextValue>(
    () => ({
      focus: focusTargets,
      photos: props.photos ?? null,
      pending,
      haptics,
      submit: controller.submit,
      locked,
      submitLabel: controller.isLast ? submitLabel : nextLabel,
      isLast: controller.isLast,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusTargets, props.photos, pending, props.haptics, controller.submit, locked, controller.isLast, submitLabel, nextLabel],
  );

  const header = Screen ? <Screen options={composeHeaderOptions({ headerTitle: def.title, headerOptions })} /> : null;
  const brandNode = brand ? renderSlot(DefaultBrand, slots?.brand, { name: brand.name, logo: brand.logo }, slotProps?.brand) : null;

  const outboxStatus = useOutboxStatus(outbox, queued);

  if (showEnding) {
    const end = controller.ending;
    return (
      <FormNativeContext.Provider value={context}>
        {header}
        <Shell testID={testID} keyName="ending">
          {brandNode}
          <View style={s.endingColumn}>
          {renderSlot(
            DefaultEnding,
            slots?.ending,
            {
              title: engine.text(end?.title ?? "Thank you."),
              description: end?.description ? engine.text(end.description) : undefined,
              focusRef: (node: unknown) => {
                endingRef.current = node;
              },
              testID,
            },
            slotProps?.ending,
          )}
          {outboxStatus
            ? renderSlot(
                DefaultStatus,
                slots?.status,
                {
                  status: outboxStatus.status,
                  // The outbox's own words are for the app's log or its own slot, not the respondent.
                  message: STATUS_MESSAGES[outboxStatus.status],
                  detail: outboxStatus.error ?? undefined,
                  retryLabel,
                  onRetry:
                    outbox?.retry && queued
                      ? () => {
                          Promise.resolve(outbox.retry?.(queued)).catch((error) => console.warn("[forms-native] The retry couldn't start.", error));
                        }
                      : undefined,
                  testID: `${testID}-status`,
                },
                slotProps?.status,
              )
            : null}
          </View>
        </Shell>
      </FormNativeContext.Provider>
    );
  }

  const block = current ? engine.block(current) : undefined;
  const hasRequired = def.blocks.some((b) => b.kind === "field" && b.required === true);
  const first = controller.historyLength === 0;
  const step =
    block?.kind === "field" ? (
      <NativeFieldRenderer engine={engine} registry={registry} id={block.id} inputId={`${testID}-${block.key}`} onAdvance={controller.onAdvance} />
    ) : block?.kind === "content" ? (
      <ContentStep engine={engine} block={block} registry={contentRegistry} inputId={`${testID}-${block.id}`} />
    ) : null;

  return (
    <FormNativeContext.Provider value={context}>
      {header}
      <Shell testID={testID} keyName={current ?? ""}>
        {brandNode}
        {path.length > 0 ? renderSlot(DefaultProgress, slots?.progress, { step: controller.step, total: path.length, testID }, slotProps?.progress) : null}
        <View style={{ height: 20 }} />
        {first
          ? renderSlot(
              DefaultHeader,
              slots?.header,
              {
                title: def.title,
                showTitle: !Screen,
                description: controller.description,
                requiredNote: hasRequired && requiredLabel ? requiredLabel : undefined,
              },
              slotProps?.header,
            )
          : null}
        {others.length
          ? renderSlot(
              DefaultErrorSummary,
              slots?.errorSummary,
              {
                count: others.length,
                errors: others,
                onSelect: goTo,
                focusRef: (node: unknown) => {
                  summaryRef.current = node;
                },
                testID,
              },
              slotProps?.errorSummary,
            )
          : null}
        <Animated.View style={[s.step, stepStyle]} testID={`${testID}-step`}>
          {step}
        </Animated.View>
        {notice ? renderSlot(DefaultNotice, slots?.notice, { ...notice, testID }, slotProps?.notice) : null}
        {phase === "failed" ? (
          <Text style={s.error} accessibilityRole="alert" testID={`${testID}-failed`}>
            {failedMessage(!!outbox, retryLabel)}
          </Text>
        ) : null}
        {renderSlot(
          DefaultNavigation,
          slots?.navigation,
          {
            canGoBack: controller.canGoBack,
            isLast: controller.isLast || controller.status === "completed",
            busy: controller.busy,
            failed: controller.failed,
            onBack: controller.back,
            onNext: controller.submit,
            nextLabel,
            submitLabel,
            retryLabel,
            backLabel,
            submitRef,
            testID,
          },
          slotProps?.navigation,
        )}
      </Shell>
    </FormNativeContext.Provider>
  );
}

/** Where the queued submission stands, followed as the outbox changes; null without one. */
function useOutboxStatus(outbox: OutboxLike | undefined, id: string | null) {
  const subscribe = useCallback((listener: () => void) => (outbox ? outbox.subscribe(listener) : () => {}), [outbox]);
  const snapshot = useSyncExternalStore(subscribe, () => outbox?.getSnapshot() ?? null, () => outbox?.getSnapshot() ?? null);
  // The last status seen: a failed submission that leaves the outbox was discarded, not sent.
  const previous = useRef<SubmissionStatus | undefined>(undefined);
  const result = outbox && id && snapshot ? submissionStatus(snapshot, id, previous.current) : null;
  useEffect(() => {
    previous.current = result?.status;
  });
  return result;
}

/**
 * The scrolling screen: the app's keyboard-aware scroll view (`KeyboardScrollProvider`, as the
 * native app shell sets up) so the focused answer and the button under it stay above the
 * keyboard, else a ScrollView in a KeyboardAvoidingView. A new step starts at the top.
 */
function Shell({ children, testID, keyName }: { children: ReactNode; testID: string; keyName: string }) {
  const s = useFormStyles();
  const KeyboardScroll = useKeyboardScroll();
  const common = {
    testID: `${testID}-scroll`,
    keyboardShouldPersistTaps: "handled" as const,
    contentContainerStyle: s.scrollContent,
    contentInsetAdjustmentBehavior: "automatic" as const,
  };
  return (
    <View style={s.screen} testID={testID}>
      {KeyboardScroll ? (
        createElement(KeyboardScroll, { key: keyName, ...common, bottomOffset: 96 }, children)
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView key={keyName} {...common}>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
