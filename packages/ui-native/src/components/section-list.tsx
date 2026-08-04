/**
 * SectionList header pattern — opinionated header style for
 * react-native SectionList rows.
 *
 * The full SectionList API stays with React Native; Genesis ships the
 * header component so consumers can pass it as `renderSectionHeader`
 * and get a consistent visual: muted background, uppercase tracking,
 * sticky-friendly padding.
 *
 * Pattern:
 *
 *   <SectionList
 *     sections={...}
 *     renderItem={({ item }) => <NativeListItem title={item.label} />}
 *     renderSectionHeader={({ section }) => (
 *       <NativeSectionListHeader title={section.title} />
 *     )}
 *   />
 *
 * @stability Beta
 */
import { Text, View } from "react-native";
import { cn } from "../utils";

export interface NativeSectionListHeaderProps {
  title: string;
  /** Optional trailing content (e.g., a count badge). */
  trailing?: React.ReactNode;
  className?: string;
  testID?: string;
}

export function NativeSectionListHeader({
  title,
  trailing,
  className,
  testID,
}: NativeSectionListHeaderProps) {
  return (
    <View
      testID={testID ?? "native-section-header"}
      accessibilityRole="header"
      className={cn(
        "flex-row items-center justify-between border-b border-border bg-muted px-4 py-2",
        className
      )}
    >
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </Text>
      {trailing}
    </View>
  );
}
