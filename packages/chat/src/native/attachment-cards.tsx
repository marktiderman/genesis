/**
 * @feat:chat
 * Cards for the app's own attachment kinds (`ChatProvider attachmentKinds`: a form to fill, a
 * check-in to answer): an icon, the title and subtitle the kind gives, and one button. The
 * button runs the kind's `onPress`; else the app's `onOpenAttachment` (open the form in the
 * app's own screen); else its `href`, when it is https. The bubble offers the same button as
 * a VoiceOver action (`cardAction`), since an accessible bubble hides what is inside it.
 *
 * The kind's `title`, `subtitle` and `action` get a second argument, `{ mine }` (`ChatCardContext`):
 * true on the sender's own card, so a kind can drop its button there (you don't answer your own
 * check-in). Previews (the inbox, the long-press sheet, a reply's quote) name a card by its kind's
 * `label`, else its title, not "Attachment".
 *
 * For more than a card (a task with a checkbox, a worksheet with its progress) the app draws its
 * kinds itself through the `attachment` slot (`ChatThreadScreen slots`, `MessageBubble
 * attachmentSlot`), the native twin of the web slot: the same props (`attachment`, `message`,
 * `url`, `mine`) plus the kind, its action, `run` for the app's own actions with `pending` and
 * `error`, and `fallback` (the card it would have been). A slot that throws shows the fallback.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { NativeButton, NativeIcon, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { reportError } from "@marktiderman/genesis-core/errors";
import type { ChatAttachment, ChatMessage } from "../core/types";
import type { ChatAttachmentKind, ChatCardContext } from "../react/index";
import { attachmentPreview, callAttachmentKind as call, cardTitle, messagePreview } from "../react/previews";

export type { ChatCardContext };
export { attachmentPreview, cardTitle, messagePreview };
import { ChatErrorBoundary } from "../react/error-boundary";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { ON_TINT_FILL, ON_TINT_FILL_STRONG } from "./media-colors";

export type OpenAttachment = (attachment: ChatAttachment, message: ChatMessage) => void;

/** The kinds the package draws itself; every other kind is the app's. */
export const BUILT_IN_KINDS: ReadonlySet<string> = new Set(["image", "voice", "video", "file", "link"]);

/** The app's registered kind for this attachment kind (own keys only, never `constructor` and the like). */
export function attachmentKindOf(kinds: Record<string, ChatAttachmentKind> | undefined, kind: string): ChatAttachmentKind | undefined {
  return kinds && Object.prototype.hasOwnProperty.call(kinds, kind) ? kinds[kind] : undefined;
}

/**
 * A message's attachments split into the app's cards and the rest (photos, voice, video, files).
 * A card is a registered kind; with `slot` (the app draws its kinds) also any kind the package
 * doesn't draw itself, as on the web.
 */
export function splitCardAttachments<T extends { kind: string }>(attachments: readonly T[], kinds: Record<string, ChatAttachmentKind> | undefined, slot = false): { cards: T[]; rest: T[] } {
  if (!kinds && !slot) return { cards: [], rest: [...attachments] };
  const cards: T[] = [];
  const rest: T[] = [];
  for (const a of attachments) (attachmentKindOf(kinds, a.kind) || (slot && !BUILT_IN_KINDS.has(a.kind)) ? cards : rest).push(a);
  return { cards, rest };
}

/**
 * A link a card may open by itself: https only. A kind's href is often built from what another
 * person sent, so any other scheme (tel:, sms:, another app's links) goes through the app's own
 * `onOpenAttachment` or the kind's `onPress` instead.
 */
