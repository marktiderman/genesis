/**
 * @feat:chat
 * A voice note in a bubble: play and pause, its waveform (drawn before the
 * audio loads), drag across it to scrub, 1x / 1.5x / 2x, and the time. One
 * voice note plays at a time: starting one pauses the one playing. Each one
 * also answers `toggleVoiceNote` / `cycleVoiceNoteRate` by its id, which the
 * bubble's VoiceOver actions call (an accessible bubble hides its children).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PanResponder, Pressable, View, type LayoutChangeEvent } from "react-native";
import { NativeIcon, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { formatDuration, nextPlaybackRate } from "../core/media";
import { fill } from "./copy";
import { useChatNative } from "./context";
import type { ExpoAudioLike } from "./modules";

// ---- One at a time --------------------------------------------------------

let active: { id: string; pause: () => void } | null = null;
const playbackListeners = new Set<() => void>();
const notifyPlayback = () => playbackListeners.forEach((l) => l());

/** Called when a voice note starts: pauses whichever other one was playing. */
export function claimPlayback(id: string, pause: () => void): void {
  if (active && active.id !== id) {
    try {
      active.pause();
    } catch {
      // A player already gone has nothing to pause.
    }
  }
  active = { id, pause };
  notifyPlayback();
}

/** Called when a voice note stops or unmounts. */
export function releasePlayback(id: string): void {
  if (active?.id === id) {
    active = null;
    notifyPlayback();
  }
}

const subscribePlayback = (l: () => void) => {
  playbackListeners.add(l);
  return () => void playbackListeners.delete(l);
};

/** Which of these voice notes is playing, or null (re-renders only when that answer changes). */
export function usePlayingVoiceNote(ids: readonly string[]): string | null {
  const key = ids.join("|");
  return useSyncExternalStore(
    subscribePlayback,
    () => (active && key.split("|").includes(active.id) ? active.id : null),
    () => null,
  );
}

// ---- Controls by id, for the bubble's accessibility actions -----------------

interface VoiceNoteControls {
  toggle: () => void;
  cycleRate: () => void;
}

// Every mounted player per id (one attachment can show in the timeline and in its thread): the newest answers.
const controls = new Map<string, VoiceNoteControls[]>();
const controlsFor = (id: string) => controls.get(id)?.at(-1);

/** Plays or pauses the voice note with this id; false when none with it is on screen with playback. */
export function toggleVoiceNote(id: string): boolean {
  const c = controlsFor(id);
  c?.toggle();
  return Boolean(c);
}

/** Moves the voice note with this id to its next speed; false when none is on screen with playback. */
export function cycleVoiceNoteRate(id: string): boolean {
  const c = controlsFor(id);
  c?.cycleRate();
  return Boolean(c);
}

/** The playing voice note's id, for tests. */
export function activePlaybackId(): string | null {
  return active?.id ?? null;
}

/** Where a finger at `x` across a waveform `width` wide puts the playhead, in seconds. */
export function scrubSeconds(x: number, width: number, durationSec: number): number {
  if (width <= 0 || durationSec <= 0) return 0;
  return Math.max(0, Math.min(1, x / width)) * durationSec;
}

const BAR_WIDTH = 3;
const BAR_GAP = 2;

