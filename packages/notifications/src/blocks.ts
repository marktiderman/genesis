/**
 * The notifications block, as a `defineBlock` declaration: what `genesis add
 * notifications` installs (the migration and its pgTAP test), the screens it
 * needs routed, its nav and Settings rows, and what it means for the stores'
 * privacy forms. Node-safe: no React, no Supabase client.
 */
import { defineBlock } from "@marktiderman/genesis-features/blocks";

const PACKAGE = "@marktiderman/genesis-notifications";

/**
 * Notifications: the feed, push and email for every domain, on one notifier.
 *
 * @stability Beta
 */
export const notificationsBlock = defineBlock({
  id: "notifications",
  platforms: ["web", "native", "server"],
  contributes: {
    nav: [{ id: "notifications", label: "Notifications", path: "/notifications", icon: "bell", order: 50 }],
    settings: [{ id: "notification-preferences", section: "notifications", title: "Notifications", href: "/settings/notifications", testID: "genesis-notifications-settings" }],
    routes: [
      { path: "/notifications", description: "The notification feed", signedIn: true },
      { path: "/settings/notifications", description: "Notification preferences: categories by channel, quiet hours, previews", signedIn: true },
      { path: "/admin/notifications", description: "Admin: the delivery log, suppressed addresses, send a test", signedIn: true },
    ],
    migrations: [{ package: PACKAGE, file: "migrations/0001_genesis_notifications.sql", test: "migrations/tests/0001_genesis_notifications.test.sql" }],
    privacy: {
      collects: [
        { type: "device ID", purposes: ["app functionality"], linked: true, tracking: false },
        { type: "email address", purposes: ["app functionality"], linked: true, tracking: false },
      ],
      notes: [
        "Keeps each person's notifications (what the app told them), read and archived, until they are pruned or the person is erased.",
        "Keeps this device's push token against the signed-in person; forgotten on sign-out and account deletion. A token moves to another login only on the same phone, and each move is recorded.",
        "Keeps notification preferences per person: each category by channel, quiet hours with a time zone, and previews.",
        "Keeps a short delivery log (status and an error code, no content) and, for addresses that bounced, complained or unsubscribed with no login, a hash of the address.",
        "Erasing a person deletes their notifications, send jobs, devices and preferences, whether or not they have a login.",
      ],
    },
  },
});
