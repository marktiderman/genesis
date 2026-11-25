/**
 * @feat:chat
 * The composer, as Messages draws it on iOS 26: a glass + circle, then a glass pill with
 * "Message" that grows with its text, the mic inside it while it's empty (hold to record, slide
 * left to cancel, slide up to lock and record hands-free) and a blue arrow once there's something
 * to send (touch and hold it to schedule, with `onSchedule`). + opens a glass list over the thread
 * with round colored icons: Camera, Photos, Audio, Video and Send Later as the app's modules and
 * the screen allow, Paste when there's a picture to paste, and the app's own (`plusItems`). What it
 * replies to sits over the pill, the photos it carries inside it. When the person can't post, it
 * says why instead of taking input. The + list is a slot (`slots.plusList`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, ScrollView, TextInput, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { renderSlot, type Slots } from "@marktiderman/genesis-core/slots";
import { NativeIcon, NativeImage, NativeText, useGenesisModules, type NativeIconName } from "@marktiderman/genesis-ui-native/components";
import { useReducedMotion, useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { CHAT_LIMITS, formatDuration, recordingLimitMs } from "../core/media";
import type { LocalFile } from "../core/outbox";
import type { ChatRole } from "../core/types";
import { canSend, fileFromDataUri, filesFromAssets, toSend } from "./composer-state";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { CHAT_METRICS, ChatAccentIcon, ChatGlassCircle, ChatGlassList, ChatGlassPanel, ChatSymbol, ChatTap, useChatColors, useChatFeel, useChatMotion } from "./messages-look";
import { haptic, type ExpoAudioLike } from "./modules";
import { liveBars } from "./recorder-machine";
import type { ChatComposerHandle } from "./use-composer";
import { useVoiceRecorder } from "./use-voice-recorder";

export interface ChatComposerProps {
  composer: ChatComposerHandle;
  /** null while it loads. */
  canPost: boolean | null;
  /** Why not, when `canPost` is false (`composerDisabledReason`). */
  disabledReason: string | null;
  role: ChatRole | null;
  onSend: (payload: ReturnType<typeof toSend>) => void;
  signalTyping?: () => void;
  signalRecording?: () => void;
  /** The signed-in person (`useChat().userId`), whose recent emoji the picker keeps. */
  userId?: string | null;
  /** Touch and hold Send (or VoiceOver's action on it) to schedule what's written (`ChatScheduleSheet`). */
  onSchedule?: () => void;
  /** The field's placeholder ("Message #Week 1" in a topic). */
  placeholder?: string;
  /** Opens the video recorder (`ChatVideoRecorder`): the + list's Video. */
  onRecordVideo?: () => void;
  /**
   * The + list: receives the defaults (Camera, Photos, Audio, Video and Send Later, as the app's
   * modules and the screen allow, and Paste when there's a picture to paste) and returns the list,
   * in order. Add, remove or reorder items.
   */
  plusItems?: (defaults: ChatPlusItem[]) => ChatPlusItem[];
  /** Replace a part (`plusList`), or drop it with `null`. */
  slots?: Slots<ChatComposerSlotMap>;
  testID?: string;
}

export function ChatComposer(props: ChatComposerProps) {
  const { modules } = useChatNative();
  if (props.canPost === false) return <DisabledComposer reason={props.disabledReason} testID={props.testID ?? "chat-composer"} />;
  return modules.audio ? <ComposerWithVoice {...props} audio={modules.audio} /> : <ComposerBody {...props} voice={null} />;
}

function DisabledComposer({ reason, testID }: { reason: string | null; testID: string }) {
  const colors = useThemeRoles();
  const { copy } = useChatNative();
  return (
    <View testID={`${testID}-disabled`} accessible accessibilityRole="text" style={{ padding: 16, alignItems: "center", backgroundColor: colors.groupedBackground }}>
      <NativeText preset="body-sm" style={{ color: colors.secondaryLabel, textAlign: "center" }}>
        {reason ?? copy.cantPost}
      </NativeText>
    </View>
  );
}

type Voice = ReturnType<typeof useVoiceRecorder>;

