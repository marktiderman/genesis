---
"@marktiderman/genesis-ui": patch
---

ResourcePage and DataPageShell loading and error states:

- **Loading:** the placeholder now matches the current view. A table shows five row-height bars and a card grid shows six cards. Before, it was always a page of eight tall cards, which overflowed a list inside a panel or tab. Screen readers hear it as a loading status.
- **Error:** the error panel is now an alert (`role="alert"`), so screen readers announce a failed load.
