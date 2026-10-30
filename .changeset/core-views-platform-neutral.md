---
"@marktiderman/genesis-core": minor
---

New doctor rule `core/views-stay-platform-neutral` (warn): a `*.view.ts` file, a view description web and native share, may not import a router (`react-router*`, `@tanstack/react-router`, `@tanstack/react-start`, `next`, `expo-router`), `react-dom`, `react-native` or `react-native-*`, `expo*`, icon sets (`lucide-react`, `lucide-react-native`), or Genesis UI (`genesis-ui`, `genesis-ui-native`, `genesis-native`). One such import stops the other platform loading the view, and nothing on the platform that added it fails. It checks the file's own imports.