function ComposerWithVoice(props: ChatComposerProps & { audio: ExpoAudioLike }) {
  const { modules } = useChatNative();
  const { composer, role, onSend } = props;
  // What the note replies to is taken when recording starts: the composer may change before it lands.
  const replyAtStart = useRef<string | null>(null);
  const voice = useVoiceRecorder(props.audio, {
    limitMs: recordingLimitMs(role),
    haptics: modules.haptics,
    signalRecording: props.signalRecording,
    // A voice note goes on its own, with what it replied to when recording started.
    onRecorded: (file: LocalFile) => {
      const replyToId = replyAtStart.current;
      replyAtStart.current = null;
      onSend({ input: { body: "", replyToId, mentions: [] }, files: [file] });
      if (replyToId && composer.state.replyTo?.messageId === replyToId) composer.setReply(null);
    },
  });
  const phase = voice.state.phase;
  useEffect(() => {
    if (phase === "starting") replyAtStart.current = composer.state.replyTo?.messageId ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  return <ComposerBody {...props} voice={voice} />;
}

/** One item of the composer's + list. */
export interface ChatPlusItem {
  id: string;
  label: string;
  /** Genesis's icon, and the SF Symbol for it on iOS. */
  icon: NativeIconName;
  sf?: string;
  /** Its round icon's color: a chat accent (`useChatColors().accents`) or your own role. */
  color: ColorValue;
  onPress: () => void;
}

/** The parts of the composer `slots` reach. */
export type ChatComposerSlotMap = {
  /** The + list: the glass list over the thread. */
  plusList: { open: boolean; onClose: () => void; items: readonly ChatPlusItem[]; testID: string };
};

function ComposerBody({ composer, canPost, onSend, signalTyping, onRecordVideo, onSchedule, placeholder, voice, plusItems, slots, testID = "chat-composer" }: ChatComposerProps & { voice: Voice | null }) {
  const { modules, copy } = useChatNative();
  const c = useChatColors();
  const feel = useChatFeel();
  const m = useChatMotion();
  const genesis = useGenesisModules();
  const { state, dispatch } = composer;
  const [plusOpen, setPlusOpen] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const ready = canPost === true;
  const sendable = canSend(state, ready);
  const recording = Boolean(voice && voice.state.phase !== "idle");
  const voiceNotice = voice?.state.phase === "idle" ? voice.state.notice : null;
  const notice =
    state.notice ??
    (voiceNotice === "denied" ? copy.micDenied : voiceNotice === "too-short" ? copy.tooShort : voiceNotice === "error" ? copy.recordingFailed : voiceNotice === "interrupted" ? copy.recordingInterrupted : null);
  // Send rises in once there's something to send (a spring, or a fade under Reduce Motion).
  const pop = useRef(new Animated.Value(sendable ? 1 : 0)).current;
  useEffect(() => {
    (sendable ? m.settle(pop, 1, "bouncy") : m.fade(pop, 0)).start();
  }, [sendable, pop, m]);

  const send = () => {
    if (!sendable) return;
    const payload = composer.take();
    if (!payload) return;
    // The app's Genesis haptics, else chat's own module.
    if (genesis.haptics) feel.send();
    else haptic(modules.haptics, "send");
    onSend(payload);
  };

  const openPlus = async () => {
    let paste = false;
    try {
      paste = Boolean(await modules.clipboard?.hasImageAsync?.());
    } catch {
      paste = false;
    }
    setCanPaste(paste);
    // One item only (the library, say): straight to it, no list in between.
    const now = itemsFor(paste);
    if (now.length === 1) return now[0]!.onPress();
    setPlusOpen(true);
  };

  const remaining = CHAT_LIMITS.attachmentsPerMessage - state.attachments.length;
  // From the list, which runs this once its layer has gone (iOS won't present one modal while another is dismissing).
  const pick = async (from: "library" | "camera") => {
    const picker = modules.imagePicker;
    if (!picker) return;
    try {
      if (from === "camera") {
        const permission = await picker.requestCameraPermissionsAsync?.();
        if (permission && !permission.granted) return;
      }
      const result =
        from === "camera"
          ? await picker.launchCameraAsync?.({ mediaTypes: ["images", "videos"], quality: 0.8 })
          : await picker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: Math.max(1, remaining), quality: 0.8 });
      if (!result || result.canceled || !result.assets?.length) return;
      const { attachments, notice } = filesFromAssets(result.assets, copy);
      dispatch({ type: "add", attachments, notice, tooMany: fill(copy.tooMany, { count: CHAT_LIMITS.attachmentsPerMessage }) });
    } catch {
      haptic(modules.haptics, "error");
    }
  };

  const paste = async () => {
    try {
      const image = await modules.clipboard?.getImageAsync?.({ format: "png" });
      const attachment = image ? fileFromDataUri(image.data, image.size) : null;
      if (attachment) dispatch({ type: "add", attachments: [attachment], tooMany: fill(copy.tooMany, { count: CHAT_LIMITS.attachmentsPerMessage }) });
    } catch {
      haptic(modules.haptics, "error");
    }
  };

  // Audio from the + list records hands-free at once: press, then lock as soon as it's recording.
  const lockSoon = useRef(false);
  const startVoice = () => {
    if (!voice || voice.state.phase !== "idle") return;
    lockSoon.current = true;
    voice.dispatch({ type: "press" });
  };
  useEffect(() => {
    if (voice?.state.phase === "recording" && lockSoon.current) {
      lockSoon.current = false;
      voice.dispatch({ type: "move", dx: 0, dy: -10_000 });
    }
    if (voice?.state.phase === "idle") lockSoon.current = false;
  }, [voice?.state.phase, voice]);

  const itemsFor = (pasteable: boolean): ChatPlusItem[] => {
    const defaults: ChatPlusItem[] = [
    ...(modules.imagePicker?.launchCameraAsync ? [{ id: "camera", label: copy.camera, icon: "camera" as const, sf: "camera.fill", color: c.accents.camera, onPress: () => void pick("camera") }] : []),
    ...(modules.imagePicker ? [{ id: "photos", label: copy.photos, icon: "image" as const, sf: "photo.on.rectangle", color: c.accents.photos, onPress: () => void pick("library") }] : []),
    ...(voice ? [{ id: "audio", label: copy.audio, icon: "mic" as const, sf: "waveform", color: c.accents.audio, onPress: startVoice }] : []),
    ...(onRecordVideo ? [{ id: "video", label: copy.video, icon: "video" as const, sf: "video.fill", color: c.accents.video, onPress: onRecordVideo }] : []),
    ...(onSchedule ? [{ id: "send-later", label: copy.sendLater, icon: "clock" as const, sf: "clock.fill", color: c.accents.schedule, onPress: onSchedule }] : []),
    ...(pasteable ? [{ id: "paste", label: copy.attachPaste, icon: "copy" as const, sf: "doc.on.clipboard", color: c.accents.camera, onPress: () => void paste() }] : []),
    ];
    return plusItems ? plusItems(defaults) : defaults;
  };
  const items = itemsFor(canPaste);

  const above = (
    <>
      {notice ? (
        <NativeText testID={`${testID}-notice`} accessibilityLiveRegion="polite" preset="caption" style={{ color: c.destructive, paddingHorizontal: CHAT_METRICS.margin, paddingBottom: 4 }}>
          {notice}
        </NativeText>
      ) : null}
      {state.replyTo ? (
        <View testID={`${testID}-reply`} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: CHAT_METRICS.margin, paddingRight: 8, paddingBottom: 6 }}>
          <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: c.roles.sent }} />
          <View style={{ flex: 1 }}>
            <NativeText preset="caption" style={{ color: c.label, fontWeight: "600" }}>
              {fill(copy.replyingTo, { name: state.replyTo.name })}
            </NativeText>
            <NativeText preset="caption" numberOfLines={1} style={{ color: c.secondaryLabel }}>
              {state.replyTo.preview}
            </NativeText>
          </View>
          <IconButton testID={`${testID}-reply-cancel`} icon="close" label={copy.cancelReply} onPress={() => composer.setReply(null)} color={c.tertiaryLabel} />
        </View>
      ) : null}
    </>
  );

  return (
    <View testID={testID} style={{ paddingBottom: 6 }}>
      {above}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: CHAT_METRICS.margin, paddingTop: 4 }}>
        {items.length ? (
          <ChatGlassCircle size={CHAT_METRICS.composerButton} testID={`${testID}-attach`} label={copy.more} hint={copy.moreHint} disabled={!ready} onPress={() => void openPlus()}>
            <ChatSymbol icon="plus" sf="plus" size={19} weight="medium" color={c.label} />
          </ChatGlassCircle>
        ) : null}
        <View style={{ flex: 1 }}>
          <ChatGlassPanel radius={20}>
            {state.attachments.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={`${testID}-attachments`} contentContainerStyle={{ gap: 8, padding: 8 }}>
                {state.attachments.map((a) => (
                  <View key={a.key} testID={`${testID}-attachment-${a.key}`} style={{ width: 72, height: 72 }}>
                    {a.file.previewUrl && (a.file.meta?.kind ?? "image") === "image" ? (
                      <NativeImage src={a.file.previewUrl} width={72} height={72} className="rounded-xl" alt={a.file.name} />
                    ) : (
                      <View style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: c.roles.pressed, alignItems: "center", justifyContent: "center" }}>
                        <NativeIcon name={a.file.contentType.startsWith("video/") ? "play" : "file"} size={22} color={c.label} />
                      </View>
                    )}
                    <Pressable
                      testID={`${testID}-attachment-${a.key}-remove`}
                      accessibilityRole="button"
                      accessibilityLabel={fill(copy.removeAttachment, { name: a.file.name })}
                      onPress={() => dispatch({ type: "remove", key: a.key })}
                      hitSlop={10}
                      style={{ position: "absolute", top: 4, right: 4 }}
                    >
                      <ChatSymbol icon="close" sf="xmark.circle.fill" size={20} color={c.roles.onAccent} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", minHeight: CHAT_METRICS.composerButton, paddingLeft: recording ? 4 : 14, paddingRight: 5 }}>
              {recording && voice ? (
                <RecordingBar voice={voice} testID={testID} />
              ) : (
                <TextInput
                  testID={`${testID}-input`}
                  value={state.text}
                  onChangeText={(text) => {
                    dispatch({ type: "text", text });
                    if (text) signalTyping?.();
                  }}
                  editable={ready}
                  multiline
                  maxLength={CHAT_LIMITS.bodyChars}
                  placeholder={placeholder ?? copy.placeholder}
                  placeholderTextColor={c.secondaryLabel}
                  accessibilityLabel={placeholder ?? copy.placeholder}
                  accessibilityState={ready ? undefined : { disabled: true }}
                  style={{ flex: 1, fontSize: 17, lineHeight: 22, color: c.label, paddingTop: 9, paddingBottom: 9, maxHeight: 160, opacity: ready ? 1 : 0.6 }}
                />
              )}
              <View style={{ minWidth: CHAT_METRICS.sendButton + 2, height: CHAT_METRICS.composerButton, alignItems: "center", justifyContent: "center", marginLeft: 4 }}>
                {voice && !sendable ? (
                  <MicButton voice={voice} testID={testID} disabled={!ready} />
                ) : (
                  <Animated.View style={{ opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [m.reduced ? 1 : 0.4, 1] }) }] }}>
                    <ChatTap
                      testID={`${testID}-send`}
                      accessibilityRole="button"
                      accessibilityLabel={copy.send}
                      accessibilityState={{ disabled: !sendable }}
                      accessibilityHint={onSchedule ? copy.scheduleHoldHint : undefined}
                      accessibilityActions={onSchedule && sendable ? [{ name: "schedule", label: copy.schedule }] : undefined}
                      onAccessibilityAction={onSchedule ? (e) => e.nativeEvent.actionName === "schedule" && onSchedule() : undefined}
                      onLongPress={onSchedule && sendable ? onSchedule : undefined}
                      disabled={!sendable}
                      onPress={send}
                      hitSlop={8}
                      look={(pressed) => ({ width: CHAT_METRICS.sendButton, height: CHAT_METRICS.sendButton, borderRadius: CHAT_METRICS.sendButton / 2, backgroundColor: c.roles.sent, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
                    >
                      <ChatSymbol icon="arrow-up" sf="arrow.up" size={16} weight="bold" color={c.roles.onAccent} />
                    </ChatTap>
                  </Animated.View>
                )}
              </View>
            </View>
          </ChatGlassPanel>
        </View>
      </View>
      {renderSlot(ChatPlusList, slots?.plusList, { open: plusOpen, onClose: () => setPlusOpen(false), items, testID: `${testID}-plus` })}
    </View>
  );
}

