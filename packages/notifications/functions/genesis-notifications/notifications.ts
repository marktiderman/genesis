// Your registry, email templates and secret links, for the sender function.
// Import the same `defineNotifications` list your app uses, e.g.
//   export { notifications } from "../../../src/notifications.ts";
// This starter list has the one type every app needs: the admin's test,
// spread from the package so it stays critical (as the migration seeds it) and
// a preference can never silence Admin -> Send a test.
import { GENESIS_TEST_CATEGORY, GENESIS_TEST_TYPE, defineNotifications } from "npm:@marktiderman/genesis-notifications@^0.3.0";
import type { EmailTemplate, SecretLinks } from "npm:@marktiderman/genesis-notifications@^0.3.0/server";

export const notifications = defineNotifications({
  categories: { ...GENESIS_TEST_CATEGORY },
  types: { ...GENESIS_TEST_TYPE },
});

export const emailTemplates: Record<string, EmailTemplate> = {};
// A secret link builder must give the same link for the same notification every time:
// a retry sends under the same idempotency key, and a different body fails (409).
export const secretLinks: SecretLinks = {};
