/**
 * The starter's switches. Every universal feature the Genesis packages ship
 * is on; turn one off by changing its line to `false`. See README.md.
 */
import { defineStarter } from "./src/lib/define-starter";

export default defineStarter({
  app: {
    name: "Genesis",
    slug: "genesis",
    scheme: "genesis",
    bundleId: "com.streamlineddigital.genesis",
    // PLACEHOLDER: your EAS project id (a UUID), printed by `eas init`. Empty means no EAS project:
    // the app runs, builds carry no update URL and `eas update` can't reach them.
    easProjectId: "1b02b312-e860-48a1-9ccb-6280e3b9e6a1",
  },
  // The showcase runs with no sign-in and no backend: sign-in and account deletion, and features
  // that need a signed-in person or a server (notifications, push, check-in, support, chat sync),
  // are off. Their UI is shown on
  // sample data in the showcase's screens.
  features: {
    // On only because the starter config needs one sign-in method: no route signs in (sign-in.tsx is gone).
    emailSignIn: true,
    appleSignIn: false,
    // Off: it needs Google client ids and the Universal sign-in module. README, "Google sign-in".
    googleSignIn: false,
    accountDeletion: false,
    notifications: false,
    queryPersistence: true,
    queryLifecycle: true,
    keyboardScroll: true,
    deepLinks: true,
    wipeSessionOnReinstall: true,
    refreshWhileActive: true,
    updates: true,
    push: false,
    observability: true,
    devtools: true,
    checkIn: false,
    support: false,
    chat: false,
  },
});
