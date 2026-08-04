/**
 * <ComingSoonScreen /> — placeholder body used by Phase G routes whose
 * real implementations are gated on a downstream mega-PR (G-MEGA-1
 * components, G-MEGA-2 layouts).
 *
 * The placeholder intentionally renders something visually meaningful
 * so the IA + tour flow stabilize now, ahead of the underlying work.
 *
 * @stability beta
 */
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeBadge,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
  NativeAlert,
  NativeAlertTitle,
  NativeAlertDescription,
} from "@marktiderman/genesis-ui-native";

export interface ComingSoonScreenProps {
  title: string;
  spec: string;
  blockedBy: "G-MEGA-1" | "G-MEGA-2";
  what: string;
  bullets: string[];
  testID?: string;
}

export function ComingSoonScreen(props: ComingSoonScreenProps) {
  const { title, spec, blockedBy, what, bullets, testID } = props;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView
        contentContainerClassName="p-4"
        testID={testID ?? `coming-soon-${spec.toLowerCase()}`}
      >
        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <NativeBadge variant="outline">{spec}</NativeBadge>
              <NativeBadge variant="secondary">@beta</NativeBadge>
            </View>
            <NativeText preset="h2">{title}</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              {what}
            </NativeText>
          </View>

          <NativeAlert variant="warning">
            <NativeAlertTitle variant="warning">
              Coming with {blockedBy}
            </NativeAlertTitle>
            <NativeAlertDescription variant="warning">
              This route is reserved so the portfolio IA stays stable.
              Genesis ships {spec} as part of {blockedBy}; once that PR
              lands, the placeholder swaps for the real implementation
              with no route changes.
            </NativeAlertDescription>
          </NativeAlert>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>What this will do</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 6 }}>
                {bullets.map((bullet, i) => (
                  <NativeText key={i} preset="body-sm">
                    · {bullet}
                  </NativeText>
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
