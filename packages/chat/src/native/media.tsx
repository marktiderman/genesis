/**
 * @feat:chat
 * Pictures and files in a message: photos as a grid of NativeImage (expo-image
 * when the app gave it) over signed links from `useFileUrls`, a local preview
 * while one still uploads, a tap opening the full-screen viewer; voice notes
 * as VoiceNotePlayer; other files as a row with their name.
 */
import { Pressable, View, useWindowDimensions } from "react-native";
import { NativeIcon, NativeImage, NativeSheet, NativeText } from "@marktiderman/genesis-ui-native/components";
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
          <VoiceNotePlayer key={a.key} id={a.key} uri={a.uri} durationMs={a.durationMs} waveform={a.waveform} mine={mine} testID={`${testID}-voice-${i}`} />
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

export interface ChatMediaViewerProps {
  /** The picture to show; null closes the viewer. */
  image: { uri: string; alt: string } | null;
  onClose: () => void;
  testID?: string;
}

/** A picture at full size, in a sheet: swipe down or tap Close. */
export function ChatMediaViewer({ image, onClose, testID = "chat-media-viewer" }: ChatMediaViewerProps) {
  const { copy } = useChatNative();
  const { width, height } = useWindowDimensions();
  return (
    <NativeSheet open={image !== null} onOpenChange={(open) => (open ? undefined : onClose())} testID={testID}>
      <View style={{ alignItems: "flex-end" }}>
        <Pressable
          testID={`${testID}-close`}
          accessibilityRole="button"
          accessibilityLabel={copy.closeViewer}
          onPress={onClose}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <NativeIcon name="close" size={22} />
        </Pressable>
      </View>
      {image ? (
        <View style={{ alignItems: "center" }}>
          <NativeImage src={image.uri} alt={image.alt} width={width - 32} height={Math.round(height * 0.72)} contentFit="contain" testID={`${testID}-image`} />
        </View>
      ) : null}
    </NativeSheet>
  );
}

