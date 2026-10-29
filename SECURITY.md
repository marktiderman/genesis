# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub: on this repository's **Security** tab,
choose **Report a vulnerability**. Don't open a public issue or pull request for one.

Say which package and version, what an attacker can do, and how to reproduce it. A proof of
concept helps; please don't test against apps you don't own.

We aim to reply within five working days. We'll agree a disclosure date with you, fix the
problem in a release, and credit you in the advisory unless you'd rather not be named.

## Supported versions

Fixes go into the latest release of `@marktiderman/genesis` and each `@marktiderman/genesis-*`
package. Packages below 1.0 have no long-term support lines: upgrade to the latest minor to get
a fix.

## What's in scope

The published packages under `packages/` (the base `@marktiderman/genesis` package and every
`@marktiderman/genesis-*` package), their database migrations, the reusable workflows in
`.github/workflows/` that apps call, and the code generators in `@marktiderman/genesis-cli`.
Problems in an app built on Genesis go to that app's owners.