/** The + list: rows with a round colored icon, in a glass list rising from the + button. */
export function ChatPlusList({ open, onClose, items, testID }: ChatComposerSlotMap["plusList"]) {
  const insets = useSafeAreaInsets();
  const { copy } = useChatNative();
  return (
    <ChatGlassList
      open={open}
      onClose={onClose}
      bottom={insets.bottom + 58}
      closeLabel={copy.closeMenu}
      testID={testID}
      items={items.map((i) => ({ id: i.id, label: i.label, leading: <ChatAccentIcon icon={i.icon} sf={i.sf} color={i.color} />, onPress: i.onPress }))}
    />
  );
}

function IconButton({
  icon,
  label,
  onPress,
  color,
  disabled = false,
  testID,
}: {
  icon: "plus" | "close" | "trash" | "video" | "smile";
  label: string;
  onPress: () => void;
  color: unknown;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
    >
      <NativeIcon name={icon} size={24} color={color as string} />
    </Pressable>
  );
}

/**
 * Hold to record. While held, the finger's movement slides to cancel or up to lock; locked, the
 * same button stops and sends. It stays one view throughout: swapping in another button while
 * the finger that locked is still down left the touch with a responder that no longer existed,
 * and the next tap anywhere on the screen did nothing.
 *
 * While held, the mic follows the finger (left toward cancel, up toward the lock) on the native
 * driver, and springs home when it lets go or locks; with Reduce Motion it goes home at once.
 */
