/**
 * NativeImage — a remote picture (thumbnail, cover, photo) with caching.
 *
 * Draws with expo-image when the app passes it (`modules.image` on
 * `GenesisModulesProvider`): cached in memory and on disk, an optional
 * blurhash/thumbhash `placeholder`, a cross-fade that Reduce Motion turns
 * off, and a `recyclingKey` (the URL by default) so a recycled FlashList row
 * never flashes the previous picture. A `cacheKey` caches the picture under a
 * stable key instead of its URL, for signed URLs that rotate (a new expiry or
 * signature would otherwise miss the disk cache and download it again).
 * Without it, React Native's `Image`.
 *
 * Give it a size (className or `width`/`height`). Decorative unless `alt` is
 * given.
 *
 * @stability Beta
 */
import { Image, View } from "react-native";
import { cn } from "../utils";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useGenesisModules } from "../native-modules";

export interface NativeImageProps {
  src: string;
  /** Read by screen readers. Without it the picture is decorative. */
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  /** Default `"cover"`. */
  contentFit?: "cover" | "contain";
  /** expo-image only: `{ blurhash }` or `{ thumbhash }` shown while loading. */
  placeholder?: { blurhash: string } | { thumbhash: string };
  /**
   * expo-image only: caches the picture under this key instead of its URL, so a signed URL
   * that rotates (a new expiry or signature for the same file) still hits the memory and disk
   * cache. Use a key that names the file, such as its storage path or id.
   */
  cacheKey?: string;
  /** expo-image only: resets the view when it changes (recycled rows). Default `cacheKey`, then `src`. */
  recyclingKey?: string;
  /** expo-image only: load order among images. */
  priority?: "low" | "normal" | "high";
  /** The picture couldn't be loaded (draw a fallback). */
  onError?: () => void;
  testID?: string;
}

const FILL = { position: "absolute" as const, top: 0, right: 0, bottom: 0, left: 0 };

export function NativeImage({
  src,
  alt,
  className,
  width,
  height,
  contentFit = "cover",
  placeholder,
  cacheKey,
  recyclingKey,
  priority,
  onError,
  testID,
}: NativeImageProps) {
  const { image: ExpoImage } = useGenesisModules();
  const reducedMotion = useReducedMotion();
  const a11y = alt
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: alt }
    : { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };
  return (
    <View
      {...a11y}
      testID={testID}
      className={cn("overflow-hidden bg-muted", className)}
      style={width !== undefined || height !== undefined ? { width, height } : undefined}
    >
      {ExpoImage ? (
        <ExpoImage
          testID={testID ? `${testID}-image` : undefined}
          accessible={false}
          source={cacheKey ? { uri: src, cacheKey } : { uri: src }}
          style={FILL}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          placeholder={placeholder}
          placeholderContentFit={contentFit}
          transition={reducedMotion ? null : 150}
          // A rotated URL for the same picture keeps the view, so it doesn't flash.
          recyclingKey={recyclingKey ?? cacheKey ?? src}
          priority={priority}
          onError={onError}
        />
      ) : (
        <Image
          testID={testID ? `${testID}-image` : undefined}
          accessible={false}
          source={{ uri: src }}
          style={FILL}
          resizeMode={contentFit}
          onError={onError}
        />
      )}
    </View>
  );
}
