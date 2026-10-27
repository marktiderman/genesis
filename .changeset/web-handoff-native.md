---
"@marktiderman/genesis-native": minor
---

`/web-handoff`: `openOnWeb(path, { endpoint, getAccessToken, browser })` opens a page of the web app signed in as the app's person, through genesis-supabase's web-handoff routes, in the in-app browser (`expo-web-browser`, passed in). It refuses paths that aren't the web app's own and never opens another origin; without a signed-in link it opens the page signed out so the person can sign in and land there. `signOutOnWeb({ endpoint, getAccessToken })`, called just before the app's own sign-out, ends the web sessions that app session handed off; it never throws. Features: web-handoff
