/**
 * Previews on the phone: the screen a preview link opens (`PreviewScreen`, at the app's
 * `app/preview.tsx`), and the notice over every screen while the device follows a channel other
 * than its build's (`PreviewNotice`, drawn by the updates block's root; slot `previewNotice`).
 *
 * The flow, as apps that ran this in production settled on: confirm what will load (a preview
 * replaces the app's code until you leave it) → download → "Restart now". Leaving always works,
 * from the notice, for everyone. Bluesky shows the same kind of notice to anyone on a
 * non-standard channel, with "Restore default".
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeButton, NativeEmptyState, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useUpdates, useVersionSignature } from "./block";
import type { VersionSignature } from "./signature";
import { isChannelName, type ChannelCheck, type ChannelState, type ChannelSwitcher } from "./channels";

const EMPTY: ChannelState = { requested: null, build: null, lingering: null };

/**
 * Numbers each channel a preview screen is given, so an answer can be matched to the attempt that
 * asked: `for(channel)` keeps the number while the channel stays, and moves on when it changes
 * (back to an earlier one included); `isCurrent(n)` says whether `n` is still the attempt shown.
 */
export function createAttempts() {
  let n = 0;
  let last: string | null | undefined;
  return {
    for(channel: string | null): number {
      if (channel !== last) {
        last = channel;
        n += 1;
      }
      return n;
    },
    isCurrent: (attempt: number) => attempt === n,
  };
}

/** The picked channel and the build's own, kept current. */
export function useChannelState(): ChannelState {
  const { channels } = useUpdates();
  return useChannelStateOf(channels);
}

function useChannelStateOf(channels: ChannelSwitcher): ChannelState {
  const [state, setState] = useState<ChannelState>(EMPTY);
  useEffect(() => {
    let alive = true;
    void channels.state().then((s) => alive && setState(s));
    const off = channels.subscribe((s) => alive && setState(s));
    return () => {
      alive = false;
      off();
    };
  }, [channels]);
  return useSyncExternalStore(
    () => () => {},
    () => state,
    () => state,
  );
}

type Phase = { kind: "confirm" } | { kind: "working" } | { kind: "restarting" } | ChannelCheck;

export interface PreviewScreenProps {
  /** The channel from the link (`useLocalSearchParams().channel`); anything else reads as invalid. */
  channel: string | null | undefined;
  /** Leave the screen (close, or go home). */
  onDone: () => void;
  testID?: string;
}

