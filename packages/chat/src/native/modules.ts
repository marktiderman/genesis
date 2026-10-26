/**
 * @feat:chat
 * The native modules chat can use, as the shapes it needs. The app passes the
 * real ones (each an optional peer); chat never imports them, so it builds and
 * runs without any of them, and the tests pass fakes:
 *
 *   import * as Audio from "expo-audio";                    // voice notes
 *   import * as ImagePicker from "expo-image-picker";       // photos and videos
 *   import * as Haptics from "expo-haptics";                // send and record
 *   import * as Clipboard from "expo-clipboard";            // copy, paste a picture
 *   import { KeyboardAvoidingView } from "react-native-keyboard-controller";
 *   import AsyncStorage from "@react-native-async-storage/async-storage"; // drafts
 *   import * as Sharing from "expo-sharing";                // share a photo
 *   import * as MediaLibrary from "expo-media-library";     // save a photo
 *   import NetInfo from "@react-native-community/netinfo";  // retry when back online
 *
 * FlashList and expo-image come from GenesisNativeApp's `modules` (genesis-ui-native's
 * GenesisModulesProvider), the same objects every Genesis list and image uses.
 * The shapes follow the SDK 58 packages' own type declarations.
 */
import type { ComponentType, ReactNode } from "react";

/** `RecorderState` from expo-audio (`recorder.getStatus()`). */
export interface RecorderStateLike {
  isRecording: boolean;
  durationMillis: number;
  /** dB, about -160…0, when `isMeteringEnabled`. */
  metering?: number;
  url: string | null;
}

/** `AudioRecorder` from expo-audio. */
export interface AudioRecorderLike {
  prepareToRecordAsync(options?: Record<string, unknown>): Promise<void>;
  record(): void;
  stop(): Promise<void>;
  getStatus(): RecorderStateLike;
  uri: string | null;
}

/** `AudioStatus` from expo-audio (`useAudioPlayerStatus`). Seconds. */
export interface AudioStatusLike {
  currentTime: number;
  duration: number;
  playing: boolean;
  didJustFinish: boolean;
  isLoaded: boolean;
  playbackRate: number;
}

/** `AudioPlayer` from expo-audio. */
export interface AudioPlayerLike {
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  setPlaybackRate(rate: number): void;
}

/** `import * as Audio from "expo-audio"` (SDK 58). */
export interface ExpoAudioLike {
  useAudioRecorder(options: Record<string, unknown>): AudioRecorderLike;
  useAudioPlayer(source: { uri: string } | null, options?: { updateInterval?: number }): AudioPlayerLike;
  useAudioPlayerStatus(player: AudioPlayerLike): AudioStatusLike;
  RecordingPresets: { HIGH_QUALITY: Record<string, unknown> };
  requestRecordingPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  setAudioModeAsync(mode: { allowsRecording?: boolean; playsInSilentMode?: boolean }): Promise<void>;
}

/** One picked file (`ImagePickerAsset`). */
export interface PickedAssetLike {
  uri: string;
  width?: number;
  height?: number;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string;
  /** Milliseconds, for a video. */
  duration?: number | null;
  type?: string | null;
}

export interface PickerResultLike {
  canceled: boolean;
  assets: PickedAssetLike[] | null;
}

/** `import * as ImagePicker from "expo-image-picker"`. */
export interface ImagePickerLike {
  launchImageLibraryAsync(options?: Record<string, unknown>): Promise<PickerResultLike>;
  launchCameraAsync?(options?: Record<string, unknown>): Promise<PickerResultLike>;
  requestCameraPermissionsAsync?(): Promise<{ granted: boolean }>;
}

/** `import * as Haptics from "expo-haptics"`. */
export interface HapticsLike {
  impactAsync(style?: never): Promise<void>;
  selectionAsync(): Promise<void>;
  notificationAsync(type?: never): Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown };
  NotificationFeedbackType: { Success: unknown; Warning: unknown; Error: unknown };
}

