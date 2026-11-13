/**
 * Carousel — slides a person swipes through, one page at a time: the twin of genesis-ui's
 * Carousel (Embla on the web). Each child is a slide, as full width as the carousel.
 *
 * Swiping pages natively (a paging ScrollView); the dots and the previous and next buttons move
 * it too, and a screen reader adjusts it (swipe up or down on it) and hears "Slide 2 of 5". Which
 * slide a scroll rests on comes from genesis-core's `carouselIndex`.
 *
 * For photos with zoom and a full-screen view, use NativeLightbox; a carousel is for cards,
 * onboarding pages and featured content.
 *
 * @stability Beta
 */
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { carouselIndex, carouselOffset } from "@marktiderman/genesis-core/headless";
import { cn } from "../utils";

export interface NativeCarouselProps {
  /** The slides. */
  children: ReactNode;
  /** The slide shown, to control it. */
  index?: number;
  /** The slide shown first, uncontrolled. Default 0. */
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Dots under the slides. Default true. */
  showDots?: boolean;
  /** Previous and next buttons. Default false (a swipe is the phone's way). */
  showControls?: boolean;
  /** What the carousel shows, read by screen readers ("Featured classes"). */
  accessibilityLabel?: string;
  /** Words: "Slide {index} of {count}", and the buttons'. */
  labels?: { slide?: string; previous?: string; next?: string };
  className?: string;
  slideClassName?: string;
  testID?: string;
}

export function NativeCarousel({
  children,
  index: indexProp,
  defaultIndex = 0,
  onIndexChange,
  showDots = true,
  showControls = false,
  accessibilityLabel,
  labels = {},
  className,
  slideClassName,
  testID = "native-carousel",
}: NativeCarouselProps) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const scroll = useRef<{ scrollTo?: (to: { x?: number; y?: number; animated?: boolean }) => void } | null>(null);
  const [width, setWidth] = useState(0);
  const [indexState, setIndexState] = useState(defaultIndex);
  const index = Math.max(0, Math.min(count - 1, indexProp ?? indexState));
  const slideWords = (i: number) => (labels.slide ?? "Slide {index} of {count}").replace("{index}", String(i + 1)).replace("{count}", String(count));

  const settle = (next: number) => {
    if (next === index) return;
    if (indexProp === undefined) setIndexState(next);
    onIndexChange?.(next);
  };
  const goTo = (next: number) => {
    const target = Math.max(0, Math.min(count - 1, next));
    scroll.current?.scrollTo?.({ x: carouselOffset(target, width), animated: true });
    settle(target);
  };

  // A controlled index that changes from outside scrolls the slides there.
  useEffect(() => {
    if (width > 0) scroll.current?.scrollTo?.({ x: carouselOffset(index, width), animated: false });
  }, [index, width]);

  return (
    <View
      testID={testID}
      className={cn("w-full", className)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: slideWords(index) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e: { nativeEvent: { actionName: string } }) => goTo(index + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      onLayout={(e: { nativeEvent?: { layout?: { width?: number } } }) => setWidth(e.nativeEvent?.layout?.width ?? 0)}
    >
      <ScrollView
        ref={scroll}
        testID={`${testID}-pages`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e: { nativeEvent: { contentOffset: { x: number } } }) => settle(carouselIndex(e.nativeEvent.contentOffset.x, width, count))}
      >
        {slides.map((slide, i) => (
          <View
            key={i}
            testID={`${testID}-slide-${i}`}
            style={width ? { width } : undefined}
            className={cn("w-full", slideClassName)}
            importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}
            accessibilityElementsHidden={i !== index}
          >
            {slide}
          </View>
        ))}
      </ScrollView>
      {showDots || showControls ? (
        <View className="mt-3 flex-row items-center justify-center gap-3">
          {showControls ? (
            <ArrowButton testID={`${testID}-previous`} label={labels.previous ?? "Previous slide"} glyph="‹" disabled={index === 0} onPress={() => goTo(index - 1)} />
          ) : null}
          {showDots ? (
            <View className="flex-row items-center gap-1.5">
              {slides.map((_, i) => (
                <Pressable
                  key={i}
                  testID={`${testID}-dot-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={slideWords(i)}
                  accessibilityState={{ selected: i === index }}
                  hitSlop={8}
                  onPress={() => goTo(i)}
                  className={cn("h-2 rounded-full", i === index ? "w-5 bg-primary" : "w-2 bg-muted-foreground/40")}
                />
              ))}
            </View>
          ) : null}
          {showControls ? (
            <ArrowButton testID={`${testID}-next`} label={labels.next ?? "Next slide"} glyph="›" disabled={index >= count - 1} onPress={() => goTo(index + 1)} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ArrowButton({ label, glyph, disabled, onPress, testID }: { label: string; glyph: string; disabled: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn("h-9 w-9 items-center justify-center rounded-full border border-border bg-background", disabled && "opacity-40")}
    >
      <Text className="text-lg text-foreground">{glyph}</Text>
    </Pressable>
  );
}