/** What a preview link opens: confirm, load, restart into the preview. */
export function PreviewScreen({ channel, onDone, testID = "genesis-preview" }: PreviewScreenProps) {
  const { channels } = useUpdates();
  const state = useChannelStateOf(channels);
  const signature = useVersionSignature();
  const valid = isChannelName(channel ?? "") ? (channel as string) : null;
  // Each channel the screen is given is a new attempt: a new link (even back to an earlier one)
  // starts at confirm, and a late answer from an earlier attempt is dropped.
  const attempts = useRef<ReturnType<typeof createAttempts> | null>(null);
  attempts.current ??= createAttempts();
  const attempt = attempts.current.for(valid);
  const [run, setRun] = useState<{ attempt: number; phase: Phase }>({ attempt, phase: { kind: "confirm" } });
  const phase: Phase = run.attempt === attempt ? run.phase : { kind: "confirm" };
  // Whether the phone followed this channel before this attempt: declining a failed attempt then
  // keeps it, and otherwise backs out of what prepare already set.
  const followedBefore = useRef(false);
  const setPhase = (next: Phase, forAttempt: number = attempt) => {
    if (attempts.current!.isCurrent(forAttempt)) setRun({ attempt: forAttempt, phase: next });
  };

  if (!valid) {
    return <NativeEmptyState testID={`${testID}-invalid`} variant="error" title="This preview link isn't right" body="It doesn't name a preview. Ask for the link again." primaryAction={<NativeButton onPress={onDone}>Close</NativeButton>} />;
  }
  if (!channels.enabled) {
    return <NativeEmptyState testID={`${testID}-off`} title="Previews are off in this build" body="This version of the app can't open previews." primaryAction={<NativeButton onPress={onDone}>Close</NativeButton>} />;
  }

  const load = async () => {
    const target = attempt;
    // Only the attempt's first load reads it: a retry finds the channel this attempt already picked.
    if (phase.kind === "confirm") followedBefore.current = state.requested === valid;
    setPhase({ kind: "working" }, target);
    try {
      setPhase(await channels.prepare(valid), target);
    } catch (raw) {
      setPhase({ kind: "error", error: raw instanceof Error ? raw : new Error(String(raw)) }, target);
    }
  };
  const restart = async () => {
    const target = attempt;
    setPhase({ kind: "restarting" }, target);
    try {
      const r = await channels.restart();
      if (r.kind === "blocked") setPhase({ kind: "error", error: new Error("Save or discard what you're editing, then restart the app to open the preview.") }, target);
      else if (r.kind === "error") setPhase({ kind: "error", error: r.error }, target);
      else if (r.kind === "unavailable") setPhase(r, target);
    } catch (raw) {
      setPhase({ kind: "error", error: raw instanceof Error ? raw : new Error(String(raw)) }, target);
    }
  };
  const already = state.requested === valid;
  const leaveNothing = () => void channels.reset().then(onDone, onDone);

  const body = (() => {
    switch (phase.kind) {
      case "confirm":
        return {
          title: already ? `You're on ${valid}` : `Open the preview ${valid}?`,
          body: already
            ? "This phone already follows this preview. Load its newest version, or leave it from the banner at the top."
            : "The app restarts with this preview's code, still signed in and on the same data. A banner stays at the top until you leave it, and leaving takes you back to the regular app.",
          primary: { label: already ? "Load the newest" : "Open preview", onPress: () => void load() },
        };
      case "working":
        return { title: `Loading ${valid}…`, body: "Downloading the preview." };
      case "downloaded":
        return { title: "Preview ready", body: "Restart to open it.", primary: { label: "Restart now", onPress: () => void restart() } };
      case "restarting":
        return { title: "Restarting…", body: "" };
      case "latest":
        return already
          ? { title: `You have the newest ${valid}`, body: "This phone already runs this preview's newest version.", primary: { label: "Done", onPress: onDone } }
          : { title: "Nothing newer to load", body: "No update was picked for this phone, so it keeps the one it runs now.", primary: { label: "Done", onPress: onDone } };
      case "nothing":
        // "none" is often only a preview still publishing (a push shows up a few minutes later),
        // so it says so and offers another try first; only a crash here before is final.
        return phase.reason === "failed"
          ? {
              title: "This preview crashed here before",
              body: "It won't load again on this phone. Ask for a new version of it.",
              primary: { label: "Back to the app", onPress: leaveNothing },
            }
          : {
              title: `${valid} isn't on this phone yet`,
              body: `${valid} has nothing published for this phone's build (below). If it was just pushed, it may still be publishing: try again in a minute or two. If it still won't load, it was published for another build: install the build it names, from the store or TestFlight.`,
              primary: { label: "Try again", onPress: () => void load() },
            };
      case "gone":
        return { title: "This preview is closed", body: "Its pull request was closed or merged. You're on the regular app.", primary: { label: "Done", onPress: onDone } };
      case "unavailable":
        return { title: "Previews can't open here", body: phase.reason, primary: { label: "Close", onPress: onDone } };
      case "error":
        return { title: "Couldn't open the preview", body: phase.error.message || "Check your connection and try again.", primary: { label: "Try again", onPress: () => void load() } };
    }
  })();

  return (
    <View testID={testID} style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <NativeText preset="h2" style={{ textAlign: "center" }}>
        {body.title}
      </NativeText>
      {body.body ? (
        <NativeText preset="body" style={{ textAlign: "center", opacity: 0.75 }}>
          {body.body}
        </NativeText>
      ) : null}
      {body.primary ? (
        <NativeButton testID={`${testID}-primary`} onPress={body.primary.onPress}>
          {body.primary.label}
        </NativeButton>
      ) : null}
      {phase.kind !== "working" && phase.kind !== "restarting" ? <PreviewPhoneDetails signature={signature} testID={`${testID}-details`} /> : null}
      {phase.kind === "nothing" && phase.reason === "none" ? (
        <NativeButton testID={`${testID}-leave`} variant="ghost" onPress={leaveNothing}>
          Back to the app
        </NativeButton>
      ) : null}
      {phase.kind === "confirm" || phase.kind === "error" ? (
        <NativeButton
          testID={`${testID}-cancel`}
          variant="ghost"
          onPress={phase.kind === "error" && !followedBefore.current && state.requested === valid ? () => void channels.reset().then(onDone, onDone) : onDone}
        >
          Not now
        </NativeButton>
      ) : null}
    </View>
  );
}

/**
 * What this phone has installed and runs, as lines: the build, the runtime a preview must be
 * published for, and whose code runs now. A preview link that finds nothing is told apart from one
 * that waits on a new build by comparing these with the preview's own build.
 */
