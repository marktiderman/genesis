import { playHaptic, type GenesisHapticsModule } from "@marktiderman/genesis-ui-native/hooks";

/** `import * as Haptics from "expo-haptics"`: genesis-ui-native's `GenesisHapticsModule`. */
export type HapticsLike = GenesisHapticsModule;

/** `vote`: a vote cast or taken back; `select`: a tab changed; `refused`: a vote the source turned down. */
export type ProductHapticEvent = "vote" | "select" | "refused";

const KIND = { vote: "light", select: "select", refused: "error" } as const;

/** Plays a haptic when the app gave expo-haptics; never throws, never rejects (genesis-ui-native's `playHaptic`). */
export function haptic(haptics: HapticsLike | undefined, event: ProductHapticEvent): void {
  playHaptic(haptics, KIND[event]);
}
