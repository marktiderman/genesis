import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
  NativeBadge,
  NativeAlert,
  NativeAlertTitle,
  NativeAlertDescription,
} from "@marktiderman/genesis-ui-native";

const STANDARDS = [
  {
    title: "Design opinions",
    href: "docs/prds/PRD-07-genesis-consumption-architecture/standards/design-opinions.md",
    summary:
      "Premium animations + haptics on by default. Apple HIG on iOS, Material 3 on Android. SF Symbols on iOS via expo-symbols. Reduced-motion respect via useReducedMotion(). 44pt minimum touch target. testID required on every interactive primitive. Simpler is the default — F4-locked.",
  },
  {
    title: "Usage doctrine",
    href: "docs/prds/PRD-07-genesis-consumption-architecture/standards/usage-doctrine.md",
    summary:
      "Reuse > Extend > Create. Decision tree: when to reuse a Genesis primitive, when to wrap, when to add to @<consumer>/components, when to escalate as an RFC. Burden of proof on the author for any Create path.",
  },
  {
    title: "Upgrade process",
    href: "docs/prds/PRD-07-genesis-consumption-architecture/standards/upgrade-process.md",
    summary:
      "How to upgrade @marktiderman/genesis-* in a consumer (changeset → consume → smoke check → ship), and how to expand Genesis itself (RFC → land → publish → consumers pull on schedule). Pull, never push.",
  },
  {
    title: "Agent usage",
    href: "docs/prds/PRD-07-genesis-consumption-architecture/standards/agent-usage.md",
    summary:
      "Instructions agents read on session start. Before creating any component, run /design-check. Before adding inline styles, check token names. Before opting out of Genesis, justify in the PR description.",
  },
];

export default function StandardsIndex() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="standards-index">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h1">Standards</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              The four standards every Genesis consumer follows. Sourced from
              docs/prds/PRD-07-genesis-consumption-architecture/standards/.
            </NativeText>
          </View>

          <NativeAlert variant="info" testID="standards-info">
            <NativeAlertTitle variant="info">
              Pull, never push
            </NativeAlertTitle>
            <NativeAlertDescription variant="info">
              Genesis ships breaking changes only at minor versions on 0.x.
              Consumer teams pull updates on their own cadence — Genesis
              never reaches into a consumer repo to change code.
            </NativeAlertDescription>
          </NativeAlert>

          {STANDARDS.map((s) => (
            <NativeCard key={s.title} testID={`standards-${s.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <NativeCardHeader>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <NativeCardTitle>{s.title}</NativeCardTitle>
                  <NativeBadge variant="outline">@stable</NativeBadge>
                </View>
              </NativeCardHeader>
              <NativeCardContent>
                <View style={{ gap: 6 }}>
                  <NativeText preset="body-sm" className="text-muted-foreground">
                    {s.summary}
                  </NativeText>
                  <NativeText preset="caption" className="text-muted-foreground">
                    {s.href}
                  </NativeText>
                </View>
              </NativeCardContent>
            </NativeCard>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
