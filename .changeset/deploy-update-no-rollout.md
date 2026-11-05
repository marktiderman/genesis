---
"@marktiderman/genesis-cli": patch
---

The EAS template `deploy-production.yml` publishes its updates without `rollout_percentage`. Unset, an update goes to every install; set to 100, EAS published it as a rollout and the update job failed with "GraphQL request failed".
