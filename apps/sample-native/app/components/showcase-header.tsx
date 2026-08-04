/**
 * <ShowcaseHeader /> — consistent header for every Phase G showcase
 * screen. Renders a "what + why" pair plus an @stability badge so the
 * portfolio reads like Polaris/Primer references.
 *
 * @stability stable
 */
import { View } from "react-native";
import { NativeText, NativeBadge } from "@marktiderman/genesis-ui-native";

export type Stability = "stable" | "beta" | "deprecated" | "planned";

const VARIANT: Record<Stability, "default" | "secondary" | "destructive" | "outline"> = {
  stable: "default",
  beta: "secondary",
  deprecated: "destructive",
  planned: "outline",
};

export function ShowcaseHeader({
  title,
  what,
  why,
  stability = "stable",
  testID,
}: {
  title: string;
  what: string;
  why?: string;
  stability?: Stability;
  testID?: string;
}) {
  return (
    <View testID={testID ?? "showcase-header"} style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <NativeText preset="h2">{title}</NativeText>
        <NativeBadge variant={VARIANT[stability]}>@{stability}</NativeBadge>
      </View>
      <NativeText preset="body-sm">{what}</NativeText>
      {why ? (
        <NativeText preset="caption" className="text-muted-foreground">
          {why}
        </NativeText>
      ) : null}
    </View>
  );
}
