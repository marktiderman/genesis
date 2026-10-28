# OSS and DevOps programs for Genesis

Researched 2026-10-28. Research only: nothing was applied for, signed up for or changed. Every
claim carries a vendor link; anything not confirmed on a vendor's own page is marked
**unverified**. Vendor pages were summarised by a small model during research, so re-read the
linked page before you apply. Genesis stats (stars, downloads, dependents) were not measured;
`gh` shows 0 stars and 0 forks today, so fit ratings assume a young project.

## Bottom line

1. **Fix Docker Hub first, and it costs nothing.** No program fixes it better than a CI change.
   Find which image fails, log in to Docker Hub with a token before `supabase db start`, point
   the CLI at a registry mirror, and cache images. Details below.
2. **Apply to** (ranked): Anthropic Claude for Open Source, OpenAI Codex for Open Source,
   Blacksmith OSS, Socket.dev, Sentry OSS, Algolia DocSearch (once there is a docs site), GitHub
   Secure Open Source Fund (once there is traction), Open Source Collective.
3. **Turn on, no application:** Dependabot, CodeQL, Scorecard, a `.coderabbit.yaml`, plus the
   community files Genesis lacks (`SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`). Several
   programs below require a Code of Conduct, so that file also unlocks applications.
4. **Skip:** Snyk, Mintlify, Netlify OSS, Argos OSS sponsorship, Docker-Sponsored Open Source,
   Depot, Namespace, BuildJet (shut down), Buildkite, CircleCI. Reasons are in "Terms that clash".

## Summary table

| Program | What you get | Fit | Apply? |
|---|---|---|---|
| GitHub Actions (public repos) | Free standard runners | High | Already used |
| Docker Hub login + ECR/GHCR mirrors | Higher or no pull limits | High | No application |
| npm trusted publishing + provenance | Tokenless publish, attestations | High | Already used |
| Dependabot / CodeQL / secret scanning | Free security tooling | High | Turn on |
| OpenSSF Scorecard | Score, badge, hardening list | High | Turn on |
| CodeRabbit OSS | Free PR reviews on public repos | High | Already installed |
| Anthropic Claude for Open Source | 6 months Claude Max 20x | Medium | Apply |
| OpenAI Codex for Open Source | 6 months ChatGPT Pro, API credits for Codex workflows | Medium | Apply (conditional) |
| Blacksmith | 3,000 free minutes a month, Docker pull mirror, OSS program | Medium | Contact |
| Socket.dev | Free OSS Team account | Medium | Contact |
| Sentry OSS | 5M errors a month, no term limit | Medium | Apply |
| Algolia DocSearch | Free docs search | High if a docs site exists | Apply later |
| GitHub Secure Open Source Fund | $10k plus $10k Azure credits | Medium | Apply later |
| Open Source Collective | Fiscal host for donations | Medium | Apply |
| Renovate, Codecov, SonarCloud, OpenSSF Best Practices badge | Free for public repos | Medium | Optional |
| Cloudflare Pages free | Free hosting, unlimited previews | Medium | Optional |
| Argos Hobby plan | 5,000 screenshots a month | Medium | Optional |
| BrowserStack OSS (with Percy) | Free Live, Automate, Percy | Medium | Ask first |
| Chromatic OSS | Sponsored snapshots | Low-Medium | Thresholds likely missed |
| GitBook OSS, LambdaTest | Free docs plan with ads; free test licenses | Low-Medium | Skip |
| Vercel OSS program | $3,600 credits over 3 years | Low | Closed |
| Copilot review / Copilot Pro, DeepSource, Sigstore, AWS credits, Azure, Grafana, Honeycomb, Expo/EAS, Sauce Labs, Better Stack | see notes | Low | Skip |
| Snyk, Mintlify, Netlify OSS, Argos OSS, DSOS, Depot, Namespace, Buildkite, CircleCI | see notes | Low | Skip |

## Repo context (read-only)

- Public MIT monorepo, 28 public packages, released from `release.yml` with npm Trusted Publishing
  and no stored token (`docs/RELEASING.md`). Every package sets `publishConfig.provenance: false`
  yet npm still attaches an attestation (same doc).
