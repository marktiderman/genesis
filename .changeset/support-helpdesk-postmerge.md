---
"@marktiderman/genesis-support": patch
---

Follow-ups from the help desk's post-merge review:

- **Enter never sends a picker's trigger text.** While a `!`, `?` or `@` list offers something and the arrow keys haven't moved into it, Enter does nothing, so "!refund" isn't sent to the customer by habit. Arrows then Enter, Tab or a click inserts; Escape closes the list and Enter then sends. With no match, Enter sends as before, and "Merci !" never opens a list.
- **`!` and `?` open their list only when a letter follows them**, as documented: "Prix ?1" and "Ça marche ?)" stay words. Any script's letters count ("?été").
- **An empty `{first_name}` or `{name}` takes the comma that set it off.** "Thanks, {first_name}." reads "Thanks." rather than "Thanks,."; at the start of a line, indented or not, the comma after it goes ("  {first_name}, hi" reads "  hi"). Other punctuation stays.
- **Office hours say why they fell back.** When `Intl.DateTimeFormat` throws or has no time zone support (some phone engines), `officeHoursState` still says open, and a development build now says so once with `console.warn` instead of nothing.
- **`useSupportThread().awaiting` is null on a closed report** (addressed or won't fix): no answer is coming.
- **Saved replies' name variables follow `resolveUser`** when it names the requester after the first render (a stable function reading a cache filled later).
