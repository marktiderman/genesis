/**
 * @feat:chat
 * The photo viewer: a message's photos full screen in genesis-ui-native's
 * `NativeLightbox` (swiped left and right, pinched or double-tapped to zoom,
 * pulled down or Close to leave, an adjustable pager for VoiceOver and
 * TalkBack). Chat adds its words, and Share and Save when the app passed
 * expo-sharing or expo-media-library (with `downloadFile` for photos that are
 * only a signed link).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  NativeIcon,
  NativeLightbox,
  NativeText,
  lightboxPanLimit,
  lightboxPinchScale,
  lightboxShouldDismiss,
  lightboxTouchDistance,
  LIGHTBOX_DISMISS_DISTANCE,
  LIGHTBOX_DISMISS_VELOCITY,
  LIGHTBOX_DOUBLE_TAP_MS,
  LIGHTBOX_MAX_ZOOM,
  type GalleryItem,
  type NativeIconName,
} from "@marktiderman/genesis-ui-native/components";
import type { ChatMessage } from "../core/types";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { fromServer, type BubbleAttachment } from "./media";
import { haptic } from "./modules";

export interface ChatPhoto {
  key: string;
  /** A signed link or a file on the phone. */
  uri: string;
  /** What a screen reader says for it. */
  alt: string;
}

export interface ChatPhotoViewerProps {
  /** The photos to page through; null closes the viewer. */
  photos: readonly ChatPhoto[] | null;
  /** The one to open at. Default the first. */
  initialIndex?: number;
  onClose: () => void;
  testID?: string;
}

/** @deprecated Use `LIGHTBOX_DISMISS_DISTANCE` from `@marktiderman/genesis-ui-native/components`. */
export const DISMISS_DISTANCE = LIGHTBOX_DISMISS_DISTANCE;
/** @deprecated Use `LIGHTBOX_DISMISS_VELOCITY` from `@marktiderman/genesis-ui-native/components`. */
export const DISMISS_VELOCITY = LIGHTBOX_DISMISS_VELOCITY;
/** @deprecated Use `LIGHTBOX_MAX_ZOOM` from `@marktiderman/genesis-ui-native/components`. */
export const MAX_ZOOM = LIGHTBOX_MAX_ZOOM;
/** @deprecated Use `LIGHTBOX_DOUBLE_TAP_MS` from `@marktiderman/genesis-ui-native/components`. */
export const DOUBLE_TAP_MS = LIGHTBOX_DOUBLE_TAP_MS;
/** @deprecated Use `lightboxShouldDismiss` from `@marktiderman/genesis-ui-native/components`. */
export const shouldDismiss = lightboxShouldDismiss;
/** @deprecated Use `lightboxPinchScale` from `@marktiderman/genesis-ui-native/components`. */
export const pinchScale = lightboxPinchScale;
/** @deprecated Use `lightboxTouchDistance` from `@marktiderman/genesis-ui-native/components`. */
export const touchDistance = lightboxTouchDistance;
/** @deprecated Use `lightboxPanLimit` from `@marktiderman/genesis-ui-native/components`. */
export const panLimit = lightboxPanLimit;

/** A file on the phone (a photo still sending), not a link. */
export function isLocalUri(uri: string): boolean {
  return /^(file|ph|content|assets-library):/.test(uri);
}

/**
 * Chat's photos full screen: genesis-ui-native's `NativeLightbox` (pinch and double-tap zoom, pull
 * down to close, an adjustable pager), with chat's words and its Save and Share buttons when the
 * app passes `mediaLibrary` and `sharing` to `ChatNativeProvider`.
 */
