---
"@marktiderman/genesis-cli": minor
---

The EAS template `deploy-production.yml` now ships on every merge to `main` instead of on a pushed `v*.*.*` tag, with no approval job: `main`'s protected merge is the approval. Per platform, a JavaScript-only merge publishes an over-the-air update to every `production` install (no staged share: EAS allows one rollout at a time, so a staged one would make the next merge's update fail); a native change builds and submits in the same run, so an update never goes to a build nobody has. Take an update back with `eas update:republish --group <id>`; `rollout.yml` stays for an update staged by hand. An app that kept the tag trigger keeps it until it takes the new template.
