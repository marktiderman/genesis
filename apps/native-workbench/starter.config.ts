/**
 * The starter's switches. Every universal feature the Genesis packages ship
 * is on; turn one off by changing its line to `false`. See README.md.
 */
import { defineStarter } from "./src/lib/define-starter";

export default defineStarter({
  app: {
    name: "Genesis Workbench",
    slug: "native-workbench",
    scheme: "genesis-workbench",
    bundleId: "dev.genesis.workbench",
    // PLACEHOLDER: your EAS project id (a UUID), printed by `eas init`. Empty means no EAS project:
    // the app runs, builds carry no update URL and `eas update` can't reach them.
    easProjectId: "",
  },
  // The showcase runs with no sign-in and no backend: features that need a signed-in person or a
  // server (notifications, push, check-in, support, chat sync) are off. Their UI is shown on
  // sample data in the showcase's screens.
  features: {
    emailSignIn: true,
    appleSignIn: true,
    // Off: it needs Google client ids and the Universal sign-in module. README, "Google sign-in".
    googleSignIn: false,
    accountDeletion: true,
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
