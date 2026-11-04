---
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-chat": minor
---

`NativeButton` answers a touch through `usePressFeedback`, like every Genesis pressable: what's inside it shrinks a little while held, or dims under Reduce Motion. Its `haptic` prop is unchanged.

`sentBubbleColor(roles)` (genesis-ui-native/hooks) names the colour of a message you sent, in one place, for `ThreadPage` and genesis-chat's bubble. It's still `tint`, so nothing changes on screen.

genesis-chat's native haptics play through `playHaptic`, and `ChatNativeProvider` uses the module the app gave Genesis when it gave chat none, so it's passed once. What plays at each moment is unchanged.