export function micOffset(dx: number, dy: number): { x: number; y: number } {
  return { x: Math.max(-MIC_FOLLOW_X, Math.min(0, dx)), y: Math.max(-MIC_FOLLOW_Y, Math.min(0, dy)) };
}
const MIC_FOLLOW_X = 120;
const MIC_FOLLOW_Y = 72;

function MicButton({ voice, disabled, testID }: { voice: Voice; disabled: boolean; testID: string }) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const chat = useChatColors();
  const reducedMotion = useReducedMotion();
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;
  const followX = useRef(new Animated.Value(0)).current;
  const followY = useRef(new Animated.Value(0)).current;
  const home = useRef(() => {
    for (const v of [followX, followY]) {
      if (reduced.current) v.setValue(0);
      else Animated.spring(v, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    }
  }).current;
  const { state, dispatch } = voice;
  const latest = useRef(dispatch);
  latest.current = dispatch;
  const locked = state.phase === "recording" && state.locked;
  const lockedNow = useRef(locked);
  lockedNow.current = locked;
  // Locking, or the recording ending, sends the mic home.
  useEffect(() => {
    if (locked || state.phase === "idle") home();
  }, [locked, state.phase, home]);
  // VoiceOver and TalkBack can't hold and slide: a double tap starts a locked (hands-free) recording.
  const lockWhenReady = useRef(false);
  useEffect(() => {
    if (state.phase === "recording" && lockWhenReady.current) {
      lockWhenReady.current = false;
      dispatch({ type: "move", dx: 0, dy: -10_000 });
    }
    if (state.phase === "idle") lockWhenReady.current = false;
  }, [state.phase, dispatch]);

  const responder = useMemo(() => {
    // A touch that began on the locked button is a tap on Send, not a new hold.
    let tapToSend = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        tapToSend = lockedNow.current;
        if (!tapToSend) latest.current({ type: "press" });
      },
      onPanResponderMove: (_e, g) => {
        if (tapToSend) return;
        latest.current({ type: "move", dx: g.dx, dy: g.dy });
        if (!lockedNow.current) {
          const at = micOffset(g.dx, g.dy);
          followX.setValue(at.x);
          followY.setValue(at.y);
        }
      },
      onPanResponderRelease: () => {
        home();
        latest.current({ type: tapToSend ? "send" : "release" });
      },
      onPanResponderTerminate: () => {
        home();
        if (!tapToSend) latest.current({ type: "cancel" });
      },
    });
  }, [followX, followY, home]);

  const holding = !locked && (state.phase === "starting" || state.phase === "recording");
  return (
    <View style={{ alignItems: "center" }}>
      {holding ? (
        <View testID={`${testID}-lock-hint`} pointerEvents="none" style={{ position: "absolute", bottom: 52, width: 36, height: 56, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "flex-start", paddingTop: 8 }}>
          <NativeIcon name="lock" size={16} color={colors.secondaryLabel} />
          <NativeIcon name="chevron-up" size={14} color={colors.tertiaryLabel} />
        </View>
      ) : null}
      <View
        testID={locked ? `${testID}-voice-send` : `${testID}-mic`}
        accessible
        accessibilityRole="button"
        accessibilityLabel={locked ? copy.stopAndSend : copy.recordVoice}
        accessibilityHint={locked ? undefined : copy.recordHint}
        accessibilityState={{ disabled }}
        accessibilityActions={disabled ? [] : [{ name: "activate" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName !== "activate") return;
          if (locked) return dispatch({ type: "send" });
          if (state.phase !== "idle") return;
          lockWhenReady.current = true;
          dispatch({ type: "press" });
        }}
        style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1, transform: [{ scale: holding ? 1.25 : 1 }] }}
        {...(disabled ? {} : responder.panHandlers)}
      >
        <Animated.View
          testID={`${testID}-mic-follow`}
          style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: locked ? chat.roles.sent : holding ? colors.destructive : "transparent", transform: [{ translateX: followX }, { translateY: followY }] }}
        >
          <ChatSymbol icon={locked ? "arrow-up" : "mic"} sf={locked ? "arrow.up" : "mic"} size={locked || holding ? 16 : 19} color={locked || holding ? chat.roles.onAccent : colors.secondaryLabel} weight={locked ? "bold" : "regular"} />
        </Animated.View>
      </View>
    </View>
  );
}