export function isOpenableHref(href: string | null | undefined): href is string {
  if (!href) return false;
  try {
    const u = new URL(href);
    return u.protocol === "https:" && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** What a card does: the kind's own handler, else the app's, else an https href; null without a button. */
export function cardAction(
  kind: ChatAttachmentKind | undefined,
  attachment: ChatAttachment,
  message: ChatMessage,
  onOpenAttachment?: OpenAttachment,
  ctx: ChatCardContext = { mine: false },
): { label: string; run: () => void } | null {
  let action: ReturnType<NonNullable<ChatAttachmentKind["action"]>> = null;
  try {
    action = call(kind, "action", attachment, ctx);
  } catch {
    return null;
  }
  if (!action?.label) return null;
  const href = isOpenableHref(action.href) ? action.href : null;
  const onPress = action.onPress;
  const run = onPress ? onPress : onOpenAttachment ? () => onOpenAttachment(attachment, message) : href ? () => void Linking.openURL(href).catch(() => undefined) : null;
  return run ? { label: action.label, run } : null;
}

/** Where one card's app action stands: running, or failed with a short message. */
export interface CardRunState {
  pending: boolean;
  error: string | null;
}

const IDLE: CardRunState = { pending: false, error: null };

/** How long a card's action may run before it reads as failed (`useCardRuns`, `cardActionTimeoutMs`). */
export const CARD_ACTION_TIMEOUT_MS = 30_000;

export interface CardRunOptions {
  /** The error once an action threw or rejected (copy `cardActionFailed`). */
  failedText: string;
  /** The error once an action ran longer than `timeoutMs` (copy `cardActionTimedOut`). */
  timedOutText?: string;
  /** Milliseconds before a running action reads as failed; 30 s by default, 0 for never. */
  timeoutMs?: number;
}

/**
 * Runs the app's actions for a message's cards (tick a task, answer a check-in) and keeps each
 * card's state by attachment id: `pending` until the action settles, then `error` (the copy's
 * `cardActionFailed`) if it threw or rejected. Only a promise makes a card busy; a second run
 * while one is pending is ignored. One that hasn't settled after `timeoutMs` (30 s) stops being
 * busy and reads as failed (`cardActionTimedOut`); what it settles to later is ignored.
 */
export function useCardRuns(options: CardRunOptions | string): { stateOf(id: string): CardRunState; run(id: string, task: () => unknown): Promise<void> } {
  const { failedText, timedOutText = failedText, timeoutMs = CARD_ACTION_TIMEOUT_MS } = typeof options === "string" ? { failedText: options } : options;
  const [states, setStates] = useState<Record<string, CardRunState>>({});
  const busy = useRef(new Set<string>());
  const run = useCallback(
    async (id: string, task: () => unknown) => {
      if (busy.current.has(id)) return;
      const failed = (e: unknown, text = failedText) => {
        reportError(e, "chat:attachment-action");
        setStates((s) => ({ ...s, [id]: { pending: false, error: text } }));
      };
      let result: unknown;
      try {
        result = task();
      } catch (e) {
        failed(e);
        return;
      }
      // Only an action that returns a promise is busy; a plain handler is done when it returns.
      if (!result || typeof (result as PromiseLike<unknown>).then !== "function") {
        setStates((s) => (s[id] ? { ...s, [id]: IDLE } : s));
        return;
      }
      busy.current.add(id);
      setStates((s) => ({ ...s, [id]: { pending: true, error: null } }));
      const TIMED_OUT = Symbol("timed out");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = timeoutMs > 0 ? new Promise<typeof TIMED_OUT>((resolve) => (timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs))) : null;
      try {
        const settled = await (limit ? Promise.race([result as PromiseLike<unknown>, limit]) : result);
        if (settled === TIMED_OUT) {
          failed(new Error(`timed out after ${timeoutMs} ms`), timedOutText);
          // Swallow what the abandoned action settles to.
          void Promise.resolve(result).catch(() => undefined);
        } else setStates((s) => ({ ...s, [id]: IDLE }));
      } catch (e) {
        failed(e);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        busy.current.delete(id);
      }
    },
    [failedText, timedOutText, timeoutMs],
  );
  const stateOf = useCallback((id: string) => states[id] ?? IDLE, [states]);
  return { stateOf, run };
}

/**
 * What the `attachment` slot gets: the web slot's props (`attachment`, `message`, `url`, `mine`)
 * and what a native card needs besides. The bubble is one VoiceOver element, so a control drawn
 * here (a checkbox) is reached through the kind's `action`, which the bubble offers as its own
 * action: give the kind one, and call `action.run` from the control so both stay the same.
 */
export interface ChatAttachmentSlotProps {
  attachment: ChatAttachment;
  message: ChatMessage;
  /**
   * Its signed URL when it has a file (else its `url`), only when it is http(s): the attachment's
   * `url` is whatever the sender put there, so any other scheme (javascript:, file:) is null.
   */
  url: string | null;
  /** On a message you sent (drawn on the tint). */
  mine: boolean;
  /** The app's kind for it (`ChatProvider attachmentKinds`), when registered. */
  kind: ChatAttachmentKind | undefined;
  /** The kind's `action`, ready to call: it runs through `run`, so `pending` and `error` follow it. Null without one. */
  action: { label: string; run: () => void } | null;
  /** Runs an app action (tick a task): `pending` until it settles, `error` if it throws or rejects. */
  run(task: () => unknown): void;
  pending: boolean;
  /** A short message once an action failed; cleared by the next run. */
  error: string | null;
  /** The card the package would draw: return it for kinds the slot doesn't draw. */
  fallback: ReactElement;
  testID: string;
}

/**
 * Draws the app's own attachment kinds; `null` hides the kinds that aren't registered. A slot that
 * returns null draws nothing for that attachment (a bubble left with nothing is not shown).
 */
export type ChatAttachmentSlot = ComponentType<ChatAttachmentSlotProps>;

/** A URL a slot may be given: http or https only, else null. */
export function slotUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname ? url : null;
  } catch {
    return null;
  }
}