/** `import * as Clipboard from "expo-clipboard"`. */
export interface ClipboardLike {
  setStringAsync(text: string): Promise<boolean>;
  hasImageAsync?(): Promise<boolean>;
  /** `data` is a data URI (`data:image/png;base64,…`). */
  getImageAsync?(options: { format: "png" | "jpeg" }): Promise<{ data: string; size: { width: number; height: number } } | null>;
}

/** react-native-keyboard-controller's `KeyboardAvoidingView` (needs its `KeyboardProvider`, which GenesisNativeApp mounts). */
export type KeyboardAvoidingLike = ComponentType<{
  behavior?: "height" | "padding" | "position" | "translate-with-padding";
  keyboardVerticalOffset?: number;
  style?: unknown;
  children?: ReactNode;
  testID?: string;
}>;

/** Where drafts wait: AsyncStorage, or MMKV's async adapter. */
export interface DraftStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** For `clearDrafts` on sign-out. */
  getAllKeys?(): Promise<readonly string[]>;
  multiRemove?(keys: readonly string[]): Promise<void>;
}

/** `import * as Sharing from "expo-sharing"`: the system share sheet for a file on the phone. */
export interface SharingLike {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(url: string, options?: { mimeType?: string; UTI?: string; dialogTitle?: string }): Promise<void>;
}

/** `import * as MediaLibrary from "expo-media-library"`: save to Photos (asks for add-only access). */
export interface MediaLibraryLike {
  requestPermissionsAsync(writeOnly?: boolean): Promise<{ granted: boolean }>;
  saveToLibraryAsync(localUri: string): Promise<void>;
}

/** `NetInfo` from @react-native-community/netinfo: tells chat when the connection comes back. */
export interface NetInfoLike {
  addEventListener(listener: (state: { isConnected: boolean | null; isInternetReachable?: boolean | null }) => void): () => void;
}

/** Each optional: without one its feature is hidden (no mic without audio, no attach without a picker). */
export interface ChatNativeModules {
  audio?: ExpoAudioLike;
  imagePicker?: ImagePickerLike;
  haptics?: HapticsLike;
  clipboard?: ClipboardLike;
  keyboardAvoidingView?: KeyboardAvoidingLike;
  drafts?: DraftStorageLike;
  /** Share in the photo viewer (with `downloadFile` for photos not on the phone). */
  sharing?: SharingLike;
  /** Save in the photo viewer (with `downloadFile`). */
  mediaLibrary?: MediaLibraryLike;
  /**
   * Copies a photo from its signed link to the phone and returns the file:// URI, for sharing
   * and saving (expo-file-system: `(await File.downloadFileAsync(url, Paths.cache, { idempotent: true })).uri`).
   */
  downloadFile?: (url: string) => Promise<string>;
  /** Unsent messages are retried when the connection comes back (`ChatAutoRetry`). */
  netInfo?: NetInfoLike;
}

export type HapticEvent = "send" | "record-start" | "record-lock" | "record-cancel" | "select" | "error";

/** Plays a haptic when the app gave expo-haptics; never throws. */
export function haptic(haptics: HapticsLike | undefined, event: HapticEvent): void {
  if (!haptics) return;
  try {
    const style = (s: unknown) => s as never;
    const p =
      event === "send" || event === "record-lock"
        ? haptics.impactAsync(style(haptics.ImpactFeedbackStyle.Light))
        : event === "record-start"
          ? haptics.impactAsync(style(haptics.ImpactFeedbackStyle.Medium))
          : event === "select"
            ? haptics.selectionAsync()
            : haptics.notificationAsync(
                style(event === "error" ? haptics.NotificationFeedbackType.Error : haptics.NotificationFeedbackType.Warning),
              );
    void p?.catch?.(() => undefined);
  } catch {
    // A haptic is never worth an error.
  }
}