export function previewPhoneLines(sig: VersionSignature): { label: string; value: string }[] {
  const app = sig.version ? `${sig.version}${sig.build ? ` (${sig.build})` : ""}` : (sig.build ?? "unknown");
  const runs =
    sig.launch === "off"
      ? "Updates are off in this build"
      : sig.launch === "embedded"
        ? "The build's own code"
        : `Update ${sig.updateId ? sig.updateId.slice(0, 8) : "unknown"}${sig.requestedChannel ? ` from ${sig.requestedChannel}` : ""}`;
  return [
    { label: "Installed build", value: `${app} · ${sig.platform}${sig.channel ? ` · ${sig.channel}` : ""}` },
    { label: "Runtime", value: sig.runtimeVersion ? sig.runtimeVersion.slice(0, 7) : "none" },
    { label: "Running", value: sig.emergency ? `${runs} (recovered after a failed launch)` : runs },
  ];
}

function PreviewPhoneDetails({ signature, testID }: { signature: VersionSignature; testID: string }) {
  return (
    <View testID={testID} accessible accessibilityLabel={previewPhoneLines(signature).map((l) => `${l.label}: ${l.value}`).join(". ")} className="rounded-lg bg-muted" style={{ padding: 12, gap: 4 }}>
      <NativeText preset="caption" style={{ fontWeight: "600" }}>
        This phone
      </NativeText>
      {previewPhoneLines(signature).map((l) => (
        <View key={l.label} style={{ flexDirection: "row", gap: 8 }}>
          <NativeText preset="caption" style={{ opacity: 0.7, width: 110 }}>
            {l.label}
          </NativeText>
          <NativeText preset="caption" style={{ flex: 1 }} selectable>
            {l.value}
          </NativeText>
        </View>
      ))}
    </View>
  );
}

export interface PreviewNoticeProps {
  /** The preview being followed. */
  channel: string;
  /** Back to the build's channel (reloads). */
  leave: () => void;
  leaving: boolean;
  /** Set when leaving couldn't restart the app: the preview's code still runs until it does. */
  problem?: string | null;
}

/** A small bar over every screen while a preview is open: which one, and Leave. */
export function PreviewNotice({ channel, leave, leaving, problem }: PreviewNoticeProps) {
  return (
    // Below the status bar and notch on every phone (the safe area's top), not a fixed offset.
    <SafeAreaView edges={["top"]} pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", paddingTop: 8 }}>
      <Pressable
        testID="genesis-preview-notice"
        onPress={leave}
        disabled={leaving}
        accessibilityRole="button"
        accessibilityLabel={problem ? `Preview ${channel}. ${problem} Try again` : `Preview ${channel}. Leave the preview`}
        className="bg-warning"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 14,
          opacity: pressed || leaving ? 0.8 : 1,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        })}
      >
        <NativeText preset="caption" className="text-warning-foreground" style={{ fontWeight: "700" }}>
          Preview: {channel}
        </NativeText>
        <NativeText preset="caption" className="text-warning-foreground" style={{ fontWeight: "600", textDecorationLine: "underline" }}>
          {leaving ? "Leaving…" : problem ? "Try again" : "Leave"}
        </NativeText>
      </Pressable>
      {problem ? (
        <NativeText testID="genesis-preview-notice-problem" preset="caption" className="text-warning-foreground bg-warning" style={{ marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, textAlign: "center" }}>
          {problem}
        </NativeText>
      ) : null}
    </SafeAreaView>
  );
}

/** The notice's props while a preview is open, else `null`. */
export function usePreviewNotice(): PreviewNoticeProps | null {
  const { channels } = useUpdates();
  const { requested, lingering } = useChannelStateOf(channels);
  const [leaving, setLeaving] = useState(false);
  // Leaving clears the override at once, but the preview's code runs until the app restarts: keep
  // the notice (and a way to finish) until it does.
  // `blocked`: the build's update is downloaded, only the restart is left. Anything else: leave again
  // from the top (it fetches the build's channel again, so the restart can't land on the preview).
  const [stuck, setStuck] = useState<{ channel: string; problem: string; blocked: boolean } | null>(null);
  // Picking a channel again (a new preview link) ends a stuck leave: its problem and restart are the old one's.
  useEffect(() => {
    if (requested) setStuck(null);
  }, [requested]);
  const channel = requested ?? stuck?.channel ?? lingering ?? null;
  if (!channel) return null;
  const finish = async () => {
    setLeaving(true);
    try {
      const r = stuck?.blocked ? await channels.restart() : await channels.reset();
      if (r.kind === "reloading") return;
      const problem =
        r.kind === "blocked" ? "Save or discard what you're editing, then restart." : r.kind === "error" ? r.error.message || "Couldn't restart the app." : "Close and reopen the app to finish leaving.";
      setStuck({ channel, problem, blocked: r.kind === "blocked" });
    } catch (raw) {
      setStuck({ channel, problem: raw instanceof Error ? raw.message : "Couldn't restart the app.", blocked: false });
    } finally {
      setLeaving(false);
    }
  };
  const problem = stuck?.problem ?? (lingering && !requested ? "Still on the preview's code. Try again to load the regular version." : null);
  return { channel, leaving, problem, leave: () => void finish() };
}
