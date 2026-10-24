// What a respondent's thank-you page offers. Pure: safe in the browser bundle and in
// tests. Moved up from the host app's src/lib/feedback/respondent.ts.

/**
 * Whether the thank-you page offers "Send another response" (on unless `submitAnother`
 * is false). Never on a form that takes one response per person: a second response
 * would be refused. Anonymous forms don't know who answered, so one per person doesn't apply.
 */
export function offersSubmitAnother(form: {
  submitAnother?: boolean | null | undefined;
  onePerPerson?: boolean | null | undefined;
  anonymous?: boolean | null | undefined;
}): boolean {
  const onePerPerson = form.onePerPerson === true && !form.anonymous;
  return form.submitAnother !== false && !onePerPerson;
}
