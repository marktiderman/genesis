---
"@marktiderman/genesis-native": patch
---

Push block: no more re-registering in a loop once notifications are allowed. Fetching the Expo token fetches the device token, and expo-notifications tells the push token listener each time, changed or not; the block forced a registration on every one (about 330 a minute on a simulator). An unchanged token is now ignored, the first one only confirms the registration, and a different one is a rotation.
