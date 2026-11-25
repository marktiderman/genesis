---
"@marktiderman/genesis-ui-native": patch
---

`ScreenContainer`: a screen with a `testID` and a list as its body now collapses its iOS large title as the list scrolls. The static (non-scroll) body no longer carries a testID (`<testID>-body`): a View with a testID isn't flattened, and that extra native view between the safe area and the list stopped iOS finding the list's scroll view. The loading state's body keeps `<testID>-body`. A test that looked up `<testID>-body` on a static body should look up its own content instead.
