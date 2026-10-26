/**
 * @feat:chat
 * A video in a bubble, on expo-video (`modules.video`): its poster (Mux's thumbnail, the
 * attachment's poster, or a plain frame) with the duration and a play button; tap to play,
 * then pause, mute, 1x / 1.5x / 2x and full screen. A Mux video streams as HLS from its
 * playback id; a stored one plays from its signed link (or, while it uploads, from the
 * phone). Until Mux has processed it, it says so. One plays at a time, voice notes included:
 * it takes the same playback slot (`claimPlayback`), so starting it pauses a voice note and
 * the other way round. The bubble's VoiceOver actions reach it by id (`toggleVideo`).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, View, useWindowDimensions } from "react-native";
import { NativeIcon, NativeImage, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { formatDuration, nextPlaybackRate } from "../core/media";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { MEDIA_FRAME, MEDIA_SCRIM, MEDIA_SCRIM_LIGHT, ON_MEDIA } from "./media-colors";
import type { ExpoVideoLike, VideoPlayerLike, VideoViewHandleLike } from "./modules";
import { claimPlayback, releasePlayback } from "./voice-player";

export const muxStreamUrl = (playbackId: string) => `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`;
export const muxPosterUrl = (playbackId: string, width = 480) => `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.jpg?width=${width}`;

export interface ChatVideoPlayerProps {
  /** Stable id (the attachment's), for one-at-a-time and the bubble's actions. */
  id: string;
  /** A stored video's signed link, or the file on the phone while it uploads. */
  uri: string | null;
  /** Mux's playback id: streamed as HLS. */
  playbackId?: string | null;
  /** The attachment's poster (a signed link). */
  posterUri?: string | null;
  provider?: string | null;
  status?: "pending" | "ready" | "failed" | null;
  durationMs: number | null;
  width?: number | null;
  height?: number | null;
  /** Still uploading from this phone. */
  uploading?: boolean;
  testID?: string;
}

export type ChatVideoState = "failed" | "processing" | "loading" | "playable";

/** What the player can show: a hosted video waits for its provider, a stored one for its link. */
export function videoState(p: Pick<ChatVideoPlayerProps, "uri" | "playbackId" | "provider" | "status">): ChatVideoState {
  if (p.status === "failed") return "failed";
  if (p.playbackId) return "playable";
  if (p.provider && p.provider !== "storage" && p.provider !== "external") return p.uri ? "playable" : "processing";
  return p.uri ? "playable" : "loading";
}

/** What expo-video loads: HLS for a playback id, else the file. */
export function videoSource(p: Pick<ChatVideoPlayerProps, "uri" | "playbackId">): { uri: string; contentType: "hls" | "auto" } | null {
  if (p.playbackId) return { uri: muxStreamUrl(p.playbackId), contentType: "hls" };
  return p.uri ? { uri: p.uri, contentType: "auto" } : null;
}

// ---- Controls by id, for the bubble's accessibility actions -----------------

interface VideoControls {
  toggle: () => void;
  fullScreen: () => void;
  mute: () => void;
  rate: () => void;
}
const controls = new Map<string, VideoControls[]>();
const playingIds = new Set<string>();
const playingListeners = new Set<() => void>();
const setPlayingId = (id: string, on: boolean) => {
  if (playingIds.has(id) === on) return;
  if (on) playingIds.add(id);
  else playingIds.delete(id);
  playingListeners.forEach((l) => l());
};
const subscribePlaying = (l: () => void) => {
  playingListeners.add(l);
  return () => void playingListeners.delete(l);
};

/** Which of these videos is playing, or null (re-renders only when that answer changes). */
export function usePlayingVideo(ids: readonly string[]): string | null {
  const key = ids.join("|");
  return useSyncExternalStore(
    subscribePlaying,
    () => key.split("|").find((id) => id && playingIds.has(id)) ?? null,
    () => null,
  );
}

/** Mutes or unmutes the video with this id while it plays. */
export function toggleVideoMute(id: string): boolean {
  const c = controls.get(id)?.at(-1);
  c?.mute();
  return Boolean(c);
}

/** Moves the playing video with this id to its next speed. */
export function cycleVideoRate(id: string): boolean {
  const c = controls.get(id)?.at(-1);
  c?.rate();
  return Boolean(c);
}

/** Plays or pauses the video with this id; false when none with it is on screen. */
export function toggleVideo(id: string): boolean {
  const c = controls.get(id)?.at(-1);
  c?.toggle();
  return Boolean(c);
}

/** Opens the video with this id full screen (starting it); false when none is on screen. */
export function fullScreenVideo(id: string): boolean {
  const c = controls.get(id)?.at(-1);
  c?.fullScreen();
  return Boolean(c);
}

