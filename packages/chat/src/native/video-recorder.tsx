/**
 * @feat:chat
 * Async video messages, recorded in the thread: a full-screen camera (expo-camera, passed as
 * `modules.camera`), one button to tap or hold, the time against the role's limit, flip
 * between takes, and close to throw a take away. Stopping sends: the recording is handed to
 * `onRecorded`, which the thread screen sends (`videoUploads`). Asks for the camera and the
 * microphone when it opens; refused, it says how to turn them on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Linking, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeButton, NativeIcon, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { formatDuration } from "../core/media";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { MEDIA_BACKDROP, MEDIA_SCRIM, ON_MEDIA } from "./media-colors";
import { haptic, type CameraViewHandleLike, type ExpoCameraLike } from "./modules";
import type { RecordedVideo } from "./video-upload";
import { initialVideoRecorder, recordingType, videoRecorderStep, type VideoRecorderEffect, type VideoRecorderEvent, type VideoRecorderState } from "./video-recorder-state";

export interface ChatVideoRecorderProps {
  open: boolean;
  onClose: () => void;
  /** The role's limit (`recordingLimitMs(role)`). */
  limitMs: number;
  /** A take began: the moment to mint the upload, so the bytes can go as soon as it stops. */
  onStart?: () => void;
  /** About every second while recording (to tell the others: `signalRecordingVideo`). */
  onTick?: () => void;
  onRecorded: (video: RecordedVideo) => void;
  /** For tests: the clock. */
  now?: () => number;
  testID?: string;
}

/** Renders nothing without `modules.camera`. */
export function ChatVideoRecorder(props: ChatVideoRecorderProps) {
  const { modules } = useChatNative();
  const camera = modules.camera;
  if (!camera) return null;
  const testID = props.testID ?? "chat-video-recorder";
  return (
    <Modal visible={props.open} animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onClose} testID={testID}>
      {props.open ? <RecorderBody {...props} camera={camera} testID={testID} /> : null}
    </Modal>
  );
}

