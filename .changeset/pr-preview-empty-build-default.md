---
"@marktiderman/genesis-cli": patch
---

The release template's `pr-preview.yml` gives `IOS_BUILD` and `ANDROID_BUILD` an empty default
(`${{ needs.get_release_ios_build.outputs.build_id || '' }}`). When no release build matched the
fingerprint, `get-build` set no output and EAS refused the whole workflow before any job ran
(`[env.IOS_BUILD]: Invalid input`); now the preview builds natively instead. Run
`genesis release` (or copy the two lines) to take it into an app.
