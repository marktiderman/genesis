// NativeWind (Tailwind v3). `genesisNativewindContent` adds the Genesis React Native packages the
// app uses (ui-native, genesis-native: the update screens, the push prompt), wherever they are
// installed, so the classes inside them are generated. Metro reads those packages from `src`
// (their `react-native` export condition), so the app's NativeWind JSX transform applies to them.
// The Genesis NativeWind preset brings the token classes
// (role colors and their variables, radius scale, fonts) the ui-native components use. With your
// own brand, use `createGenesisNativewindPreset({ brand })` instead, with the brand you pass to
// GenesisNativeApp.
import { fileURLToPath } from "node:url";
import nativewindPreset from "nativewind/preset";
import { genesisNativewindContent, genesisNativewindPreset } from "@marktiderman/genesis-design-system/presets/nativewind";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", ...genesisNativewindContent({ root: fileURLToPath(new URL(".", import.meta.url)) })],
  presets: [nativewindPreset, genesisNativewindPreset],
};
