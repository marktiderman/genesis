/**
 * @feat:chat
 * Scheduled send on native. `ChatScheduleSheet`: tomorrow 9 AM, Monday 9 AM, or a date and time
 * you pick (genesis-ui-native's NativeDatePicker and NativeTimePicker, which draw
 * @react-native-community/datetimepicker, or @expo/ui's picker passed as GenesisNativeApp's
 * `modules.datePicker`; without either the time reads as text and the quick picks still work).
 * `ChatScheduledList`: your messages waiting to go, each with Cancel. `ChatScheduledBar`: "2
 * scheduled messages" over the composer, opening that list. The thread opens the sheet when Send
 * is touched and held. The same rules as the web's `ChatScheduleMenu` and `ChatScheduledList`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import {
  NativeButton,
  NativeDatePicker,
  NativeEmptyState,
  NativeIcon,
  NativeListItem,
  NativeSheet,
  NativeSkeleton,
  NativeText,
  NativeTimePicker,
  useToast,
} from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { isSchedulable, scheduleLabel, scheduleQuickPicks } from "../core/extras";
import { previewText } from "../core/thread";
import type { ScheduleInput, ScheduledMessage } from "../core/types";
import { useScheduled } from "../react/index";
import { toSend, type ComposerState } from "./composer-state";
import { haptic } from "./modules";
import type { ChatComposerHandle } from "./use-composer";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { displayBody } from "./message-bubble";

/** An hour from now, on the next five minutes: where the custom picker starts. */
export function defaultScheduleAt(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + 60 * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  return d;
}

/** `base` on the day of `day` (its time kept). */
export function withDay(base: Date, day: Date): Date {
  const d = new Date(base);
  d.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return d;
}

/** `base` at the time of `time` (its day kept). */
export function withTime(base: Date, time: Date): Date {
  const d = new Date(base);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}

/**
 * What the composer holds, as a message to schedule, or why it can't be: nothing to send, or
 * files (a native file is a URI, and `useScheduled` uploads bytes only).
 */
export function scheduleInputFrom(
  state: ComposerState,
  opts: { conversationId: string; topic?: string | null; at: Date },
): { input: Omit<ScheduleInput, "clientId"> } | { error: "empty" | "files" } {
  const { input, files } = toSend(state);
  if (files.length) return { error: "files" };
  if (!input.body) return { error: "empty" };
  return { input: { conversationId: opts.conversationId, body: input.body, mentions: input.mentions, replyToId: input.replyToId, topic: opts.topic ?? null, sendAt: opts.at } };
}

/**
 * Scheduled send from a thread's composer: `request` (Send held) checks there's text and no
 * files and opens the sheet; `scheduleAt` schedules what's written, then empties the composer
 * if it still holds just that. Pass `enabled: false` where scheduling isn't offered.
 */
export function useScheduleSend(opts: { conversationId: string; topic?: string | null; composer: ChatComposerHandle; enabled: boolean }) {
  const { copy, modules } = useChatNative();
  const toast = useToast();
  const { schedule } = useScheduled(opts.conversationId, { enabled: opts.enabled });
  const [open, setOpen] = useState(false);
  const latest = useRef(opts);
  latest.current = opts;

  const request = useCallback(() => {
    const check = scheduleInputFrom(latest.current.composer.state, { conversationId: latest.current.conversationId, at: new Date() });
    if ("error" in check) {
      if (check.error === "files") toast.show({ title: copy.scheduleNoFiles, variant: "destructive" });
      return;
    }
    haptic(modules.haptics, "select");
    setOpen(true);
  }, [toast, copy.scheduleNoFiles, modules.haptics]);

  const scheduleAt = useCallback(
    async (at: Date) => {
      const { composer, conversationId, topic } = latest.current;
      const made = scheduleInputFrom(composer.state, { conversationId, topic, at });
      if ("error" in made) return;
      try {
        await schedule(made.input);
        // More may have been typed while it saved: only what was scheduled is cleared.
        const now = latest.current.composer;
        if (now.state.text.trim() === made.input.body) now.take();
        haptic(modules.haptics, "send");
        toast.show({ title: fill(copy.scheduledFor, { when: scheduleLabel(at) }), variant: "success", duration: 2000 });
      } catch (e) {
        haptic(modules.haptics, "error");
        toast.show({ title: e instanceof Error && e.message ? e.message : copy.scheduleFailed, variant: "destructive" });
      }
    },
    [schedule, modules.haptics, toast, copy.scheduledFor, copy.scheduleFailed],
  );

  return { open, setOpen, request, scheduleAt };
}