/** Whether the video with this id is playing. */
export function isVideoPlaying(id: string): boolean {
  return playingIds.has(id);
}

function useRegister(id: string, handles: React.MutableRefObject<VideoControls>) {
  useEffect(() => {
    const entry: VideoControls = {
      toggle: () => handles.current.toggle(),
      fullScreen: () => handles.current.fullScreen(),
      mute: () => handles.current.mute(),
      rate: () => handles.current.rate(),
    };
    controls.set(id, [...(controls.get(id) ?? []), entry]);
    return () => {
      const rest = (controls.get(id) ?? []).filter((e) => e !== entry);
      if (rest.length) controls.set(id, rest);
      else controls.delete(id);
    };
  }, [id, handles]);
}

/** The bubble's video. Renders nothing without `modules.video` (the bubble shows a row instead). */
export function ChatVideoPlayer(props: ChatVideoPlayerProps) {
  const { modules, copy } = useChatNative();
  const colors = useThemeRoles();
  const { width: screen } = useWindowDimensions();
  const [active, setActive] = useState(false);
  const [fullOnStart, setFullOnStart] = useState(false);
  const testID = props.testID ?? `chat-video-${props.id}`;
  const state = videoState(props);
  const source = useMemo(() => videoSource(props), [props.uri, props.playbackId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [broken, setBroken] = useState(false);
  const handles = useRef<VideoControls>({ toggle: () => undefined, fullScreen: () => undefined, mute: () => undefined, rate: () => undefined });
  handles.current = {
    toggle: () => state === "playable" && setActive(true),
    fullScreen: () => {
      if (state !== "playable") return;
      setFullOnStart(true);
      setActive(true);
    },
    mute: () => undefined,
    rate: () => undefined,
  };
  useRegister(props.id, handles);

  if (!modules.video) return null;
  const w = Math.min(240, Math.round(screen * 0.62));
  const ratio = props.width && props.height ? props.width / props.height : 3 / 4;
  const h = Math.round(Math.max(140, Math.min(w * 1.5, w / ratio)));
  const duration = props.durationMs ? formatDuration(props.durationMs) : null;
  const box = { width: w, height: h, borderRadius: 14, overflow: "hidden" as const, backgroundColor: MEDIA_FRAME };

  if (state === "failed" || state === "processing" || broken) {
    const text = broken ? copy.videoCantPlay : state === "failed" ? copy.videoFailed : copy.videoProcessing;
    return (
      <View
        testID={`${testID}-${broken ? "broken" : state}`}
        accessible
        accessibilityLabel={text}
        accessibilityLiveRegion="polite"
        style={[box, { alignItems: "center", justifyContent: "center", gap: 8, padding: 12, backgroundColor: colors.fill }]}
      >
        {state === "processing" && !broken ? <ActivityIndicator color={colors.secondaryLabel as string} /> : <NativeIcon name="video" size={24} color={colors.secondaryLabel} />}
        <NativeText preset="caption" style={{ color: colors.secondaryLabel, textAlign: "center" }}>
          {text}
        </NativeText>
      </View>
    );
  }

  if (active && source) {
    return (
      <ActiveVideo
        {...props}
        video={modules.video}
        source={source}
        style={box}
        fullOnStart={fullOnStart}
        onFullStarted={() => setFullOnStart(false)}
        onBroken={() => setBroken(true)}
        handles={handles}
        testID={testID}
      />
    );
  }

  const poster = props.posterUri ?? (props.playbackId ? muxPosterUrl(props.playbackId) : null);
  return (
    <Pressable
      testID={`${testID}-poster`}
      accessibilityRole="button"
      accessibilityLabel={duration ? fill(copy.videoMessage, { duration }) : copy.video}
      accessibilityHint={copy.playVideo}
      accessibilityState={{ disabled: state !== "playable", busy: props.uploading }}
      disabled={state !== "playable"}
      onPress={() => setActive(true)}
      style={box}
    >
      {poster ? <NativeImage src={poster} width={w} height={h} contentFit="cover" recyclingKey={props.id} /> : null}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        {state === "loading" || props.uploading ? (
          <ActivityIndicator color={ON_MEDIA} />
        ) : (
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: MEDIA_SCRIM, alignItems: "center", justifyContent: "center" }}>
            <NativeIcon name="play" size={24} color={ON_MEDIA} />
          </View>
        )}
      </View>
      {duration ? (
        <View style={{ position: "absolute", left: 8, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: MEDIA_SCRIM }}>
          <NativeText style={{ color: ON_MEDIA, fontSize: 12, fontVariant: ["tabular-nums"] }}>{duration}</NativeText>
        </View>
      ) : null}
    </Pressable>
  );
}