/** How many bars fit across `width` points, one bar plus a gap each; never fewer than one. */
export function barsThatFit(width: number): number {
  if (!(width > 0)) return 1;
  return Math.max(1, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
}

/** Bars 0–1 from stored peaks (0–100), resampled to `count`; flat when there are none. */
export function waveformBars(peaks: readonly number[] | null | undefined, count = 32): number[] {
  if (!peaks || peaks.length === 0) return new Array(count).fill(0.08);
  return Array.from({ length: count }, (_, i) => {
    const v = peaks[Math.min(peaks.length - 1, Math.floor((i * peaks.length) / count))] ?? 0;
    return Math.max(0.08, Math.min(1, v / 100));
  });
}

export interface VoiceNotePlayerProps {
  /** Stable id (the attachment's), for one-at-a-time. */
  id: string;
  /** A signed URL or a local file URI; null while it is fetched. */
  uri: string | null;
  durationMs: number | null;
  waveform: number[] | null;
  /** On the tint bubble: draw in its foreground. */
  mine?: boolean;
  testID?: string;
}

export function VoiceNotePlayer(props: VoiceNotePlayerProps) {
  const { modules } = useChatNative();
  if (!modules.audio) return <StaticVoiceNote {...props} />;
  return <AudioVoiceNote {...props} audio={modules.audio} />;
}

/** Without expo-audio: the waveform and duration, no playback. */
function StaticVoiceNote({ durationMs, waveform, mine, testID }: VoiceNotePlayerProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const duration = formatDuration(durationMs);
  return (
    <View testID={testID} accessible accessibilityLabel={fill(copy.voiceMessage, { duration })} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
      <Bars bars={waveformBars(waveform, 24)} progress={0} mine={mine} colors={colors} />
      <NativeText className={mine ? "text-primary-foreground" : undefined} style={{ fontSize: 13, fontVariant: ["tabular-nums"] }}>
        {duration}
      </NativeText>
    </View>
  );
}

function AudioVoiceNote({ id, uri, durationMs, waveform, mine, testID, audio }: VoiceNotePlayerProps & { audio: ExpoAudioLike }) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const source = useMemo(() => (uri ? { uri } : null), [uri]);
  const player = audio.useAudioPlayer(source, { updateInterval: 100 });
  const status = audio.useAudioPlayerStatus(player);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const width = useRef(0);
  // As many bars as the waveform's slot holds, so they never run under the time and speed.
  const [barCount, setBarCount] = useState(0);

  // Unmounted (scrolled away, screen closed): it no longer holds the one playback slot.
  useEffect(() => () => releasePlayback(id), [id]);
  useEffect(() => {
    if (status.didJustFinish) releasePlayback(id);
  }, [status.didJustFinish, id]);

  const durationSec = status.duration > 0 ? status.duration : (durationMs ?? 0) / 1000;
  const position = scrubbing ?? status.currentTime;
  const progress = durationSec > 0 ? Math.min(1, position / durationSec) : 0;
  const rate = status.playbackRate || 1;

  const pause = () => {
    player.pause();
    releasePlayback(id);
  };
  const toggle = () => {
    if (status.playing) return pause();
    claimPlayback(id, () => player.pause());
    if (status.didJustFinish || (durationSec > 0 && status.currentTime >= durationSec - 0.05)) void player.seekTo(0);
    player.play();
  };
  const seek = (seconds: number) => void player.seekTo(Math.max(0, Math.min(durationSec, seconds)));
  const cycleRate = () => player.setPlaybackRate(nextPlaybackRate(rate));

  // The bubble's VoiceOver actions reach this player by its id.
  const handles = useRef({ toggle, cycleRate });
  handles.current = { toggle, cycleRate };
  useEffect(() => {
    const entry: VoiceNoteControls = { toggle: () => handles.current.toggle(), cycleRate: () => handles.current.cycleRate() };
    controls.set(id, [...(controls.get(id) ?? []), entry]);
    return () => {
      const rest = (controls.get(id) ?? []).filter((e) => e !== entry);
      if (rest.length) controls.set(id, rest);
      else controls.delete(id);
    };
  }, [id]);

  const latest = useRef({ durationSec, seek });
  latest.current = { durationSec, seek };
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only a sideways drag scrubs, so a scroll that starts on a voice note still scrolls.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => setScrubbing(scrubSeconds(e.nativeEvent.locationX, width.current, latest.current.durationSec)),
        onPanResponderMove: (e) => setScrubbing(scrubSeconds(e.nativeEvent.locationX, width.current, latest.current.durationSec)),
        onPanResponderRelease: (e) => {
          latest.current.seek(scrubSeconds(e.nativeEvent.locationX, width.current, latest.current.durationSec));
          setScrubbing(null);
        },
        onPanResponderTerminate: () => setScrubbing(null),
      }),
    [],
  );

  const fg = mine ? "text-primary-foreground" : undefined;
  const shown = formatDuration((status.playing || position > 0 ? position : durationSec) * 1000);
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 240 }}>
      <Pressable
        testID={testID ? `${testID}-play` : undefined}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? copy.pause : copy.play}
        onPress={toggle}
        disabled={!uri}
        hitSlop={4}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: uri ? 1 : 0.5 }}
      >
        <NativeIcon name={status.playing ? "pause" : "play"} size={22} color={mine ? colors.surface : colors.tint} />
      </Pressable>
      <View
        testID={testID ? `${testID}-wave` : undefined}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={fill(copy.voiceMessage, { duration: formatDuration(durationSec * 1000) })}
        accessibilityValue={{ text: `${formatDuration(position * 1000)} / ${formatDuration(durationSec * 1000)}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => seek(status.currentTime + (e.nativeEvent.actionName === "increment" ? 5 : -5))}
        onLayout={(e: LayoutChangeEvent) => {
          width.current = e.nativeEvent.layout.width;
          setBarCount(barsThatFit(e.nativeEvent.layout.width));
        }}
        style={{ flex: 1, minWidth: 0, height: 44, justifyContent: "center", overflow: "hidden" }}
        {...responder.panHandlers}
      >
        {barCount > 0 ? <Bars bars={waveformBars(waveform, barCount)} progress={progress} mine={mine} colors={colors} /> : null}
      </View>
      <NativeText className={fg} style={{ fontSize: 13, minWidth: 36, fontVariant: ["tabular-nums"] }}>
        {shown}
      </NativeText>
      <Pressable
        testID={testID ? `${testID}-rate` : undefined}
        accessibilityRole="button"
        accessibilityLabel={fill(copy.speed, { rate: `${rate}x` })}
        onPress={cycleRate}
        hitSlop={8}
        style={{ minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <NativeText className={fg} style={{ fontSize: 13, fontWeight: "600" }}>{`${rate}×`}</NativeText>
      </Pressable>
    </View>
  );
}

function Bars({ bars, progress, mine, colors }: { bars: number[]; progress: number; mine?: boolean; colors: ReturnType<typeof useThemeRoles> }) {
  // On the tint bubble the bars are the surface color, the unplayed part faded.
  const played = mine ? colors.surface : colors.tint;
  const rest = mine ? colors.surface : colors.tertiaryLabel;
  return (
    <View pointerEvents="none" style={{ flexDirection: "row", alignItems: "center", gap: BAR_GAP, height: 28, overflow: "hidden" }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: BAR_WIDTH,
            borderRadius: BAR_WIDTH / 2,
            height: Math.max(3, Math.round(h * 28)),
            backgroundColor: (i + 0.5) / bars.length <= progress ? played : rest,
            opacity: mine && (i + 0.5) / bars.length > progress ? 0.45 : 1,
          }}
        />
      ))}
    </View>
  );
}