export interface ChatScheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The time chosen; the sheet closes first. */
  onSchedule: (at: Date) => void;
  /** For tests and demos. */
  now?: Date;
  testID?: string;
}

export function ChatScheduleSheet({ open, onOpenChange, onSchedule, now, testID = "chat-schedule" }: ChatScheduleSheetProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const clock = now ?? new Date();
  const picks = useMemo(() => scheduleQuickPicks(now ?? new Date()), [now, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [custom, setCustom] = useState(false);
  const [at, setAt] = useState(() => defaultScheduleAt(clock));
  // Each opening starts again: the quick picks, and an hour from now for a custom time.
  useEffect(() => {
    if (!open) return;
    setCustom(false);
    setAt(defaultScheduleAt(now ?? new Date()));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = isSchedulable(at, clock);

  const choose = (when: Date) => {
    onOpenChange(false);
    setCustom(false);
    onSchedule(when);
  };

  return (
    <NativeSheet
      open={open}
      onOpenChange={onOpenChange}
      testID={testID}
    >
      <View style={{ paddingVertical: 8 }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 4 }}>
          <NativeText preset="h4" accessibilityRole="header">
            {copy.scheduleTitle}
          </NativeText>
          <NativeText preset="caption" style={{ color: colors.secondaryLabel }}>
            {copy.scheduleHint}
          </NativeText>
        </View>
        {custom ? (
          <View style={{ paddingHorizontal: 16, gap: 12 }} testID={`${testID}-custom`}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
              <NativeText preset="body">{copy.scheduleDate}</NativeText>
              <NativeDatePicker testID={`${testID}-date`} value={at} onChange={(d) => setAt((x) => withDay(x, d))} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
              <NativeText preset="body">{copy.scheduleTime}</NativeText>
              <NativeTimePicker testID={`${testID}-time`} value={at} onChange={(d) => setAt((x) => withTime(x, d))} />
            </View>
            <NativeText testID={`${testID}-when`} preset="caption" accessibilityLiveRegion="polite" style={{ color: ok ? colors.secondaryLabel : colors.destructive }}>
              {ok ? scheduleLabel(at, clock) : copy.scheduleOutOfRange}
            </NativeText>
            <NativeButton testID={`${testID}-confirm`} onPress={() => ok && choose(at)} disabled={!ok}>
              {copy.scheduleConfirm}
            </NativeButton>
          </View>
        ) : (
          <View>
            {picks.map((p, i) => (
              <NativeListItem key={p.label} testID={`${testID}-pick-${i}`} title={p.label} leading={<NativeIcon name="clock" />} onPress={() => choose(p.at)} />
            ))}
            <NativeListItem testID={`${testID}-pick-custom`} title={copy.schedulePick} leading={<NativeIcon name="calendar" />} showChevron onPress={() => setCustom(true)} />
          </View>
        )}
      </View>
    </NativeSheet>
  );
}

export interface ChatScheduledListProps {
  /** One conversation's; all of yours without it. */
  conversationId?: string | null;
  /** Names a conversation in the all-conversations list. */
  conversationTitle?: (conversationId: string) => string;
  testID?: string;
}

/** Your scheduled messages, soonest first, each with when it goes and Cancel. */
export function ChatScheduledList({ conversationId, conversationTitle, testID = "chat-scheduled" }: ChatScheduledListProps) {
  const { copy } = useChatNative();
  const toast = useToast();
  const { items, isLoading, cancel } = useScheduled(conversationId);
  if (isLoading) {
    return (
      <View testID={`${testID}-loading`} style={{ padding: 16, gap: 8 }}>
        <NativeSkeleton height={44} className="w-full" />
        <NativeSkeleton height={44} className="w-full" />
      </View>
    );
  }
  if (items.length === 0) return <NativeEmptyState variant="first-run" title={copy.scheduledEmpty} body={copy.scheduledEmptyBody} testID={`${testID}-empty`} />;
  return (
    <View testID={testID} accessibilityLabel={copy.scheduledTitle}>
      {items.map((s) => (
        <ScheduledRow
          key={s.id}
          item={s}
          where={!conversationId && conversationTitle ? conversationTitle(s.conversationId) : null}
          onCancel={() =>
            void cancel(s.id).then(
              () => toast.show({ title: copy.scheduledCancelled, variant: "success", duration: 1500 }),
              () => toast.show({ title: copy.actionFailed, variant: "destructive" }),
            )
          }
          testID={`${testID}-item-${s.id}`}
        />
      ))}
    </View>
  );
}

function ScheduledRow({ item, where, onCancel, testID }: { item: ScheduledMessage; where: string | null; onCancel: () => void; testID: string }) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const failed = item.status === "failed";
  const when = failed ? copy.scheduledCouldntSend : scheduleLabel(item.sendAt);
  const text = previewText(displayBody(item.body), item.attachments[0]?.kind ?? null);
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 4, paddingVertical: 8, minHeight: 56 }}>
      <NativeIcon name={failed ? "warning" : "clock"} size={18} color={failed ? colors.destructive : colors.secondaryLabel} />
      <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={[when, where, text, item.error].filter(Boolean).join(", ")}>
        <NativeText preset="caption" style={{ color: failed ? colors.destructive : colors.secondaryLabel, fontWeight: "600" }}>
          {where ? `${when} · ${where}` : when}
        </NativeText>
        <NativeText preset="body-sm" numberOfLines={2}>
          {text}
        </NativeText>
        {item.error ? (
          <NativeText preset="caption" style={{ color: colors.destructive }}>
            {item.error}
          </NativeText>
        ) : null}
      </View>
      {item.status === "scheduled" || failed ? (
        // A failed one can't be sent again, but it can be removed (cancel_scheduled takes it).
        <Pressable
          testID={`${testID}-cancel`}
          accessibilityRole="button"
          accessibilityLabel={failed ? `${copy.scheduledRemove}, ${text}` : `${copy.scheduledCancel}, ${fill(copy.scheduledFor, { when })}`}
          onPress={onCancel}
          style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}
        >
          <NativeText preset="label" style={{ color: colors.destructive }}>
            {failed ? copy.scheduledRemove : copy.scheduledCancel}
          </NativeText>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface ChatScheduledBarProps {
  conversationId: string;
  testID?: string;
}

/** "2 scheduled messages" over the composer when there are any, opening their list. */
export function ChatScheduledBar({ conversationId, testID = "chat-scheduled-bar" }: ChatScheduledBarProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const { items } = useScheduled(conversationId);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const label = items.length === 1 ? copy.scheduledCountOne : fill(copy.scheduledCount, { count: items.length });
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 16, backgroundColor: colors.groupedBackground }}
      >
        <NativeIcon name="clock" size={15} color={colors.secondaryLabel} />
        <NativeText preset="caption" style={{ color: colors.secondaryLabel, fontWeight: "600" }}>
          {label}
        </NativeText>
      </Pressable>
      <NativeSheet open={open} onOpenChange={setOpen} testID={`${testID}-sheet`}>
        <View style={{ paddingVertical: 8 }}>
          <NativeText preset="h4" accessibilityRole="header" style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
            {copy.scheduledTitle}
          </NativeText>
          <ChatScheduledList conversationId={conversationId} testID={`${testID}-list`} />
        </View>
      </NativeSheet>
    </>
  );
}
