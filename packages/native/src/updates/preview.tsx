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
import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { NativeButton, NativeEmptyState, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useUpdates } from "./block";
import { isChannelName, type ChannelCheck, type ChannelState, type ChannelSwitcher } from "./channels";

const EMPTY: ChannelState = { requested: null, build: null };

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
  const [phase, setPhase] = useState<Phase>({ kind: "confirm" });
  const valid = isChannelName(channel ?? "") ? (channel as string) : null;

  if (!valid) {
    return <NativeEmptyState testID={`${testID}-invalid`} variant="error" title="This preview link isn't right" body="It doesn't name a preview. Ask for the link again." primaryAction={<NativeButton onPress={onDone}>Close</NativeButton>} />;
  }
  if (!channels.enabled) {
    return <NativeEmptyState testID={`${testID}-off`} title="Previews are off in this build" body="This version of the app can't open previews." primaryAction={<NativeButton onPress={onDone}>Close</NativeButton>} />;
  }

  const load = async () => {
    setPhase({ kind: "working" });
    setPhase(await channels.prepare(valid));
  };
  const restart = async () => {
    setPhase({ kind: "restarting" });
    const r = await channels.restart();
    if (r.kind === "blocked") setPhase({ kind: "error", error: new Error("Save or discard what you're editing, then restart the app to open the preview.") });
    else if (r.kind === "error") setPhase({ kind: "error", error: r.error });
    else if (r.kind === "unavailable") setPhase(r);
  };
  const already = state.requested === valid;

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
        return { title: "You have the newest version", body: `${valid} is already running.`, primary: { label: "Done", onPress: onDone } };
      case "nothing":
        return {
          title: "Nothing to open yet",
          body:
            phase.reason === "failed"
              ? "This preview crashed on this phone before, so it won't load again. Ask for a new version of it."
              : "This preview has nothing for this version of the app: it may need a new build from the store or TestFlight, or it isn't published yet.",
          primary: { label: "Back to the app", onPress: () => void channels.reset().then(onDone, onDone) },
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
      {phase.kind === "confirm" || phase.kind === "error" ? (
        <NativeButton testID={`${testID}-cancel`} variant="ghost" onPress={onDone}>
          Not now
        </NativeButton>
      ) : null}
    </View>
  );
}

export interface PreviewNoticeProps {
  /** The preview being followed. */
  channel: string;
  /** Back to the build's channel (reloads). */
  leave: () => void;
  leaving: boolean;
}

/** A small bar over every screen while a preview is open: which one, and Leave. */
export function PreviewNotice({ channel, leave, leaving }: PreviewNoticeProps) {
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", paddingTop: 54 }}>
      <Pressable
        testID="genesis-preview-notice"
        onPress={leave}
        disabled={leaving}
        accessibilityRole="button"
        accessibilityLabel={`Preview ${channel}. Leave the preview`}
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
          {leaving ? "Leaving…" : "Leave"}
        </NativeText>
      </Pressable>
    </View>
  );
}

/** The notice's props while a preview is open, else `null`. */
export function usePreviewNotice(): PreviewNoticeProps | null {
  const { channels } = useUpdates();
  const { requested } = useChannelStateOf(channels);
  const [leaving, setLeaving] = useState(false);
  if (!requested) return null;
  return {
    channel: requested,
    leaving,
    leave: () => {
      setLeaving(true);
      void channels.reset().finally(() => setLeaving(false));
    },
  };
}