function RecorderBody({ camera, onClose, limitMs, onStart, onTick, onRecorded, now = Date.now, testID }: ChatVideoRecorderProps & { camera: ExpoCameraLike; testID: string }) {
  const { copy, modules } = useChatNative();
  // The app's insets, as padding: a SafeAreaView inside the full-screen Modal measured none on
  // iOS 27, which put Close and the timer under the status bar (the photo viewer does the same).
  const insets = useSafeAreaInsets();
  const colors = useThemeRoles();
  const [state, setState] = useState<VideoRecorderState>(() => initialVideoRecorder());
  const stateRef = useRef(state);
  const cameraRef = useRef<CameraViewHandleLike | null>(null);
  const alive = useRef(true);
  const latest = useRef({ onClose, onStart, onTick, onRecorded, limitMs, now });
  latest.current = { onClose, onStart, onTick, onRecorded, limitMs, now };

  const dispatch = useCallback(
    (event: VideoRecorderEvent) => {
      if (!alive.current) return;
      const step = videoRecorderStep(stateRef.current, event, { limitMs: latest.current.limitMs });
      stateRef.current = step.state;
      setState(step.state);
      step.effects.forEach(run);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function run(effect: VideoRecorderEffect) {
    const l = latest.current;
    switch (effect.type) {
      case "start": {
        l.onStart?.();
        const cam = cameraRef.current;
        if (!cam) return dispatch({ type: "recorded", at: l.now(), uri: null });
        cam
          .recordAsync({ maxDuration: Math.ceil(l.limitMs / 1000) })
          .then((r) => dispatch({ type: "recorded", at: latest.current.now(), uri: r?.uri ?? null }))
          .catch(() => dispatch({ type: "recorded", at: latest.current.now(), uri: null }));
        return;
      }
      case "stop":
        try {
          cameraRef.current?.stopRecording();
        } catch {
          dispatch({ type: "recorded", at: l.now(), uri: null });
        }
        return;
      case "send": {
        const { contentType, ext } = recordingType(effect.uri);
        l.onRecorded({ uri: effect.uri, durationMs: effect.durationMs, contentType, name: `video-${Math.round(l.now())}.${ext}` });
        return;
      }
      case "close":
        l.onClose();
        return;
      case "haptic":
        haptic(modules.haptics, effect.event);
        return;
    }
  }

  // Camera and microphone, asked for when the recorder opens.
  useEffect(() => {
    alive.current = true;
    void Promise.all([camera.Camera.requestCameraPermissionsAsync(), camera.Camera.requestMicrophonePermissionsAsync()])
      .then(([cam, mic]) => dispatch({ type: "permissions", granted: Boolean(cam?.granted && mic?.granted) }))
      .catch(() => dispatch({ type: "permissions", granted: false }));
    return () => {
      // Closed mid-take (Android back, the app's navigation): the take is thrown away.
      if (stateRef.current.phase === "recording" || stateRef.current.phase === "stopping") {
        try {
          cameraRef.current?.stopRecording();
        } catch {
          // Already stopped.
        }
      }
      alive.current = false;
    };
  }, [camera, dispatch]);

  // The timer, and the others told about once a second.
  const recording = state.phase === "recording";
  useEffect(() => {
    if (!recording) return;
    let ticks = 0;
    const id = setInterval(() => {
      dispatch({ type: "tick", at: latest.current.now() });
      if (ticks++ % 4 === 0) latest.current.onTick?.();
    }, 250);
    return () => clearInterval(id);
  }, [recording, dispatch]);

  // The preview says when it's ready (at open, after a flip, after Try again); a camera that never
  // says so gets the button anyway after a moment, and a take that can't record says that.
  const starting = state.phase === "starting";
  useEffect(() => {
    if (!starting) return;
    const id = setTimeout(() => dispatch({ type: "camera-ready" }), 1500);
    return () => clearTimeout(id);
  }, [starting, state.facing, state.cameraKey, dispatch]);

  // Said out loud on iOS too (a live region is Android only).
  const noticeText = state.notice === "too-short" ? copy.videoTooShort : state.notice === "take-failed" ? copy.videoTakeFailed : null;
  const blockedText = state.phase === "denied" ? copy.cameraDenied : state.phase === "failed" ? copy.cameraFailed : null;
  useEffect(() => {
    const text = noticeText ?? blockedText;
    if (text) AccessibilityInfo?.announceForAccessibility?.(text);
  }, [noticeText, blockedText]);

  const { CameraView } = camera;
    const blocked = state.phase === "denied" || state.phase === "failed";
  const canRecord = state.phase === "ready" || recording;
  const stopping = state.phase === "stopping";

  return (
    <View testID={`${testID}-body`} style={{ flex: 1, backgroundColor: MEDIA_BACKDROP }}>
      {state.phase !== "asking" && state.phase !== "denied" ? (
        <CameraView
          key={state.cameraKey}
          ref={cameraRef}
          testID={`${testID}-camera`}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          facing={state.facing}
          mode="video"
          videoQuality="720p"
          onCameraReady={() => dispatch({ type: "camera-ready" })}
          onMountError={() => dispatch({ type: "camera-failed" })}
        />
      ) : null}
      <View style={{ flex: 1, justifyContent: "space-between", paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingTop: 4 }}>
          <Pressable
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel={copy.closeRecorder}
            onPress={() => dispatch({ type: "cancel" })}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <NativeIcon name="close" size={24} color={ON_MEDIA} />
          </Pressable>
          {canRecord || stopping ? (
            <View
              testID={`${testID}-time`}
              accessible
              accessibilityLabel={fill(copy.videoElapsed, { elapsed: formatDuration(state.elapsedMs), limit: formatDuration(limitMs) })}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: MEDIA_SCRIM }}
            >
              {recording ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.destructive }} /> : null}
              <NativeText style={{ color: ON_MEDIA, fontVariant: ["tabular-nums"], fontSize: 15 }}>
                {fill(copy.videoElapsed, { elapsed: formatDuration(state.elapsedMs), limit: formatDuration(limitMs) })}
              </NativeText>
            </View>
          ) : null}
          <View style={{ width: 44 }} />
        </View>

        {blocked ? (
          <View testID={`${testID}-${state.phase}`} accessibilityLiveRegion="polite" style={{ paddingHorizontal: 32, gap: 16, alignItems: "center" }}>
            <NativeIcon name="camera" size={40} color={ON_MEDIA} />
            <NativeText style={{ color: ON_MEDIA, textAlign: "center", fontSize: 17 }}>{state.phase === "denied" ? copy.cameraDenied : copy.cameraFailed}</NativeText>
            {state.phase === "denied" ? (
              <NativeButton testID={`${testID}-settings`} variant="secondary" onPress={() => void Linking?.openSettings?.()}>
                {copy.openSettings}
              </NativeButton>
            ) : (
              <NativeButton testID={`${testID}-retry`} variant="secondary" onPress={() => dispatch({ type: "retry" })}>
                {copy.tryAgain}
              </NativeButton>
            )}
          </View>
        ) : null}

        <View style={{ paddingBottom: 16, gap: 12, alignItems: "center" }}>
          {state.notice ? (
            <NativeText testID={`${testID}-notice`} accessibilityLiveRegion="polite" style={{ color: ON_MEDIA, textAlign: "center", paddingHorizontal: 24 }}>
              {noticeText}
            </NativeText>
          ) : null}
          {!blocked ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%" }}>
              <View style={{ flex: 1 }} />
              <Pressable
                testID={`${testID}-record`}
                accessibilityRole="button"
                accessibilityLabel={recording ? copy.stopVideo : copy.startVideo}
                accessibilityHint={recording ? undefined : copy.recordVideoHint}
                accessibilityState={{ disabled: !canRecord, busy: stopping }}
                // A screen reader's double tap is a tap: it starts hands-free, and the next one stops.
                accessibilityActions={canRecord ? [{ name: "activate" }] : []}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName !== "activate") return;
                  const at = latest.current.now();
                  dispatch({ type: "press", at });
                  dispatch({ type: "release", at });
                }}
                disabled={!canRecord}
                onPressIn={() => dispatch({ type: "press", at: latest.current.now() })}
                onPressOut={() => dispatch({ type: "release", at: latest.current.now() })}
                style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: ON_MEDIA, alignItems: "center", justifyContent: "center", opacity: canRecord ? 1 : 0.5 }}
              >
                <View style={recording ? { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.destructive } : { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.destructive }} />
              </Pressable>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Pressable
                  testID={`${testID}-flip`}
                  accessibilityRole="button"
                  accessibilityLabel={copy.flipCamera}
                  accessibilityState={{ disabled: recording || stopping }}
                  disabled={recording || stopping}
                  onPress={() => dispatch({ type: "flip" })}
                  style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: MEDIA_SCRIM, opacity: recording || stopping ? 0.4 : 1 }}
                >
                  <NativeIcon name="camera-flip" size={24} color={ON_MEDIA} />
                </Pressable>
              </View>
            </View>
          ) : null}
          {!blocked && !recording ? (
            <NativeText preset="caption" style={{ color: ON_MEDIA, opacity: 0.85, textAlign: "center", paddingHorizontal: 24 }}>
              {copy.recordVideoHint}
            </NativeText>
          ) : null}
        </View>
      </View>
    </View>
  );
}
