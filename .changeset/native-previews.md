---
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-cli": minor
---

Previews on the phone, opened by a link, and the doctor's missed-value check.

- **genesis-native:** preview links (`previewLinkChannel`, `previewLink`, `previewPath`, `PREVIEW_PATH`), read by `normalizeLink` where the app's own `map` has no pattern for the path (an app's `/preview/:id` route keeps its links; `links.previews: false` turns previews off). `PreviewScreen`, `PreviewNotice` (the updates block's new `previewNotice` slot) and `useChannelState`. The channel switcher gains `prepare`, `restart`, `state`, `recover`, `subscribe`, `noteDownloaded` and `holdReload`, runs its writes one at a time, remembers the build's channel, and heals when a preview's channel was deleted. `switchTo` and `prepare` are async: a bad channel name, or switching while it's off, now rejects their promise instead of throwing synchronously, so catch it (`await` in a try, or `.catch`). The `channels` docs now turn switching on in release builds (`{ enabled: true }`); it can't work in a development client.
- **genesis-cli:** `pr-preview.yml` publishes each pull request as an update on `pr-<number>` for the release builds people already have, and comments a preview link and QR code; it builds a preview only when native code changed. New `pr-preview-teardown.yml` deletes the channel when the pull request closes. `release.previews` (`origin`, `scheme`) and the `previews` template set (`genesis add template previews`). New rule `missed-value` (info) reports blocks an app doesn't use, ones it switched off, and a missing preview lane, with `doctor.declined` for the ones it doesn't want; block manifests take `detect`.
