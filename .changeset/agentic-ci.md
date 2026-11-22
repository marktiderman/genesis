---
"@marktiderman/genesis-cli": minor
---

Agentic CI template (`genesis add template agentic-ci`): `.eas/workflows/agentic-ci.yml` and `.eas/agents/`, after Expo's Agentic CI. On the `Agent check` label or by hand, a coding agent tests a pull request on an Expo Simulators session (one session, with a maximum duration and an idle limit, recorded, always stopped), after the app's Maestro flows run there through agent-device, and comments a PASS or FAIL verdict with the recording and screenshots. The native starter ships it.