- CI is all `ubuntu-latest`: build/typecheck/test with a `postgres:17-alpine` service container
  (`.github/workflows/ci.yml`), Storybook browser tests with Playwright, and a reusable
  `supabase-ci.yml` that runs `supabase db start` and `supabase test db` with Supabase CLI 2.122.0.
- Reviewers today: CodeRabbit, plus `claude-code-review.yml` (Claude Code action, model
  `claude-opus-5-5`, once per PR on open) and `claude.yml`. A `chromatic` script exists in
  `apps/sample/package.json` but no workflow runs it.
- Missing: `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, `SUPPORT.md`, `FUNDING.yml`,
  `dependabot.yml`, `renovate.json`, `.coderabbit.yaml`, `llms.txt`. The repo description and
  topics are empty, and Dependabot security updates are disabled.

## Docker Hub rate limit

Sources: [Docker pull limits](https://docs.docker.com/docker-hub/usage/pulls/),
[Docker usage](https://docs.docker.com/docker-hub/usage/),
[Supabase CLI source](https://github.com/supabase/cli).

- Anonymous Hub pulls: 100 per 6 hours per IPv4 (or IPv6 /64). A free login: 200. Pro, Team and
  Business: unlimited under fair use. Multi-arch images count once per architecture. A separate
  abuse limit on shared CI IPs can fire even when logged in.
- The exact string "Data limit exceeded" is not in Docker's docs. Its cause is **unverified**;
  it may be a newer data-based throttle.
- The Supabase CLI already defaults to `public.ecr.aws/supabase` and falls back to GHCR and then
  the source image. Override with `SUPABASE_INTERNAL_IMAGE_REGISTRY`. Whether CLI 2.122.0 falls
  back to Docker Hub is **unverified**.
- Anonymous ECR Public allows 1 pull per second per IP
  ([AWS quotas](https://docs.aws.amazon.com/AmazonECR/latest/public/public-service-quotas.html)),
  so a burst of Supabase images can trip it and trigger the fallback (**unverified** link).
- `ci.yml` also pulls `postgres:17-alpine` from Docker Hub as a service container. That is a
  second likely source, independent of Supabase.

Fix, cheapest first:

1. Read the failing job's log and note the image name and registry. This decides everything.
2. `docker/login-action` with a Docker Hub token before `supabase db start`
   ([action](https://github.com/docker/login-action)). Catch: fork PRs get no secrets and stay
   anonymous. Free login only doubles the limit.
3. Also log in to GHCR with `GITHUB_TOKEN`; GHCR is free for public images
   ([billing](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-packages)).
4. Cache images across runs (`docker save` plus `actions/cache`). Standard pattern, **unverified**
   against a vendor page.
5. Optional daemon mirror `mirror.gcr.io`
   ([docs](https://docs.cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images)):
   no guarantee an image is cached, and the page doesn't say it works outside GCP.
6. Paid Docker Pro/Team login is the surest. Price not read.

## Per-program notes

### CI/CD and runners

**GitHub Actions.** Standard hosted runners are free in public repos; larger runners are billed
even for public repos
([billing](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions),
[larger runners](https://docs.github.com/en/actions/using-github-hosted-runners/using-larger-runners/about-larger-runners)).
A self-hosted platform charge announced for 2026-03-01 was postponed, no new date
([changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)).
No application. Catch: shared egress IPs are why Docker Hub limits bite. **Fit: high.**

**Blacksmith.** $0.004/min Ubuntu x64, 3,000 free minutes a month
([pricing](https://www.blacksmith.sh/pricing)). Its docs describe a Docker Hub pull-through mirror
on its runners ([mirror](https://docs.blacksmith.sh/feature-spotlight/docker-pull-through-mirror);
secondhand, page not fetched). Pricing page mentions OSS support for actively maintained, public,
permissive-license projects with community usage; apply by contacting the team, no form found,
review time and attribution **unverified**. No non-commercial clause stated. Catch: a third-party
runner holds your secrets and needs a GitHub App. **Fit: medium.**

**Depot.** Developer plan $20/month, no free tier; OSS discounts are only mentioned, no terms
([pricing](https://depot.dev/pricing)). Strength is Docker builds, which Genesis doesn't do.
**Fit: low.**

**Namespace.** 30-day trial then pay-as-you-go; links an OSS application but lists no criteria
([pricing](https://namespace.so/pricing)). **Fit: low.**

**BuildJet.** Shut down per its own homepage ([buildjet.com](https://buildjet.com)); the
2026-03-31 date is from competitor coverage only
([WarpBuild](https://www.warpbuild.com/blog/buildjet-shutting-down)). Not available.

**Buildkite OSS.** "Special pricing for open source"; Free plan is 10 concurrent jobs and 2,000
Linux vCPU minutes a month ([pricing](https://buildkite.com/pricing)). Contact to confirm. Catch:
means leaving GitHub Actions; npm trusted publishing support is **unverified**. **Fit: low.**

**CircleCI OSS.** Free plan, public repo, up to 400,000 Linux credits a month
([open source](https://circleci.com/open-source/)); its sources disagree on exact figures. Catch:
leaving GitHub Actions; trusted publishing support **unverified**. **Fit: low.**

### Container registries

**Docker-Sponsored Open Source.** Removes pull limits for you and people pulling your public
images; a year of Docker Team for core contributors. Needs public Docker Hub images, OSI license,
activity within 6 months, and **no pathway to commercialization**; benefits are "solely for
developing non-commercial open-source projects" ([program](https://www.docker.com/community/open-source/application/)).
Apply through an Airtable form; review time unstated. Catch: Genesis has no Docker Hub images,
and it does not obviously cover pulls of other people's images. **Fit: low.**

**GHCR.** Free for public packages; GitHub promises a month's notice of any change
([billing](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-packages)).
Good home for a mirror of any image that still hits Docker Hub. **Fit: medium-high.**

### Package publishing and supply chain

**npm trusted publishing and provenance.** Needs npm CLI 11.5.1+ and Node 22.14.0+, GitHub-hosted
runners, `id-token: write`; the workflow filename and `repository.url` must match exactly; a new
config expires if it has no successful publish within 2 days
([trusted publishers](https://docs.npmjs.com/trusted-publishers)). Provenance is automatic for
public repos and can be disabled by `publishConfig`
([provenance](https://docs.npmjs.com/generating-provenance-statements)). Why Genesis still gets
attestations despite `provenance: false` is **unverified**; test it on a throwaway publish.
**Fit: high** (in use).

**OpenSSF Scorecard.** Free Apache-2.0 Action, score and README badge, no application
([repo](https://github.com/ossf/scorecard)). Branch-Protection and Code-Review checks may penalise
a single-maintainer workflow (inference). **Fit: high.**

**OpenSSF Best Practices badge.** Free self-attestation likely; cost not stated on the page
([criteria](https://www.bestpractices.dev/en/criteria)). Raises the Scorecard CII check. **Fit: medium.**

**Dependabot.** Free; supports pnpm and GitHub Actions; enable with `dependabot.yml`
([docs](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/about-dependabot-version-updates),
[ecosystems](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories)).
pnpm catalog support **unverified**. **Fit: high.**

**Renovate (Mend).** Free GitHub app for public and private repos
([app](https://github.com/apps/renovate)); onboarding PR
([docs](https://docs.renovatebot.com/getting-started/installing-onboarding/)). Run Renovate or
Dependabot version updates, not both. **Fit: medium** (better grouping for 28 packages).

**GitHub CodeQL, secret scanning, push protection, dependency review.** Free by default on public
repos ([features](https://docs.github.com/en/code-security/getting-started/github-security-features)).
Secret scanning and push protection are already on. **Fit: high.**

**Sigstore.** Free public-good service ([overview](https://docs.sigstore.dev/about/overview/)).
npm provenance already uses it for you. Only worth direct use for non-npm artifacts. **Fit: low.**

**Socket.dev.** Free plan (1 seat, 1,000 scans a month)
([pricing](https://socket.dev/pricing)); says it is "always free" for open source and asks OSS
projects to contact it for a Team account. Its OSS docs page 404'd, so eligibility, review time
and attribution are **unverified**. **Fit: medium.**

**Snyk OSS.** Maintainer programme requires a project "not backed by any corporate entity", a
README link and logo permission ([program](https://snyk.io/open-source/)); free plan is for
"internal business operations" and revocable at any time
([terms](https://snyk.io/policies/terms-of-service/)). **Fit: low; likely ineligible.**

### Code review and quality

**CodeRabbit OSS.** Unlimited public repos, no card
([plans](https://docs.coderabbit.ai/management/plans)). PR reviews per developer per hour run 1 to
10 depending on repo stars; repos under 10 stars need a manual `@coderabbitai review`. The exact
tier differs between the plans page and the
[knowledge base](https://kb.coderabbit.ai/articles/8856795235-how-do-i-activate-coderabbit-pro-for-my-open-source-project)
(**unverified**). Whether company-owned projects qualify is not stated. Catch: low stars means a low cap.
**Fit: high** (installed).

**GitHub Copilot review.** No code review on Copilot Free
([plans](https://docs.github.com/en/copilot/concepts/billing/individual-plans)). Quota runs out by
design: one page says 13 premium requests per review against 300 a month on Pro
([requests](https://docs.github.com/en/copilot/concepts/billing/copilot-requests)), another says
AI credits per review ([code review](https://docs.github.com/en/copilot/concepts/agents/code-review));
the billing model is mid-change, so exact quota maths is **unverified**. Free Copilot Pro goes to
"maintainers of popular open source projects" with "popular" undefined
([docs](https://docs.github.com/en/copilot/how-tos/manage-your-account/get-free-access-to-copilot-pro)),
and a search snippet says new sign-ups paused 2026-04-20 (**unverified**). **Fit: low.**

**Codecov.** Free unlimited uploads for open source ([pricing](https://about.codecov.io/pricing/));
terms unverified. Adds a CI dependency and token. **Fit: medium.**

**SonarCloud.** Free OSS plan for public repos with PR analysis
([plans](https://www.sonarsource.com/plans-and-pricing/sonarcloud/),
[docs](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans.md));
commercial-use terms unverified. **Fit: medium.**

**DeepSource.** Free for open source, 1,000 PRs a month ([pricing](https://deepsource.com/pricing)).
Overlaps CodeRabbit and Sonar. **Fit: low.**

### Hosting and previews

**Vercel OSS program.** $3,600 credits over 3 years; applications closed; credits only for the
OSS project itself ([program](https://vercel.com/open-source-program)). **Fit: low now.**

**Vercel Hobby.** "Non-commercial, personal use only", and commercial includes "a paid employee or
consultant writing the code"; a public repo doesn't change that
([fair use](https://vercel.com/docs/limits/fair-use-guidelines),
[Hobby](https://vercel.com/docs/plans/hobby)). The existing Vercel preview deploys of the sample
app should be checked against this: Pro is the safe route, or ask Vercel support.

**Netlify OSS.** Free deploys and previews, but needs an OSI license, a Code of Conduct, a Netlify
backlink, and "must not be a commercial project"
([program](https://www.netlify.com/open-source/),
[policy](https://www.netlify.com/legal/open-source-policy/)). **Fit: medium; clashes.**

**Cloudflare Pages free.** Unlimited preview deployments and users, 500 builds a month
([limits](https://developers.cloudflare.com/pages/platform/limits/)); full terms unchecked.
**Fit: medium** as a no-cost host if the Vercel Hobby question bites.

**Cloudflare Project Alexandria.** Needs non-profit or mission alignment, sole-discretion
([blog](https://blog.cloudflare.com/expanding-our-support-for-oss-projects-with-project-alexandria/)).
**Fit: low.**

### Testing

**Chromatic OSS.** 35k snapshots a month, Chrome only; needs 100+ contributors, 40k weekly npm
downloads or 10k stars, or 5+ contributors for company-built libraries
([docs](https://www.chromatic.com/docs/open-source/)). Free plan 5,000 snapshots
([pricing](https://www.chromatic.com/pricing)). The `chromatic` script already exists. **Fit: low-medium.**

**Argos.** Free Hobby plan: 5,000 screenshots a month, commercial use allowed
([pricing](https://argos-ci.com/pricing)). The OSS sponsorship needs "not used commercially" plus
README and site backlinks ([docs](https://argos-ci.com/docs/open-source)). **Fit: medium (Hobby).**

**BrowserStack OSS.** Free Live, Automate and Percy for the life of the project
([program](https://www.browserstack.com/open-source)). Eligibility, non-commercial terms and
attribution are not published: **unverified**. Percy has no separate OSS plan. **Fit: medium; ask first.**

**LambdaTest/TestMu.** Free licenses; an "India" clause is ambiguous
([program](https://www.testmuai.com/open-source/)). Genesis uses Playwright. **Fit: low-medium.**

**Sauce Labs.** OSS page 404s; terms unverifiable. **Fit: low.**

**Expo/EAS.** No OSS program; free plan is 15+15 builds, low priority
([pricing](https://expo.dev/pricing)). **Fit: low.**

### Observability

**Sentry OSS.** 5M errors, 100K replays, no term limit; needs a friendly license like MIT or Apache
([program](https://sentry.io/for/open-source/), [pricing](https://sentry.io/pricing/)). Genesis is a
library, so the value is the sample app and starter. **Fit: medium.**

**Grafana Cloud, Honeycomb.** Free tiers only, no OSS programs found
([Grafana](https://grafana.com/pricing/), [Honeycomb](https://www.honeycomb.io/pricing)).
**Fit: low.** **Better Stack:** no OSS program found (**unverified**).

### Docs and search

**Algolia DocSearch.** Free for public technical docs; keep the "Search by Algolia" link; review
1 to 2 business days ([who can apply](https://docsearch.algolia.com/docs/who-can-apply/)). Needs a
public docs site, which Genesis lacks. **Fit: high once a docs site exists.**

**Mintlify OSS.** Pro free, but requires not venture-backed or revenue-funded, and no for-profit
company doing most maintenance ([program](https://www.mintlify.com/oss-program.md)). Genesis is
maintained for commercial apps, so it likely fails. **Fit: low.**

**GitBook OSS.** Free sponsored plan with one ad per page; criteria not stated
([page](https://www.gitbook.com/solutions/open-source)). **Fit: medium-low.**

### AI and LLM credits

**Anthropic Claude for Open Source.** 6 months of Claude Max 20x, no API credits. Eligible by any
one of: 500+ dependent repos, 200k monthly downloads, 100+ merged PRs elsewhere, a repo with 20+
external contributors, OpenSSF criticality 0.4 or more; borderline cases can apply and explain.
Apply on the page; review time and attribution not stated
([program](https://claude.com/open-source-max)). The Claude Code action accepts a subscription
token, so CI could run on the grant ([docs](https://code.claude.com/docs/en/github-actions)), but
whether the program terms allow CI use is **unverified** (terms not read), and subscription rate
limits would cap heavy use. Genesis likely applies via the borderline route. **Fit: medium.**

**OpenAI Codex for Open Source.** 6 months ChatGPT Pro, and API credits from a $1M fund for Codex
used in PR review, maintainer automation or release workflows
([program](https://developers.openai.com/codex/community/codex-for-oss)). Aimed at maintainers of
"widely used" projects; terms page 404'd; "up to $25,000" is third-party only (**unverified**).
Catch: you would add a Codex review job. **Fit: medium.**

**Vercel AI Gateway.** Free tier is a small rate-limited monthly credit; dollar amount
**unverified** ([pricing](https://vercel.com/docs/ai-gateway/pricing)). Not an OSS program. **Fit: low.**

**Google Gemini, Mistral.** No official OSS maintainer program found (Mistral not searched).

### Cloud credits and funding

**AWS Open Source Credits.** OSI license, not single-vendor or VC dominated, active community;
monthly review; apply by form and email
([post](https://aws.amazon.com/blogs/opensource/aws-cloud-credits-for-open-source-projects-affirming-our-commitment/)).
Catch: single-company-driven projects may fail; credits would need a Bedrock plan. **Fit: low-medium.**

**Azure.** Direct applications closed ([page](https://opensource.microsoft.com/azure-credits)).
**Fit: low.** **GCP:** no OSS program found (**unverified**).

**GitHub Secure Open Source Fund.** $10k per project, 3-week program (about 15 hours), $10k Azure
credits; needs community traction, clear governance and a Code of Conduct; rolling applications
([program](https://github.com/open-source/github-secure-open-source-fund)). Cohort dates and
response time not published. **Fit: medium, later.**

**Open Source Collective.** Fiscal host to take donations; needs a clear OSI-style license, recent
activity or usage, and a repo under an organization account
([criteria](https://docs.oscollective.org/getting-started/acceptance-criteria)); fees and
commercial-use rules not read. **Fit: medium.**

**Sovereign Tech Agency.** Deadlines passed; targets critical infrastructure
([site](https://www.sovereign.tech)). **Fit: low.**

## Terms that clash with Genesis

Genesis is MIT and public, but paid maintainers build it for commercial consumer apps.

| Program | Clause | Source |
|---|---|---|
| Docker-Sponsored Open Source | "No pathway to commercialization"; "solely for ... non-commercial" | [docker.com](https://www.docker.com/community/open-source/application/) |
| Netlify OSS | "Must not be a commercial project"; Netlify backlink required | [netlify.com](https://www.netlify.com/legal/open-source-policy/) |
| Argos OSS sponsorship | "Not used commercially"; README and site backlinks | [argos-ci.com](https://argos-ci.com/docs/open-source) |
| Mintlify OSS | No for-profit company owns or mainly maintains it | [mintlify.com](https://www.mintlify.com/oss-program.md) |
| Snyk maintainer program | "Not backed by any corporate entity"; README link; logo permission | [snyk.io](https://snyk.io/open-source/) |
| Vercel Hobby | A paid employee writing the code makes it commercial | [vercel.com](https://vercel.com/docs/limits/fair-use-guidelines) |
| Cloudflare Alexandria | Non-profit or mission aligned | [blog](https://blog.cloudflare.com/expanding-our-support-for-oss-projects-with-project-alexandria/) |
| AWS Open Source Credits | Not single-vendor or VC dominated | [aws blog](https://aws.amazon.com/blogs/opensource/aws-cloud-credits-for-open-source-projects-affirming-our-commitment/) |
| Chromatic OSS, GitHub Secure Fund, Copilot Pro | Traction thresholds, not commercial clauses | see notes above |
| BrowserStack, Sauce Labs, Socket, SonarCloud, Codecov, CodeRabbit | Terms not published or not found | **unverified** |

Programs that ask only for an OSS license are lowest risk: Sentry, Cloudflare Pages, Algolia
DocSearch. In any application, say plainly that commercial apps are built on Genesis and ask how
the vendor treats that. Per the Vercel credits terms, never use OSS credits for consumer apps.

## Repo audit: setup for maximum upside

Opinion, built on the findings above and a read-only look at the repo. Order is by value for effort.

**A. Community and trust files (30 minutes, unlocks applications).**
- Add `SECURITY.md` (enable private vulnerability reporting), `CODE_OF_CONDUCT.md` (required by
  Netlify, Vercel's program and the GitHub Secure Fund), `CODEOWNERS`, `SUPPORT.md`, and
  `.github/FUNDING.yml` once Open Source Collective or Sponsors exists.
- Fill in the repo description and topics, add a social preview image, README badges (CI, npm,
  Scorecard) and consider enabling Discussions. These are the signals most programs score as
  "community traction" and "activity".
- Set `keywords`, `homepage` and `bugs` on the 28 packages (only 1 has keywords, none has the other
  two today). This helps npm search and any criticality metric.

**B. Supply chain and security (free, mostly one file each).**
- Add `dependabot.yml` for `npm` and `github-actions` with groups, or Renovate; not both.
  Dependabot security updates are currently disabled; enable them.
- Add the Scorecard Action with `publish_results: true`, and CodeQL default setup. Pin all actions
  by commit SHA (some already are; `actions/checkout@v4`, `actions/setup-node@v4` and others are
  not) and set a top-level `permissions: {}` default in each workflow. Both improve the Scorecard
  Pinned-Dependencies and Token-Permissions checks. I did not read every workflow for the
  permissions default.
- Check what the one existing repository ruleset enforces; `main` has no classic branch
  protection. Scorecard rewards required review and status checks, and the "merge, never rebase"
  rule can be a ruleset setting.
- Test whether provenance can be set to `true` honestly. Today the flag says false while npm
  attaches attestations anyway; aligning them removes a confusing signal for security scanners.
- Ask Socket for a free OSS Team account.

**C. Agentic review without spend failures.**
- Add `.coderabbit.yaml` with path instructions that point at `AGENTS.md` and `docs/FRAMEWORK.md`
  (G1 to G6), so the free reviewer checks the Genesis rules. CodeRabbit's hourly cap depends on
  stars, so also keep `@coderabbitai review` documented in `CONTRIBUTING.md`.
- Make the Claude review job non-blocking when it can't spend: it should neither be a required
  check nor fail the PR on a spend-limit error (`continue-on-error` or a guard step). Failing
  reviews today are noise. Whether it is currently a required check is unchecked.
- Fund the reviewer rather than rationing it: apply for Claude for Open Source and OpenAI Codex
  for Open Source, and open an Open Source Collective for donations that cover API spend.
- Don't rely on Copilot review; its quota cost scales with PR size across 28 packages.

**D. Docs setup.**
- Mintlify is not an option (it needs a community-maintained, non-funded project). Self-host the
  docs on a static generator (Docusaurus, Starlight, Fumadocs) on GitHub Pages or Cloudflare Pages,
  then apply for DocSearch. The generator choice is a design decision I did not research.
- `docs/component-reference.md` is already generated and `docs/` holds the design docs; a docs
  site can be built from them. Add an `llms.txt` pointing at the same files so agents can use the
  packages. Keep Storybook on GitHub Pages as the component gallery.

**E. CI cost and reliability.**
- Apply the Docker Hub fix above, including the `postgres:17-alpine` service.
- Run the existing `chromatic` script, or Argos Hobby, only when a visual-regression workflow is
  wanted; neither needs an application.
- Consider Blacksmith for a structural fix to shared-IP limits, but only after the login and
  mirror steps, because it adds a vendor that holds your secrets.

**F. Release and discoverability.**
- Keep the changesets and trusted-publishing flow as is; it already meets npm's requirements.
- A real changelog link from each package README and a "why Genesis" section in the root README
  improve the traction signals programs ask for.

## Ranked shortlist: apply for these

1. **Anthropic Claude for Open Source.** Directly addresses review spend; the Claude Code action
   takes a subscription token. Read the Terms for CI use first, and expect the borderline route.
2. **OpenAI Codex for Open Source.** Its fund is aimed at PR-review automation, which matches the
   problem; only worth it if you will run a Codex review job.
3. **Blacksmith OSS.** Free minutes plus a Docker Hub pull mirror, with an OSS program for
   permissive-license projects. Do the free Docker fix first and only apply if it persists.
4. **Socket.dev OSS Team.** Free for open source, protects installs for Genesis and its consumers.
5. **Sentry OSS.** Asks only for MIT or similar; use it on the sample app and starter.
6. **Algolia DocSearch.** Free docs search with a 1 to 2 day review, but only once a docs site exists.
7. **GitHub Secure Open Source Fund.** $10k plus Azure credits; wait for community traction and
   governance files.
8. **Open Source Collective.** Lets sponsors pay for the AI and CI spend the other programs don't cover.

Do now with no application: Docker login, ECR/GHCR mirrors and image cache, Dependabot, CodeQL,
Scorecard, `.coderabbit.yaml`, the community files, package metadata.
