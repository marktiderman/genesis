// Your registry, email templates and secret links, for the sender function.
// Import the same `defineNotifications` list your app uses, e.g.
//   export { notifications } from "../../../src/notifications.ts";
// This starter list has the one type every app needs: the admin's test.
import { defineNotifications } from "npm:@marktiderman/genesis-notifications@^0.1.0";
import type { EmailTemplate, SecretLinks } from "npm:@marktiderman/genesis-notifications@^0.1.0/server";

export const notifications = defineNotifications({
  categories: { genesis: { label: "Tests" } },
  types: {
    "genesis.test": {
      category: "genesis",
      channels: { in_app: true, push: true, email: true },
      transactional: true,
      render: () => ({ title: "Test notification", body: "If you can read this, this channel works." }),
    },
  },
});

export const emailTemplates: Record<string, EmailTemplate> = {};
export const secretLinks: SecretLinks = {};
