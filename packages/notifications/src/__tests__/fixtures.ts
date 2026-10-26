import { GENESIS_TEST_CATEGORY, GENESIS_TEST_TYPE, MESSAGE_ACTIONS, defineNotifications } from "../core/index";

export const registry = defineNotifications({
  categories: {
    messages: { label: "Messages", android: { importance: "high" } },
    forms: { label: "Form receipts" },
    security: { label: "Security", critical: true },
    ...GENESIS_TEST_CATEGORY,
  },
  actions: { message: MESSAGE_ACTIONS },
  types: {
    "chat.message": {
      category: "messages",
      channels: { in_app: true, push: true, email: true },
      emailDelaySeconds: 600,
      actions: "message",
      render: (d) => ({ title: String(d.sender_name ?? "Someone"), body: String(d.preview ?? ""), url: `/messages/${String(d.conversation_id)}` }),
    },
    "forms.receipt": {
      category: "forms",
      channels: { email: true },
      transactional: true,
      secretLink: true,
      render: (d) => ({ title: `Your answers to ${String(d.form_title)}` }),
    },
    "security.new_sign_in": {
      category: "security",
      channels: { in_app: true, email: true },
      render: () => ({ title: "New sign-in" }),
    },
    ...GENESIS_TEST_TYPE,
  },
});

export const USER = "00000000-0000-4000-8000-000000000001";