export interface ChatAttachmentCardProps {
  attachment: ChatAttachment;
  message: ChatMessage;
  /** The app's kind; without one the card shows the attachment's name (or kind) and no button. */
  kind?: ChatAttachmentKind;
  mine?: boolean;
  onOpenAttachment?: OpenAttachment;
  /** Runs the button's action (the bubble passes its own, for busy and error state); calls it straight away by default. */
  run?: (task: () => unknown) => void;
  /** Busy while the action runs; the error under the card once it failed. */
  state?: CardRunState;
  testID?: string;
}

export function ChatAttachmentCard({ attachment, message, kind, mine = false, onOpenAttachment, run, state = IDLE, testID = "chat-attachment-card" }: ChatAttachmentCardProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  let title = "";
  let subtitle: string | null | undefined = null;
  const ctx: ChatCardContext = { mine };
  try {
    title = call(kind, "title", attachment, ctx) ?? "";
    subtitle = call(kind, "subtitle", attachment, ctx);
  } catch (e) {
    // An app's kind that throws shows as a plain card, and is reported (the kind is the app's name for it, not content).
    reportError(e, { source: "chat:attachment-kind", tags: { kind: attachment.kind } });
  }
  title = title || attachment.name || attachment.kind;
  const action = cardAction(kind, attachment, message, onOpenAttachment, ctx);
  const fg = mine ? "text-primary-foreground" : undefined;
  return (
    <View testID={testID} style={{ gap: 4, minWidth: 220 }}>
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, backgroundColor: mine ? ON_TINT_FILL : colors.groupedBackground }}
    >
      <View
        accessible
        accessibilityLabel={subtitle ? fill(copy.attachmentCard, { title, subtitle }) : title}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: mine ? ON_TINT_FILL_STRONG : colors.fill }}>
          <NativeIcon name="file" size={20} color={mine ? colors.surface : colors.tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <NativeText numberOfLines={1} className={fg} style={mine ? { fontWeight: "600", fontSize: 15 } : { fontWeight: "600", fontSize: 15, color: colors.label }}>
            {title}
          </NativeText>
          {subtitle ? (
            <NativeText preset="caption" numberOfLines={1} className={fg} style={mine ? { opacity: 0.85 } : { color: colors.secondaryLabel }}>
              {subtitle}
            </NativeText>
          ) : null}
        </View>
      </View>
      {action ? (
        <NativeButton
          testID={`${testID}-action`}
          variant={mine ? "secondary" : "default"}
          className="h-11"
          loading={state.pending}
          onPress={() => (run ? run(action.run) : action.run())}
        >
          {action.label}
        </NativeButton>
      ) : null}
    </View>
      {state.error ? <CardError text={state.error} mine={mine} testID={`${testID}-error`} /> : null}
    </View>
  );
}

