// NativeWind/Tailwind v3 config — ESM form (`.mjs`) so we can import the
// ESM-only `genesisPreset` from `@marktiderman/genesis-design-system`. Without
// this preset the Genesis token extensions (semantic colors, radius scale,
// font families) wouldn't reach the NativeWind runtime — sample-native
// is the reference consumer, so the preset has to be wired here.
import nativewindPreset from "nativewind/preset";
import { genesisPreset } from "@marktiderman/genesis-design-system/presets/tailwind";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "../../packages/ui-native/src/**/*.{ts,tsx}"],
  presets: [nativewindPreset, genesisPreset],
  theme: {
    extend: {},
  },
  plugins: [],
};
