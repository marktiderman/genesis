---
"@marktiderman/genesis-ui": minor
---

`AuthPage` and `PublicPage` layouts in `@marktiderman/genesis-ui/layout`, for the screens that have no AppShell around them.

- `AuthPage`: the web counterpart of native `AuthScreen`. A full-height, centred card for sign-in, sign-up, reset, invite and verify: `branding` (logo, headline as the page's h1, subhead), `social`, the form as children, `footer` links, a `legal` line and an optional `aside` panel on wide screens. The card column is the `main` landmark. `slots` / `slotProps` replace or drop `branding`, `social` or `footer`, as on native.
- `PublicPage`: a public form, QR poster or landing page. An optional brand header (logo, name, cover image, accent rule), a content column with `maxWidth` (a `Container` size), and a footer with "Powered by …" that the host can leave out. `embedded` (for iframes, e.g. from `?embed=1`) drops the header, footer, background and full-viewport height.
- Brand theming: `brand.accent` becomes `--primary`, `--ring` and `--brand-accent*` variables on the page root, so nested Genesis components follow it. An accent under 4.5:1 on white is darkened (same hue) for text and fills: `accessibleAccent`, `contrastRatio` and `brandThemeStyle` are exported.
