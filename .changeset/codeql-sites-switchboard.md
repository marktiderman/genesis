---
"@marktiderman/genesis-sites": patch
"@marktiderman/genesis-switchboard": patch
---

Fix CodeQL alerts. Sites: `checkHtmlOutline` skips `<script>` and `<style>` content with one linear, case-insensitive pass that matches end tags like `</script >`, instead of regex stripping; `absoluteUrl` trims trailing slashes without a backtracking regex. Switchboard (gitdata): single-quoted frontmatter escapes backslashes before quotes (and reads `''` as `'`), and the `# Title` heading match is linear and no longer expands `$&` in a new title.
