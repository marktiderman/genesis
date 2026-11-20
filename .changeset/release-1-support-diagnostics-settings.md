---
"@marktiderman/genesis-support": patch
---

The dump follows its settings while the app runs, and never sends two dumps for one shake.

- New migration `0028_genesis_support_diagnostics_fixes.sql` (copy it with `genesis migrate`): a whole number stored as `10.0` in `diagnostics.perHour` or `diagnostics.retentionDays` reads as 10 (0020 cast it straight to integer, so every dump insert, or the purge, failed); and a dump must say its schema (`{}` and `{"schema": null}` passed 0019's check). The new check is `NOT VALID`: rows already stored aren't re-read.
- `diagnostics.maxBytes` goes up to 524,288 (512 KB), the most the database stores; it allowed 1 MiB, and dumps between the two were refused.
- `createDiagnosticsHandler` honours `diagnostics.enabled`: off, a dump is refused (403 `diagnostics_off`) and feedback is stored without its dump. `appSettings` takes a function (async too, such as `resolveAppSettings`), read at most once every `settingsCacheMs` (default 30 s); one that fails keeps the last values. `diagnostics.perHour` follows it.
- `createSupport` reads `diagnostics.enabled`, `dumpOnShake`, `dumpOnFeedback` and `sendFromSettings` each time they're used (with an `appSettings` function), not once at creation; `block.diagnostics` and `block.options.diagnostics` are null/undefined while diagnostics are off. The devtools "Send diagnostics" row is always registered when the app passes `diagnostics`, and draws nothing while it is off. `createDiagnostics` also takes an `appSettings` function and reads `enabled` and `maxBytes` when a dump is made or sent; `submitFeedback` takes `report` to send a dump made earlier.
- A shake makes one dump and hands it to the feedback screen it opens: it goes with the report (linked both ways), or on its own if the person leaves without sending one, or after 15 seconds if no screen takes it. Before, the shake's dump went at once, unlinked, and the report sent a second one; both counted against the hourly limit.
- The native agent desk (`useAgentThread`) reads the thread, the ticket and the queues again after a reply, a status change or a live message on a cold start too: `refresh` now follows the signed-in login, so it no longer invalidates the keys of nobody.
