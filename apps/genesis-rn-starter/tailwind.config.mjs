// NativeWind (Tailwind v3). `content` lists the Genesis packages whose components carry classes
// (ui-native, and genesis-native: the update screens and the devtools overlay).
// The Genesis NativeWind preset brings the token classes
// (role colors and their variables, radius scale, fonts) the ui-native components use.
import nativewindPreset from "nativewind/preset";
import { genesisNativewindPreset } from "@marktiderman/genesis-design-system/presets/nativewind";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./node_modules/@marktiderman/genesis-ui-native/src/**/*.{ts,tsx}", "../../packages/ui-native/src/**/*.{ts,tsx}", "./node_modules/@marktiderman/genesis-native/dist/**/*.js", "../../packages/native/src/**/*.{ts,tsx}"],
  presets: [nativewindPreset, genesisNativewindPreset],
};
