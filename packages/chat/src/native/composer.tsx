/**
 * @feat:chat
 * The composer: a field that grows with its text, photos and videos from the
 * library or camera and a pasted picture (attached as thumbnails), what the
 * message replies to, Send with a haptic, and, with expo-audio, the mic: hold
 * to record, slide left to cancel, slide up to lock and record hands-free.
 * With `onRecordVideo`, a camera button opens the video recorder. When the
 * person can't post, it says why instead of taking input.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, TextInput, View } from "react-native";
import { NativeIcon, NativeImage, NativeListItem, NativeSheet, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { CHAT_LIMITS, formatDuration, recordingLimitMs } from "../core/media";
import type { LocalFile } from "../core/outbox";
import type { ChatRole } from "../core/types";
import { canSend, fileFromDataUri, filesFromAssets, toSend } from "./composer-state";
import { fill } from "./copy";
import { useChatNative } from "./context";
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
  /** Opens the video recorder (`ChatVideoRecorder`); with it, a camera button sits beside attach. */
  onRecordVideo?: () => void;
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

function ComposerBody({ composer, canPost, onSend, signalTyping, onRecordVideo, voice, testID = "chat-composer" }: ChatComposerProps & { voice: Voice | null }) {
  const { modules, copy } = useChatNative();
  const colors = useThemeRoles();
  const { state, dispatch } = composer;
  const [attachOpen, setAttachOpen] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const ready = canPost === true;
  const sendable = canSend(state, ready);
  const recording = voice && voice.state.phase !== "idle";
  const voiceNotice = voice?.state.phase === "idle" ? voice.state.notice : null;
  const notice =
    state.notice ??
    (voiceNotice === "denied" ? copy.micDenied : voiceNotice === "too-short" ? copy.tooShort : voiceNotice === "error" ? copy.recordingFailed : voiceNotice === "interrupted" ? copy.recordingInterrupted : null);

  const send = () => {
    if (!sendable) return;
    const payload = composer.take();
    if (!payload) return;
    haptic(modules.haptics, "send");
    onSend(payload);
  };

  const openAttach = async () => {
    let paste = false;
    try {
      paste = Boolean(await modules.clipboard?.hasImageAsync?.());
    } catch {
      paste = false;
    }
    setCanPaste(paste);
    // One source: straight to the picker, no sheet in between.
    if (!paste && !modules.imagePicker?.launchCameraAsync && modules.imagePicker) return pick("library", false);
    setAttachOpen(true);
  };

  const remaining = CHAT_LIMITS.attachmentsPerMessage - state.attachments.length;
  // The picker opens once the sheet has gone: iOS won't present one modal while another is dismissing.
  const afterSheet = () => new Promise<void>((resolve) => setTimeout(resolve, 800));
  const pick = async (from: "library" | "camera", fromSheet = true) => {
    setAttachOpen(false);
    const picker = modules.imagePicker;
    if (!picker) return;
    if (fromSheet) await afterSheet();
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
    setAttachOpen(false);
    try {
      const image = await modules.clipboard?.getImageAsync?.({ format: "png" });
      const attachment = image ? fileFromDataUri(image.data, image.size) : null;
      if (attachment) dispatch({ type: "add", attachments: [attachment], tooMany: fill(copy.tooMany, { count: CHAT_LIMITS.attachmentsPerMessage }) });
    } catch {
      haptic(modules.haptics, "error");
    }
  };

  return (
    <View testID={testID} style={{ backgroundColor: colors.groupedBackground, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6, gap: 6 }}>
      {notice ? (
        <NativeText testID={`${testID}-notice`} accessibilityLiveRegion="polite" preset="caption" style={{ color: colors.destructive, paddingHorizontal: 8 }}>
          {notice}
        </NativeText>
      ) : null}
      {state.replyTo ? (
        <View testID={`${testID}-reply`} style={{ flexDirection: "row", alignItems: "center", paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.tint, marginHorizontal: 4 }}>
          <View style={{ flex: 1 }}>
            <NativeText preset="caption" style={{ color: colors.tint, fontWeight: "600" }}>
              {fill(copy.replyingTo, { name: state.replyTo.name })}
            </NativeText>
            <NativeText preset="caption" numberOfLines={1} style={{ color: colors.secondaryLabel }}>
              {state.replyTo.preview}
            </NativeText>
          </View>
          <IconButton testID={`${testID}-reply-cancel`} icon="close" label={copy.cancelReply} onPress={() => composer.setReply(null)} color={colors.secondaryLabel} />
        </View>
      ) : null}
      {state.attachments.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={`${testID}-attachments`} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
          {state.attachments.map((a) => (
            <View key={a.key} testID={`${testID}-attachment-${a.key}`} style={{ width: 64, height: 64 }}>
              {a.file.previewUrl && (a.file.meta?.kind ?? "image") === "image" ? (
                <NativeImage src={a.file.previewUrl} width={64} height={64} className="rounded-xl" alt={a.file.name} />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.fill, alignItems: "center", justifyContent: "center" }}>
                  <NativeIcon name={a.file.contentType.startsWith("video/") ? "play" : "file"} size={22} />
                </View>
              )}
              <Pressable
                testID={`${testID}-attachment-${a.key}-remove`}
                accessibilityRole="button"
                accessibilityLabel={fill(copy.removeAttachment, { name: a.file.name })}
                onPress={() => dispatch({ type: "remove", key: a.key })}
                hitSlop={12}
                style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.label, alignItems: "center", justifyContent: "center" }}
              >
                <NativeIcon name="close" size={14} color={colors.surface} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
        {recording && voice ? (
          <RecordingBar voice={voice} testID={testID} />
        ) : (
          <>
            {modules.imagePicker || modules.clipboard?.getImageAsync ? (
              <IconButton testID={`${testID}-attach`} icon="plus" label={copy.attach} onPress={() => void openAttach()} color={colors.tint} disabled={!ready} />
            ) : null}
            {onRecordVideo ? (
              <IconButton testID={`${testID}-video`} icon="video" label={copy.recordVideo} onPress={onRecordVideo} color={colors.tint} disabled={!ready} />
            ) : null}
            <TextInput
              testID={`${testID}-input`}
              value={state.text}
              onChangeText={(text) => {
                dispatch({ type: "text", text });
                if (text) signalTyping?.();
              }}
              placeholder={copy.placeholder}
              placeholderTextColor={colors.tertiaryLabel as string}
              accessibilityLabel={copy.placeholder}
              editable={ready}
              multiline
              maxLength={CHAT_LIMITS.bodyChars}
              style={{
                flex: 1,
                minHeight: 40,
                maxHeight: 140,
                paddingHorizontal: 14,
                paddingTop: 10,
                paddingBottom: 10,
                borderRadius: 20,
                fontSize: 17,
                color: colors.label as string,
                backgroundColor: colors.surface,
              }}
            />
          </>
        )}
        {sendable && !recording ? (
          <IconButton testID={`${testID}-send`} icon="arrow-up" label={copy.send} onPress={send} filled color={colors.tint} />
        ) : voice ? (
          <MicButton voice={voice} testID={testID} disabled={!ready} />
        ) : (
          <IconButton testID={`${testID}-send`} icon="arrow-up" label={copy.send} onPress={send} filled color={colors.tint} disabled />
        )}
      </View>
      <NativeSheet open={attachOpen} onOpenChange={setAttachOpen} testID={`${testID}-attach-sheet`}>
        <View>
          {modules.imagePicker ? (
            <NativeListItem testID={`${testID}-attach-library`} title={copy.attachLibrary} leading={<NativeIcon name="image" />} onPress={() => void pick("library")} />
          ) : null}
          {modules.imagePicker?.launchCameraAsync ? (
            <NativeListItem testID={`${testID}-attach-camera`} title={copy.attachCamera} leading={<NativeIcon name="camera" />} onPress={() => void pick("camera")} />
          ) : null}
          {canPaste ? (
            <NativeListItem testID={`${testID}-attach-paste`} title={copy.attachPaste} leading={<NativeIcon name="copy" />} onPress={() => void paste()} />
          ) : null}
        </View>
      </NativeSheet>
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  color,
  filled = false,
  disabled = false,
  testID,
}: {
  icon: "plus" | "arrow-up" | "close" | "trash" | "mic" | "video";
  label: string;
  onPress: () => void;
  color: unknown;
  filled?: boolean;
  disabled?: boolean;
  testID: string;
}) {
  const colors = useThemeRoles();
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
      {filled ? (
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color as string, alignItems: "center", justifyContent: "center" }}>
          <NativeIcon name={icon} size={18} color={colors.surface} weight="semibold" />
        </View>
      ) : (
        <NativeIcon name={icon} size={24} color={color as string} />
      )}
    </Pressable>
  );
}