/** While recording: the time, the live waveform, and slide-to-cancel (or, locked, Delete). */
function RecordingBar({ voice, testID }: { voice: Voice; testID: string }) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const chat = useChatColors();
  const { state, dispatch } = voice;
  const bars = liveBars(state.levels, 28);
  return (
    <View testID={`${testID}-recording`} accessibilityLiveRegion="polite" style={{ flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 }}>
      {state.locked ? (
        <IconButton testID={`${testID}-voice-cancel`} icon="trash" label={copy.cancelRecording} onPress={() => dispatch({ type: "cancel" })} color={colors.destructive} />
      ) : (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.destructive, marginLeft: 8 }} />
      )}
      <NativeText testID={`${testID}-recording-time`} style={{ fontVariant: ["tabular-nums"], color: colors.label, minWidth: 40 }}>
        {formatDuration(state.durationMs)}
      </NativeText>
      <View testID={`${testID}-recording-wave`} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 2, height: 28, overflow: "hidden" }}>
        {bars.map((h, i) => (
          <View key={i} style={{ width: 3, borderRadius: 1.5, height: Math.max(3, Math.round(h * 28)), backgroundColor: colors.destructive }} />
        ))}
      </View>
      {state.locked ? (
        <View accessible accessibilityLabel={copy.lockedHint}>
          <NativeIcon name="lock" size={16} color={colors.secondaryLabel} />
        </View>
      ) : (
        <NativeText preset="caption" style={{ color: state.cancelArmed ? colors.destructive : colors.secondaryLabel }}>
          {state.cancelArmed ? copy.releaseToCancel : copy.slideToCancel}
        </NativeText>
      )}
    </View>
  );
}
