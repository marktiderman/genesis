import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeProgress,
  NativeSkeleton,
} from "@marktiderman/genesis-ui-native";
import { ShowcaseHeader } from "../components/showcase-header";

/**
 * Showcase: NativeProgress + NativeSkeleton — fixed values for stable
 * snapshot diffing. Reduced-motion mode should suppress shimmer
 * animation on Skeleton.
 *
 * @stability stable
 */
export default function ProgressShowcase() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="showcase-progress">
        <View style={{ gap: 16 }}>
          <ShowcaseHeader
            title="Progress & Skeleton"
            what="Determinate progress bar and content placeholders for loading states."
            why="Skeleton respects the Reduce Motion preference — shimmer animation is suppressed when the user has it on."
            stability="stable"
          />

          <View style={{ gap: 8 }}>
            <NativeText preset="body-sm">0%</NativeText>
            <NativeProgress value={0} testID="progress-0" />
            <NativeText preset="body-sm">25%</NativeText>
            <NativeProgress value={25} testID="progress-25" />
            <NativeText preset="body-sm">50%</NativeText>
            <NativeProgress value={50} testID="progress-50" />
            <NativeText preset="body-sm">75%</NativeText>
            <NativeProgress value={75} testID="progress-75" />
            <NativeText preset="body-sm">100%</NativeText>
            <NativeProgress value={100} testID="progress-100" />
          </View>

          <View style={{ gap: 8 }}>
            <NativeText preset="h4">Skeleton</NativeText>
            <NativeSkeleton className="h-6 w-3/4" testID="skeleton-line" />
            <NativeSkeleton className="h-6 w-1/2" testID="skeleton-line-short" />
            <NativeSkeleton className="h-24 w-full" testID="skeleton-block" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
