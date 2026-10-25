/**
 * The starter's switches. Every universal feature the Genesis packages ship
 * is on; turn one off by changing its line to `false`. See README.md.
 */
import { defineStarter } from "./src/lib/define-starter";

export default defineStarter({
  app: {
    name: "Genesis Starter",
    slug: "genesis-rn-starter",
    scheme: "genesis-starter",
    bundleId: "com.example.genesisstarter",
    // PLACEHOLDER: your EAS project id (a UUID), printed by `eas init`. Empty means no EAS project:
    // the app runs, builds carry no update URL and `eas update` can't reach them.
    easProjectId: "",
  },
  features: {
    emailSignIn: true,
    appleSignIn: true,
    accountDeletion: true,
    notifications: true,
    queryPersistence: true,
    queryLifecycle: true,
    keyboardScroll: true,
    deepLinks: true,
    wipeSessionOnReinstall: true,
    refreshWhileActive: true,
    updates: true,
    push: true,
    observability: true,
    devtools: true,
    support: true,
  },
});
