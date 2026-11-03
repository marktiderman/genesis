/**
 * NativeGalleryCard — a photo or video cover with an optional title line
 * under it, and slots over the picture for badges (top-left) and actions
 * (top-right). An album, a session recording, a product shot.
 *
 * The cover is `NativeImage` at `ratio` (4:3 by default); without `src`, or
 * while `loading`, it is a muted box with a `NativeSkeleton`. The whole card
 * is a button when `onPress` is given. Same props as the web `GalleryCard`.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";
import { NativeImage } from "./image";
import { NativeSkeleton } from "./skeleton";

export interface NativeGalleryCardProps {
  /** The cover picture. Without it the cover is a placeholder. */
  src?: string;
  alt?: string;
  title?: string;
  subtitle?: string;
  /** Over the cover, top-left (a `NativeBadge`, a `NativeLiveIndicator`). */
  badges?: ReactNode;
  /** Over the cover, top-right (an icon button, a menu). */
  actions?: ReactNode;
  /** Cover width ÷ height. Default 4/3. */
  ratio?: number;
  /** Draws the cover as a skeleton. */
  loading?: boolean;
  onPress?: () => void;
  className?: string;
  testID?: string;
}

export function NativeGalleryCard({
  src,
  alt,
  title,
  subtitle,
  badges,
  actions,
  ratio = 4 / 3,
  loading = false,
  onPress,
  className,
  testID = "native-gallery-card",
}: NativeGalleryCardProps) {
  const aspectRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 4 / 3;
  const placeholder = loading || !src;
  const body = (
    <>
      <View testID={`${testID}-cover`} className="relative w-full overflow-hidden bg-muted" style={{ aspectRatio }}>
        {placeholder ? (
          <NativeSkeleton testID={`${testID}-skeleton`} className="absolute inset-0 h-full w-full rounded-none" />
        ) : (
          <NativeImage src={src} alt={alt} className="h-full w-full" />
        )}
        {badges ? (
          <View testID={`${testID}-badges`} className="absolute left-2 top-2 flex-row items-center gap-1">
            {badges}
          </View>
        ) : null}
        {actions ? (
          <View testID={`${testID}-actions`} className="absolute right-2 top-2 flex-row items-center gap-1">
            {actions}
          </View>
        ) : null}
      </View>
      {title || subtitle ? (
        <View testID={`${testID}-footer`} className="gap-0.5 px-3 py-2">
          {title ? (
            <Text testID={`${testID}-title`} numberOfLines={1} className="text-sm font-semibold text-foreground">
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text testID={`${testID}-subtitle`} numberOfLines={1} className="text-xs text-muted-foreground">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
  const classes = cn("overflow-hidden rounded-lg border border-border bg-card", className);

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title ?? alt}
        accessibilityHint={subtitle}
        accessibilityState={loading ? { busy: true } : undefined}
        onPress={onPress}
        className={classes}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} accessibilityState={loading ? { busy: true } : undefined} className={classes}>
      {body}
    </View>
  );
}
