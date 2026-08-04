/**
 * Avatar — user/entity image with fallback initials.
 *
 * @stability Stable
 */
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { cn } from "../utils";

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
  testID?: string;
}

function NativeAvatar({
  className,
  src,
  alt,
  fallback,
  size = 40,
  ...props
}: NativeAvatarProps) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => { setHasError(false); }, [src]);
  const showImage = src && !hasError;

  return (
    <View
      className={cn(
        "items-center justify-center overflow-hidden rounded-full bg-muted",
        className
      )}
      style={[{ width: size, height: size }]}
      accessibilityLabel={alt || fallback || "Avatar"}
      {...props}
    >
      {showImage ? (
        <Image
          source={{ uri: src }}
          className="h-full w-full"
          resizeMode="cover"
          onError={() => setHasError(true)}
          accessibilityLabel={alt}
        />
      ) : (
        <Text
          className="text-sm font-medium text-muted-foreground"
          style={{
            fontSize: Math.round(size * 0.4),
            lineHeight: Math.round(size * 0.5),
          }}
        >
          {fallback || "?"}
        </Text>
      )}
    </View>
  );
}

export { NativeAvatar };