function ActiveVideo({
  id,
  video,
  source,
  style,
  fullOnStart,
  onFullStarted,
  onBroken,
  handles,
  testID,
}: ChatVideoPlayerProps & {
  onBroken: () => void;
  video: ExpoVideoLike;
  source: { uri: string; contentType: "hls" | "auto" };
  style: Record<string, unknown>;
  fullOnStart: boolean;
  onFullStarted: () => void;
  handles: React.MutableRefObject<VideoControls>;
  testID: string;
}) {
  const { copy } = useChatNative();
  const player: VideoPlayerLike = video.useVideoPlayer(source, (p) => {
    p.play();
  });
  const viewRef = useRef<VideoViewHandleLike | null>(null);
  const latestBroken = useRef(onBroken);
  latestBroken.current = onBroken;
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const ended = useRef(false);

  useEffect(() => {
    claimPlayback(id, () => player.pause());
    setPlayingId(id, true);
    const subs = [
      player.addListener("playingChange", ((payload: { isPlaying: boolean }) => {
        setPlaying(payload.isPlaying);
        setPlayingId(id, payload.isPlaying);
        if (payload.isPlaying) {
          ended.current = false;
          claimPlayback(id, () => player.pause());
        } else {
          releasePlayback(id);
        }
      }) as (payload: never) => void),
      player.addListener("playToEnd", (() => {
        ended.current = true;
      }) as (payload: never) => void),
      // A stream that won't load (gone, refused, offline) says so instead of staying black.
      player.addListener("statusChange", ((payload: { status: string }) => {
        if (payload.status === "error") latestBroken.current();
      }) as (payload: never) => void),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      setPlayingId(id, false);
      releasePlayback(id);
    };
  }, [id, player]);

  useEffect(() => {
    if (!fullOnStart) return;
    onFullStarted();
    void viewRef.current?.enterFullscreen().catch(() => undefined);
  }, [fullOnStart, onFullStarted]);

  const toggle = () => {
    if (playing) return player.pause();
    if (ended.current) player.currentTime = 0;
    player.play();
  };
  const fullScreen = () => void viewRef.current?.enterFullscreen().catch(() => undefined);
  const toggleMute = () => {
    player.muted = !muted;
    setMuted(!muted);
  };
  const cycleRate = () => {
    const next = nextPlaybackRate(rate);
    player.playbackRate = next;
    setRate(next);
  };
  handles.current = { toggle, fullScreen, mute: toggleMute, rate: cycleRate };
  const { VideoView } = video;
    return (
    <View testID={`${testID}-active`} style={style}>
      <VideoView ref={viewRef} player={player} nativeControls={false} contentFit="cover" allowsPictureInPicture={false} style={{ width: "100%", height: "100%" }} testID={`${testID}-view`} />
      <Pressable
        testID={`${testID}-surface`}
        accessibilityRole="button"
        accessibilityLabel={playing ? copy.pauseVideo : copy.playVideo}
        onPress={toggle}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 44, alignItems: "center", justifyContent: "center" }}
      >
        {!playing ? (
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: MEDIA_SCRIM, alignItems: "center", justifyContent: "center" }}>
            <NativeIcon name="play" size={24} color={ON_MEDIA} />
          </View>
        ) : null}
      </Pressable>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, backgroundColor: MEDIA_SCRIM_LIGHT }}>
        <Control testID={`${testID}-play`} label={playing ? copy.pauseVideo : copy.playVideo} onPress={toggle} icon={playing ? "pause" : "play"} />
        <Control testID={`${testID}-mute`} label={muted ? copy.unmute : copy.mute} onPress={toggleMute} icon={muted ? "volume-off" : "volume"} />
        <Pressable
          testID={`${testID}-rate`}
          accessibilityRole="button"
          accessibilityLabel={fill(copy.speed, { rate: `${rate}x` })}
          onPress={cycleRate}
          style={{ minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <NativeText style={{ color: ON_MEDIA, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{`${rate}x`}</NativeText>
        </Pressable>
        <Control testID={`${testID}-fullscreen`} label={copy.fullScreen} onPress={fullScreen} icon="expand" />
      </View>
    </View>
  );
}

function Control({ icon, label, onPress, selected, testID }: { icon: "play" | "pause" | "volume" | "volume-off" | "expand"; label: string; onPress: () => void; selected?: boolean; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <NativeIcon name={icon} size={20} color={ON_MEDIA} />
    </Pressable>
  );
}