/**
 * Hold to record. While held, the finger's movement slides to cancel or up to lock; locked, the
 * same button stops and sends. It stays one view throughout: swapping in another button while
 * the finger that locked is still down left the touch with a responder that no longer existed,
 * and the next tap anywhere on the screen did nothing.
 */
function MicButton({ voice, disabled, testID }: { voice: Voice; disabled: boolean; testID: string }) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const { state, dispatch } = voice;
  const latest = useRef(dispatch);
  latest.current = dispatch;
  const locked = state.phase === "recording" && state.locked;
  const lockedNow = useRef(locked);
  lockedNow.current = locked;
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
        if (!tapToSend) latest.current({ type: "move", dx: g.dx, dy: g.dy });
      },
      onPanResponderRelease: () => latest.current({ type: tapToSend ? "send" : "release" }),
      onPanResponderTerminate: () => {
        if (!tapToSend) latest.current({ type: "cancel" });
      },
    });
  }, []);

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
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1, transform: [{ scale: holding ? 1.25 : 1 }] }}
        {...(disabled ? {} : responder.panHandlers)}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: locked ? colors.tint : holding ? colors.destructive : "transparent" }}>
          <NativeIcon name={locked ? "arrow-up" : "mic"} size={locked || holding ? 18 : 24} color={locked || holding ? colors.surface : colors.tint} weight={locked ? "semibold" : undefined} />
        </View>
      </View>
    </View>
  );
}

/** While recording: the time, the live waveform, and slide-to-cancel (or, locked, Delete). */
function RecordingBar({ voice, testID }: { voice: Voice; testID: string }) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
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
