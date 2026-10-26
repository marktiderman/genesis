/**
 * @feat:chat
 * Pictures and files in a message: photos as a grid of NativeImage (expo-image
 * when the app gave it) over signed links from `useFileUrls`, a local preview
 * while one still uploads, a tap opening the full-screen viewer (photo-viewer.tsx); voice notes
 * as VoiceNotePlayer with their transcript under them (three lines, then "Show more"), as on the
 * web; other files as a row with their name.
 */
import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { NativeIcon, NativeImage, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { formatDuration } from "../core/media";
import type { AttachmentInput, ChatAttachment } from "../core/types";
import { useChatNative } from "./context";
import { ChatVideoPlayer } from "./video-player";
import { VoiceNotePlayer } from "./voice-player";

/** An attachment as the bubble draws it: from the server, or still on the phone. */
export interface BubbleAttachment {
  key: string;
  kind: string;
  /** What to show now: a signed URL, or the local preview. */
  uri: string | null;
  name: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[] | null;
  thumbhash: string | null;
  /** A hosted video: who hosts it, its playback id once processed, and whether it is ready. */
  provider?: string | null;
  playbackId?: string | null;
  status?: "pending" | "ready" | "failed" | null;
  posterUri?: string | null;
  /** Still on its way from this phone. */
  uploading?: boolean;
  /** A voice note's (or video's) transcript, and whether one is still being made. */
  transcript?: string | null;
  transcriptStatus?: ChatAttachment["transcriptStatus"];
}

export function fromServer(a: ChatAttachment, urls: Record<string, string>): BubbleAttachment {
  return {
    key: a.id,
    kind: a.kind,
    uri: (a.path ? urls[a.path] : null) ?? a.url ?? null,
    name: a.name,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    waveform: a.waveform,
    thumbhash: a.thumbhash,
    provider: a.provider,
    playbackId: a.playbackId,
    status: a.status,
    posterUri: a.posterPath ? (urls[a.posterPath] ?? null) : null,
    transcript: a.transcript,
    transcriptStatus: a.transcriptStatus,
  };
}

export function fromPending(
  clientId: string,
  index: number,
  file: { name: string; contentType: string; meta?: Partial<AttachmentInput> },
  preview: string | undefined,
): BubbleAttachment {
  const kind = file.meta?.kind ?? (file.contentType.startsWith("image/") ? "image" : file.contentType.startsWith("audio/") ? "voice" : "file");
  return {
    key: `${clientId}:${index}`,
    kind,
    uri: preview ?? null,
    name: file.name,
    width: file.meta?.width ?? null,
    height: file.meta?.height ?? null,
    durationMs: file.meta?.durationMs ?? null,
    waveform: file.meta?.waveform ?? null,
    thumbhash: null,
    provider: file.meta?.provider ?? null,
    uploading: true,
  };
}

/** An attachment a pending message already carries (a hosted video, uploaded before it was queued). */
export function fromPendingInput(clientId: string, index: number, a: AttachmentInput): BubbleAttachment {
  return {
    key: `${clientId}:input:${index}`,
    kind: a.kind,
    uri: a.url ?? null,
    name: a.name ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
    durationMs: a.durationMs ?? null,
    waveform: a.waveform ?? null,
    thumbhash: a.thumbhash ?? null,
    provider: a.provider ?? null,
    status: a.status ?? null,
  };
}

/** The paths a set of messages needs signed links for. */
export function attachmentPaths(attachments: readonly ChatAttachment[]): string[] {
  const out: string[] = [];
  for (const a of attachments) {
    if (a.path && a.provider === "storage") out.push(a.path);
    if (a.posterPath) out.push(a.posterPath);
  }
  return out;
}

export interface AttachmentsProps {
  attachments: BubbleAttachment[];
  mine: boolean;
  onOpenImage?: (uri: string, alt: string) => void;
  testID: string;
}

export function MessageAttachments({ attachments, mine, onOpenImage, testID }: AttachmentsProps) {
  const { copy, modules } = useChatNative();
  const colors = useThemeRoles();
  const { width: screen } = useWindowDimensions();
  const images = attachments.filter((a) => a.kind === "image");
  const others = attachments.filter((a) => a.kind !== "image");
  const max = Math.min(260, Math.round(screen * 0.66));
  return (
    <View style={{ gap: 6 }}>
      {images.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, maxWidth: max, justifyContent: mine ? "flex-end" : "flex-start" }}>
          {images.map((a, i) => {
            const single = images.length === 1;
            const ratio = a.width && a.height ? a.width / a.height : 1;
            const w = single ? max : Math.floor((max - 4) / 2);
            const h = single ? Math.round(Math.max(120, Math.min(max * 1.3, w / ratio))) : w;
            const alt = a.name ? `${copy.photo}, ${a.name}` : copy.photo;
            return (
              <Pressable
                key={a.key}
                testID={`${testID}-image-${i}`}
                accessibilityRole="imagebutton"
                accessibilityLabel={alt}
                accessibilityHint={copy.openImage}
                disabled={!a.uri || !onOpenImage}
                onPress={() => a.uri && onOpenImage?.(a.uri, alt)}
                style={{ borderRadius: 14, overflow: "hidden" }}
              >
                {a.uri ? (
                  <NativeImage src={a.uri} width={w} height={h} placeholder={a.thumbhash ? { thumbhash: a.thumbhash } : undefined} recyclingKey={a.key} />
                ) : (
                  <View style={{ width: w, height: h, backgroundColor: colors.fill }} />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {others.map((a, i) =>
        a.kind === "voice" ? (
          <View key={a.key} style={{ gap: 2 }}>
            <VoiceNotePlayer id={a.key} uri={a.uri} durationMs={a.durationMs} waveform={a.waveform} mine={mine} testID={`${testID}-voice-${i}`} />
            <VoiceTranscript transcript={a.transcript} status={a.transcriptStatus} mine={mine} testID={`${testID}-voice-${i}-transcript`} />
          </View>
        ) : a.kind === "video" && modules.video ? (
          <ChatVideoPlayer
            key={a.key}
            id={a.key}
            uri={a.uri}
            playbackId={a.playbackId}
            posterUri={a.posterUri}
            provider={a.provider}
            status={a.status}
            durationMs={a.durationMs}
            width={a.width}
            height={a.height}
            uploading={a.uploading}
            testID={`${testID}-video-${i}`}
          />
        ) : (
          <View
            key={a.key}
            testID={`${testID}-file-${i}`}
            accessible
            accessibilityLabel={`${a.kind === "video" ? copy.video : copy.file}, ${a.name ?? ""}${a.durationMs ? `, ${formatDuration(a.durationMs)}` : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
          >
            <NativeIcon name={a.kind === "video" ? "play" : "file"} size={20} color={mine ? colors.surface : colors.secondaryLabel} />
            <NativeText numberOfLines={1} className={mine ? "text-primary-foreground" : undefined} style={{ flexShrink: 1, fontSize: 15 }}>
              {a.name ?? (a.kind === "video" ? copy.video : copy.file)}
            </NativeText>
          </View>
        ),
      )}
    </View>
  );
}

// ChatMediaViewer (one picture) is in photo-viewer.tsx, over the full-screen ChatPhotoViewer.

/** Lines a transcript shows before "Show more". */
export const TRANSCRIPT_LINES = 3;

/**
 * Whether a transcript folds behind "Show more": by its laid-out line count once measured. Before
 * any layout (unit tests, where nothing is laid out) a rough guess from its length stands in.
 */
export function transcriptIsLong(text: string, measuredLines?: number | null): boolean {
  if (typeof measuredLines === "number") return measuredLines > TRANSCRIPT_LINES;
  return text.length > 140 || text.split("\n").length > TRANSCRIPT_LINES;
}

export interface VoiceTranscriptProps {
  transcript: string | null | undefined;
  status: ChatAttachment["transcriptStatus"] | undefined;
  mine: boolean;
  testID: string;
}

/**
 * A voice note's transcript under the player: "Transcribing…" while it is made, then the text,
 * folded to three lines with "Show more" when it is longer. The bubble reads the whole transcript
 * to VoiceOver, so the toggle is for sight only.
 */
export function VoiceTranscript({ transcript, status, mine, testID }: VoiceTranscriptProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const [open, setOpen] = useState(false);
  // Lines the whole transcript takes at this width, from an unclamped copy laid out out of sight
  // (a clamped Text reports only its visible lines on Android).
  const [lines, setLines] = useState<number | null>(null);
  const fg = mine ? "text-primary-foreground" : undefined;
  const text = transcript?.trim();
  if (status === "pending" && !text) {
    return (
      <NativeText testID={testID} preset="caption" className={fg} style={mine ? { fontStyle: "italic", opacity: 0.85, paddingHorizontal: 8 } : { fontStyle: "italic", color: colors.secondaryLabel, paddingHorizontal: 8 }}>
        {copy.transcribing}
      </NativeText>
    );
  }
  if (!text) return null;
  const long = transcriptIsLong(text, lines);
  const textStyle = mine ? { fontSize: 15, lineHeight: 20 } : { fontSize: 15, lineHeight: 20, color: colors.label };
  return (
    <View testID={testID} style={{ paddingHorizontal: 8, alignItems: "flex-start" }}>
      <NativeText testID={`${testID}-text`} className={fg} numberOfLines={open || !long ? undefined : TRANSCRIPT_LINES} style={textStyle}>
        {text}
      </NativeText>
      <NativeText
        testID={`${testID}-measure`}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onTextLayout={(e: { nativeEvent: { lines: unknown[] } }) => setLines(e.nativeEvent.lines.length)}
        style={[textStyle, { position: "absolute", left: 8, right: 8, top: 0, opacity: 0 }]}
        pointerEvents="none"
      >
        {text}
      </NativeText>
      {long ? (
        <Pressable
          testID={`${testID}-toggle`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          hitSlop={{ top: 8, bottom: 8 }}
          style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}
        >
          <NativeText preset="caption" className={fg} style={mine ? { fontWeight: "600" } : { fontWeight: "600", color: colors.tint }}>
            {open ? copy.showLess : copy.showMore}
          </NativeText>
        </Pressable>
      ) : null}
    </View>
  );
}
