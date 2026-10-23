---
"@marktiderman/genesis-forms": patch
---

`validateSubmission` refuses a submission that would be too much work, with an error under `""`, instead of relying on the host's request size limit. Besides `maxEvents` (`MAX_EVENTS`, 10,000), two new limits, each overridable: `maxValues` (`MAX_SUBMISSION_VALUES`, 200,000 JSON values across the answers, answer events and hidden inputs) and `maxReplayWork` (`MAX_REPLAY_WORK`, 2,000,000 units: one per block for each walk of the path, one per calculated field for each settle, and a formula's size each time it is worked out). A log built so that every step works out every formula (2,000 fields over a 10,000-row table with logic reading one) is now refused in about 0.2 s instead of taking about 5 s.
