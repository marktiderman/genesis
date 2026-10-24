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
  },
});
