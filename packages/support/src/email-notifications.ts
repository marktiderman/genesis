/**
 * `@marktiderman/genesis-support/email-notifications`: support's notification emails and reply by
 * email on genesis-notifications (server only). Apart from `/email` so an app that sends support
 * email with a provider of its own needs no genesis-notifications: this entry imports it.
 *
 * - `supportEmailTemplates` / `supportEmailTemplate`: the runner's templates for support's types.
 * - `supportEmailOptions`, `supportReplyProvider`, `supportReplyConfig`, `supportJobClaims`: each
 *   support email's own signed Reply-To.
 * - `supportReplyRoute`, `handleSupportInbound`, `senderAuthenticated`: the inbound half.
 *
 * @packageDocumentation
 */
export * from "./email-templates";
export * from "./email-inbound";
