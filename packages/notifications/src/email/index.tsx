/**
 * `@marktiderman/genesis-notifications/email`: React Email templates for the
 * notifier. `BrandLayout` wraps a message in the tenant's brand (logo or
 * name, accent colour, footer with the unsubscribe link when there is one);
 * `reactEmailTemplate` turns a component into an `EmailTemplate` the runner
 * takes. Server-only; needs `@react-email/components` (an optional peer).
 *
 * ```tsx
 * const templates = {
 *   "chat.message": reactEmailTemplate((ctx) => ({
 *     subject: `${ctx.text.title} sent you a message`,
 *     body: (
 *       <BrandLayout ctx={ctx} preview={ctx.text.body}>
 *         <EmailText>{ctx.text.body}</EmailText>
 *         {ctx.url ? <EmailButton ctx={ctx} href={ctx.url}>Reply</EmailButton> : null}
 *       </BrandLayout>
 *     ),
 *   })),
 * };
 * ```
 *
 * @packageDocumentation
 */
import type { ReactElement, ReactNode } from "react";
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text, render } from "@react-email/components";
import type { EmailContent, EmailTemplate, EmailTemplateContext } from "../server/email-render";

const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function accentOf(ctx: EmailTemplateContext): string {
  return typeof ctx.brand.color === "string" && SAFE_COLOR.test(ctx.brand.color) ? ctx.brand.color : "#111827";
}

function httpsOrNull(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export interface BrandLayoutProps {
  ctx: EmailTemplateContext;
  /** The inbox preview line. */
  preview?: string;
  /** Default `ctx.text.title`. */
  heading?: string;
  /** Words before the unsubscribe link. Default "Don't want these emails?". */
  unsubscribeLabel?: string;
  children?: ReactNode;
}

/**
 * The brand frame every notification email shares.
 *
 * @stability Beta
 */
export function BrandLayout({ ctx, preview, heading, unsubscribeLabel = "Don't want these emails?", children }: BrandLayoutProps) {
  const accent = accentOf(ctx);
  const logo = httpsOrNull(ctx.brand.logoUrl);
  const site = httpsOrNull(ctx.brand.url);
  return (
    <Html lang="en">
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={{ backgroundColor: "#f6f7f9", margin: 0, padding: "24px 0", fontFamily: "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: 24, maxWidth: 560 }}>
          <Section style={{ marginBottom: 16 }}>
            {logo ? (
              <Img src={logo} alt={ctx.brand.name ?? ""} height={32} />
            ) : ctx.brand.name ? (
              <Text style={{ margin: 0, fontWeight: 600, fontSize: 16, color: accent }}>{ctx.brand.name}</Text>
            ) : null}
          </Section>
          <Heading as="h1" style={{ fontSize: 20, lineHeight: "28px", margin: "0 0 12px", color: "#111827" }}>
            {heading ?? ctx.text.title}
          </Heading>
          {children}
          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            {site && ctx.brand.name ? <Link href={site} style={{ color: "#6b7280" }}>{ctx.brand.name}</Link> : ctx.brand.name ?? null}
            {ctx.unsubscribeUrl ? (
              <>
                {ctx.brand.name ? " · " : null}
                {unsubscribeLabel}{" "}
                <Link href={ctx.unsubscribeUrl} style={{ color: "#6b7280", textDecoration: "underline" }}>
                  Unsubscribe
                </Link>
              </>
            ) : null}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** A paragraph in the brand's type. */
export function EmailText({ children }: { children?: ReactNode }) {
  return <Text style={{ fontSize: 15, lineHeight: "24px", color: "#111827", margin: "0 0 16px", whiteSpace: "pre-wrap" }}>{children}</Text>;
}

/** A button in the brand's accent. */
export function EmailButton({ ctx, href, children }: { ctx: EmailTemplateContext; href: string; children?: ReactNode }) {
  return (
    <Button href={href} style={{ backgroundColor: accentOf(ctx), color: "#ffffff", borderRadius: 6, padding: "10px 16px", fontSize: 15, textDecoration: "none" }}>
      {children}
    </Button>
  );
}

/**
 * Turn a React Email component into the runner's `EmailTemplate`: HTML and a
 * plain-text part from the same element.
 *
 * @stability Beta
 */
export function reactEmailTemplate(build: (ctx: EmailTemplateContext) => { subject: string; body: ReactElement }): EmailTemplate {
  return async (ctx): Promise<EmailContent> => {
    const { subject, body } = build(ctx);
    const [html, text] = await Promise.all([render(body), render(body, { plainText: true })]);
    return { subject, html, text };
  };
}

/** The default template, on the brand layout: the registry's title and body, and a button to the link. */
export const brandedDefaultTemplate: EmailTemplate = reactEmailTemplate((ctx) => ({
  subject: ctx.text.title,
  body: (
    <BrandLayout ctx={ctx} preview={ctx.text.body}>
      {ctx.text.body ? <EmailText>{ctx.text.body}</EmailText> : null}
      {ctx.secretLink ?? ctx.url ? (
        <EmailButton ctx={ctx} href={(ctx.secretLink ?? ctx.url)!}>
          Open
        </EmailButton>
      ) : null}
    </BrandLayout>
  ),
}));

export type { EmailContent, EmailTemplate, EmailTemplateContext };
