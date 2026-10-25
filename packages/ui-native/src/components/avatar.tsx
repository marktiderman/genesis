/**
 * Avatar — user/entity image with fallback initials.
 *
 * Draws with expo-image when the app passes it (`modules.image` on
 * `GenesisModulesProvider`): cached in memory and on disk, a cross-fade that
 * Reduce Motion turns off, an optional blurhash/thumbhash `placeholder`, and
 * a `recyclingKey` (the image URL by default) so a recycled list row never
 * shows the previous person's picture. Without it, React Native's `Image`.
 * The initials show until the picture loads, and again if it fails.
 *
 * @stability Stable
 */
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { cn } from "../utils";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useGenesisModules } from "../native-modules";

const FILL = { position: "absolute" as const, top: 0, right: 0, bottom: 0, left: 0 };

export interface NativeAvatarProps {
  className?: string;
  /** Image URL */
  src?: string | null;
  /** Alt text for accessibility */
  alt?: string;
  /** Fallback text (typically initials, e.g. "MT") */
  fallback?: string;
  /** Size in pixels. Defaults to 40. Use className for NativeWind sizing. */
  size?: number;
  /**
   * expo-image only: a blurhash or thumbhash shown while the picture loads,
   * as expo-image's `placeholder` takes it (`{ blurhash }`, `{ thumbhash }`).
   */
  placeholder?: { blurhash: string } | { thumbhash: string };
  /**
   * expo-image only: resets the view when it changes, for rows a recycling
   * list (FlashList) reuses. Default the image URL.
   */
  recyclingKey?: string;
  testID?: string;
}

function NativeAvatar({
  className,
  src,
  alt,
  fallback,
  size = 40,
  placeholder,
  recyclingKey,
  testID,
}: NativeAvatarProps) {
  const { image: ExpoImage } = useGenesisModules();
  const reducedMotion = useReducedMotion();
  // Which URL loaded or failed, not a flag: a row FlashList recycles for
  // someone else gets the right state on its first frame, with no reset.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const showImage = !!src && failedSrc !== src;
  const loaded = !!src && loadedSrc === src;
  const imageProps = {
    accessible: false,
    onError: () => setFailedSrc(src ?? null),
    onLoad: () => setLoadedSrc(src ?? null),
  };

  return (
    <View
      className={cn(
        "items-center justify-center overflow-hidden rounded-full bg-muted",
        className
      )}
      style={[{ width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={alt || fallback || "Avatar"}
      testID={testID}
    >
      {!showImage || !loaded ? (
        <Text
          className="text-sm font-medium text-muted-foreground"
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{
            fontSize: Math.round(size * 0.4),
            lineHeight: Math.round(size * 0.5),
          }}
        >
          {fallback || "?"}
        </Text>
      ) : null}
      {showImage ? (
        ExpoImage ? (
          <ExpoImage
            {...imageProps}
            testID={testID ? `${testID}-image` : undefined}
            source={{ uri: src }}
            style={FILL}
            contentFit="cover"
            cachePolicy="memory-disk"
            placeholder={placeholder}
            placeholderContentFit="cover"
            transition={reducedMotion ? null : 150}
            recyclingKey={recyclingKey ?? src}
          />
        ) : (
          <Image
            {...imageProps}
            testID={testID ? `${testID}-image` : undefined}
            source={{ uri: src }}
            style={FILL}
            resizeMode="cover"
          />
        )
      ) : null}
    </View>
  );
}

export { NativeAvatar };
