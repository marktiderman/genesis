---
"@marktiderman/genesis-cli": minor
---

Agentic CI template (`genesis add template agentic-ci`): `.eas/workflows/agentic-ci.yml` and `.eas/agents/`, after Expo's Agentic CI. On the `Agent check` label or by hand, a coding agent tests a pull request on an Expo Simulators session (one session, with a maximum duration and an idle limit, recorded, always stopped), after the app's Maestro flows run there through agent-device, and comments a PASS or FAIL verdict with the recording and screenshots. The native starter ships it. The agent's only shell command is `.eas/agents/device.sh`, a fixed list of agent-device commands run from a read-only copy outside the project; it reads only the project and writes only its evidence, and the evidence is uploaded only once redacted. Not yet run in EAS: run it by hand on a test branch first.
