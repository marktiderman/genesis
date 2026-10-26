/**
 * What the app notifies people about (`features.notifications`), on
 * @marktiderman/genesis-notifications: one list the app, the server and the
 * sender function share. The feed (the Notifications tab) reads it to say
 * what each row is; the push block takes its categories and action buttons;
 * Settings → Notifications shows a switch per category and channel.
 *
 * Add your types here, then send them from your server with `notify()` from
 * `@marktiderman/genesis-notifications/server` (never from the app).
 */
import { GENESIS_TEST_CATEGORY, GENESIS_TEST_TYPE, MESSAGE_ACTIONS, defineNotifications } from "@marktiderman/genesis-notifications";
import { copy } from "@/copy";

export const notifications = defineNotifications({
  categories: {
    activity: { label: copy.push.activityTitle, description: copy.push.activityDescription },
    ...GENESIS_TEST_CATEGORY,
  },
  actions: { message: MESSAGE_ACTIONS },
  types: {
    // An example: something in the app needs the person. Rename or replace it.
    "starter.activity": {
      category: "activity",
      channels: { in_app: true, push: true, email: false },
      render: (data) => ({
        title: typeof data.title === "string" ? data.title : copy.push.activityTitle,
        ...(typeof data.body === "string" ? { body: data.body } : {}),
        ...(typeof data.url === "string" ? { url: data.url } : {}),
      }),
    },
    ...GENESIS_TEST_TYPE,
  },
});
