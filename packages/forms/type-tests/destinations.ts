// The destinations entry type-checks for a consumer with exactOptionalPropertyTypes
// on, the DOM lib only (no @types/node), and options passed straight through.
import type { Json } from "@marktiderman/genesis-forms";
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import {
  emailDestination,
  resendProvider,
  sheetsDestination,
  webhookDestination,
  type DeliveryResult,
  type Destination,
} from "@marktiderman/genesis-forms/destinations";
import { form } from "./exact-optional";

declare const maybe: { deliveryId?: string; state?: Record<string, Json>; redelivery?: boolean; timeoutMs?: number };

export const destinations: Record<string, Destination> = {
  email: emailDestination({ provider: resendProvider({ apiKey: "re_test", timeoutMs: maybe.timeoutMs }), from: "Forms <forms@example.com>" }),
  sheet: sheetsDestination({ account: { clientEmail: "a@b.iam.gserviceaccount.com", privateKey: "…" } }),
  webhook: webhookDestination({ secret: () => "a-signing-secret-of-length" }),
};

export async function send(): Promise<DeliveryResult | null> {
  const result = validateSubmission(form.definition, { answers: {} });
  if (!result.ok) return null;
  const outcome = await destinations["email"]!.deliver({ id: "r1", ...result.submission }, form.definition, { to: ["a@example.com"] }, {
    deliveryId: maybe.deliveryId,
    state: maybe.state,
    redelivery: maybe.redelivery,
  });
  if (!outcome.ok && outcome.retryable) return outcome;
  return outcome;
}
