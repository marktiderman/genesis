/**
 * <TokenRow /> — single token visualization used across the tokens
 * viewer (Phase G.2).
 *
 * Three slots: a leading visual sample (color swatch / type sample /
 * spacing bar), the token's canonical name, and its raw value. The
 * Maestro tour uses a stable testID derived from the token name.
 *
 * @stability stable
 */
import { View, type ViewStyle } from "react-native";
import { NativeText } from "@marktiderman/genesis-ui-native";

export function TokenRow({
  name,
  value,
  sample,
  testID,
}: {
  name: string;
  value: string | number;
  sample: React.ReactNode;
  testID?: string;
}) {
  return (
    <View
      testID={testID ?? `token-row-${name}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: 56,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {sample}
      </View>
      <View style={{ flex: 1 }}>
        <NativeText preset="body-sm">{name}</NativeText>
        <NativeText preset="caption" className="text-muted-foreground">
          {String(value)}
        </NativeText>
      </View>
    </View>
  );
}

export function ColorSwatch({
  hex,
  size = 36,
  ringStyle,
}: {
  hex: string;
  size?: number;
  ringStyle?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 8,
          backgroundColor: hex,
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.08)",
        },
        ringStyle,
      ]}
    />
  );
}