export function ChatPhotoViewer({ photos, initialIndex = 0, onClose, testID = "chat-photo-viewer" }: ChatPhotoViewerProps) {
  const { copy, modules } = useChatNative();
  const [index, setIndex] = useState(initialIndex);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const items = useMemo<GalleryItem[]>(() => (photos ?? []).map((p) => ({ id: p.key, src: p.uri, alt: p.alt })), [photos]);

  // Each opening starts at its photo, with no notice or busy state left from the last one.
  useEffect(() => {
    if (!photos) return;
    setIndex(initialIndex);
    setNotice(null);
    setBusy(false);
  }, [photos, initialIndex]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const list = photos ?? [];
  // A copy on the phone for sharing and saving: a local file as is, a signed link through downloadFile.
  const local = async (uri: string) => (isLocalUri(uri) ? uri : modules.downloadFile ? modules.downloadFile(uri) : null);
  const reachable = Boolean(modules.downloadFile) || list.every((p) => isLocalUri(p.uri));
  const canShare = Boolean(modules.sharing) && reachable;
  const canSave = Boolean(modules.mediaLibrary) && reachable;

  const run = useCallback(
    async (what: "share" | "save", uri: string) => {
      if (busy) return;
      setBusy(true);
      try {
        if (what === "save") {
          const lib = modules.mediaLibrary!;
          const permission = await lib.requestPermissionsAsync(true);
          if (!permission.granted) {
            setNotice(copy.photosDenied);
            return;
          }
          const file = await local(uri);
          if (!file) throw new Error("no copy on the phone");
          await lib.saveToLibraryAsync(file);
          haptic(modules.haptics, "send");
          setNotice(copy.photoSaved);
        } else {
          const sharing = modules.sharing!;
          if (!(await sharing.isAvailableAsync())) throw new Error("sharing unavailable");
          const file = await local(uri);
          if (!file) throw new Error("no copy on the phone");
          await sharing.shareAsync(file, { dialogTitle: copy.sharePhoto });
        }
      } catch {
        haptic(modules.haptics, "error");
        setNotice(copy.actionFailed);
      } finally {
        setBusy(false);
      }
    },
    [busy, modules, copy],
  );

  return (
    <NativeLightbox
      open={photos != null && photos.length > 0}
      onOpenChange={(open) => !open && onClose()}
      items={items}
      index={index}
      onIndexChange={setIndex}
      labels={{
        close: copy.closeViewer,
        position: (n, count) => fill(copy.photoOf, { n, count }),
        pagerHint: copy.viewerHint,
      }}
      renderActions={(item) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {canSave ? <ViewerButton icon="download" label={copy.savePhoto} onPress={() => void run("save", item.src)} disabled={busy} testID={`${testID}-save`} /> : null}
          {canShare ? <ViewerButton icon="share" label={copy.sharePhoto} onPress={() => void run("share", item.src)} disabled={busy} testID={`${testID}-share`} /> : null}
        </View>
      )}
      // The result of Save or Share shows where the caption goes.
      renderCaption={() =>
        notice ? (
          <View accessibilityLiveRegion="assertive" testID={`${testID}-notice`} style={{ alignSelf: "center", backgroundColor: "rgba(40,40,40,0.92)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 }}>
            <NativeText style={{ color: "#FFFFFF", textAlign: "center" }}>{notice}</NativeText>
          </View>
        ) : null
      }
      testID={testID}
    />
  );
}

function ViewerButton({ icon, label, onPress, disabled = false, testID }: { icon: NativeIconName; label: string; onPress: () => void; disabled?: boolean; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)", opacity: disabled ? 0.5 : 1 }}
    >
      <NativeIcon name={icon} size={22} color="#FFFFFF" />
    </Pressable>
  );
}

/**
 * The photos of the message a tapped photo belongs to, and where it is among them, for
 * `ChatPhotoViewer`: swiping goes through that message's photos. A photo in no message
 * (one still sending, shown from the phone) opens alone.
 */
export function galleryFor(
  messages: readonly ChatMessage[],
  urls: Record<string, string>,
  uri: string,
  alt: string,
  label: (a: BubbleAttachment) => string,
): { photos: ChatPhoto[]; index: number } {
  for (const m of messages) {
    const images = m.attachments.filter((a) => a.kind === "image").map((a) => fromServer(a, urls));
    if (!images.some((a) => a.uri === uri)) continue;
    const photos = images.filter((a): a is BubbleAttachment & { uri: string } => Boolean(a.uri)).map((a) => ({ key: a.key, uri: a.uri, alt: label(a) }));
    return { photos, index: Math.max(0, photos.findIndex((p) => p.uri === uri)) };
  }
  return { photos: [{ key: uri, uri, alt }], index: 0 };
}

export interface ChatMediaViewerProps {
  /** The picture to show; null closes the viewer. */
  image: { uri: string; alt: string } | null;
  onClose: () => void;
  testID?: string;
}

/** One picture in the full-screen viewer (`ChatPhotoViewer` pages through several). */
export function ChatMediaViewer({ image, onClose, testID = "chat-media-viewer" }: ChatMediaViewerProps) {
  const photos = useMemo(() => (image ? [{ key: image.uri, uri: image.uri, alt: image.alt }] : null), [image]);
  return <ChatPhotoViewer photos={photos} onClose={onClose} testID={testID} />;
}