/** The line under a card whose action failed. */
export function CardError({ text, mine, testID }: { text: string; mine: boolean; testID?: string }) {
  const colors = useThemeRoles();
  return (
    <NativeText testID={testID} preset="caption" accessibilityLiveRegion="polite" className={mine ? "text-primary-foreground" : undefined} style={mine ? { paddingHorizontal: 4 } : { paddingHorizontal: 4, color: colors.destructive }}>
      {text}
    </NativeText>
  );
}

export interface AppAttachmentProps {
  attachment: ChatAttachment;
  message: ChatMessage;
  kind: ChatAttachmentKind | undefined;
  url: string | null;
  mine: boolean;
  /** The app's slot: a component draws it, `null` hides an unregistered kind, undefined draws the card. */
  slot?: ChatAttachmentSlot | null;
  /** Told whether it drew nothing (the slot returned null, or hid the kind), so the bubble can leave it out. */
  onEmpty?: (id: string, empty: boolean) => void;
  onOpenAttachment?: OpenAttachment;
  run: (task: () => unknown) => void;
  state: CardRunState;
  testID: string;
}

/** One app attachment in a bubble: through the app's slot when there is one, else the card. */
export function AppAttachment({ attachment, message, kind, url, mine, slot, onOpenAttachment, onEmpty, run, state, testID }: AppAttachmentProps) {
  const hidden = slot === null && !kind;
  useLayoutEffect(() => {
    if (slot === null || slot === undefined) onEmpty?.(attachment.id, hidden);
  }, [slot, hidden, attachment.id, onEmpty]);
  const fallback = <ChatAttachmentCard attachment={attachment} message={message} kind={kind} mine={mine} onOpenAttachment={onOpenAttachment} run={run} state={state} testID={testID} />;
  if (slot === undefined) return fallback;
  if (slot === null) return hidden ? null : fallback;
  const found = cardAction(kind, attachment, message, onOpenAttachment, { mine });
  const action = found ? { label: found.label, run: () => run(found.run) } : null;
  const props: ChatAttachmentSlotProps = { attachment, message, url: slotUrl(url), mine, kind, action, run, pending: state.pending, error: state.error, fallback, testID };
  // The slot draws sender-controlled data: if it throws, the card stands in until what it draws changes.
  return (
    <ChatErrorBoundary fallback={<Reported id={attachment.id} empty={false} onEmpty={onEmpty}>{fallback}</Reported>} resetKeys={[attachment, message, kind, slot]}>
      <SlotProbe key={slotKey(slot)} slot={slot} props={props} onEmpty={onEmpty} />
    </ChatErrorBoundary>
  );
}

const slotKeys = new WeakMap<object, number>();
let nextSlotKey = 0;
/** A stable key per slot component, so a new slot starts a new probe (its hooks start over). */
function slotKey(slot: ChatAttachmentSlot): number {
  let k = slotKeys.get(slot);
  if (k === undefined) slotKeys.set(slot, (k = ++nextSlotKey));
  return k;
}

/** A component React lets us call as a function (not a class, not a memo or forwardRef object). */
function isPlainFunction(slot: ChatAttachmentSlot): slot is (props: ChatAttachmentSlotProps) => ReactNode {
  return typeof slot === "function" && !(slot.prototype as { isReactComponent?: unknown } | undefined)?.isReactComponent;
}

/**
 * Draws the slot and tells the bubble when it drew nothing. A plain function slot is called here,
 * so its hooks are this component's (always the same slot: the probe is keyed on it); a
 * class or memo slot renders as an element and counts as drawn.
 */
function SlotProbe({ slot, props, onEmpty }: { slot: ChatAttachmentSlot; props: ChatAttachmentSlotProps; onEmpty?: (id: string, empty: boolean) => void }) {
  const Slot = slot;
  const out: ReactNode = isPlainFunction(slot) ? slot(props) : <Slot {...props} />;
  const empty = out === null || out === undefined || out === false;
  return (
    <Reported id={props.attachment.id} empty={empty} onEmpty={onEmpty}>
      {empty ? null : out}
    </Reported>
  );
}

function Reported({ id, empty, onEmpty, children }: { id: string; empty: boolean; onEmpty?: (id: string, empty: boolean) => void; children: ReactNode }) {
  useLayoutEffect(() => {
    onEmpty?.(id, empty);
  }, [id, empty, onEmpty]);
  return <>{children}</>;
}

