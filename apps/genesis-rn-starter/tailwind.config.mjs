// NativeWind (Tailwind v3). The Genesis preset brings the token classes
// (semantic colors, radius scale, fonts) the ui-native components use.
import nativewindPreset from "nativewind/preset";
import { genesisPreset } from "@marktiderman/genesis-design-system/presets/tailwind";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./node_modules/@marktiderman/genesis-ui-native/src/**/*.{ts,tsx}", "../../packages/ui-native/src/**/*.{ts,tsx}"],
  presets: [nativewindPreset, genesisPreset],
};
