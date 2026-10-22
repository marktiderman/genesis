/** Definitions used only by the conformance suite (not in apps/sample). */
import { defineForm, f } from "../index";

/** The same contact form, as a named and as an anonymous form. */
function contactDetails(anonymous: boolean) {
  return defineForm({
    id: anonymous ? "contact-details-anonymous" : "contact-details",
    title: "Tell us about your visit",
    blocks: [
      f.rating("overall", { label: "How was your visit?", required: true }),
      f.shortText("name", { label: "Your name", required: true, identifying: true }),
      f.email("email", { label: "Email", required: true, identifying: true }),
      f.phone("phone", { label: "Phone", identifying: true }),
      f.longText("comments", { label: "Anything else?" }),
    ],
    endings: [{ id: "default", title: "Thanks!" }],
    settings: { anonymous },
  });
}

export const contactNamed = contactDetails(false);
export const contactAnonymous = contactDetails(true);
