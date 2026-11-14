---
"@marktiderman/genesis-support": patch
---

Follow-ups from the help desk's post-merge review:

- **Enter never sends a picker's trigger text.** While a `!`, `?` or `@` list offers something, or is still loading, and the arrow keys haven't moved into it, Enter does nothing, so "!refund" isn't sent to the customer by habit. The list now says "Esc to close" (`copy.agentInbox.pickerHint`). Arrows then Enter, Tab or a click inserts; Escape closes the list and Enter then sends. With no match, Enter sends as before, and "Merci !" never opens a list.
- **`!` and `?` open their list only when a letter follows them**, as documented: "Prix ?1" and "Ça marche ?)" stay words. Any script's letters count ("?été").
- **An empty `{first_name}` or `{name}` takes the separator that joined it.** At the start of a line, indented or not, the comma, colon or semicolon after it goes ("  {first_name}, hi" reads "  hi", "{first_name}: here's the fix" reads "here's the fix"). Elsewhere a comma before it goes only when it ends its clause: "Thanks, {first_name}." reads "Thanks." rather than "Thanks,.", and "As discussed, {first_name} will call you." reads "As discussed, will call you.".
- **Office hours say why they fell back.** When `Intl.DateTimeFormat` throws or has no time zone support (some phone engines), `officeHoursState` still says open, and a development build now says so once with `console.warn` instead of nothing.
- **`useSupportThread().awaiting` is null on a closed report** (addressed or won't fix): no answer is coming.
- **Saved replies' name variables follow `resolveUser`** when it names the requester after the first render (a stable function reading a cache filled later).
