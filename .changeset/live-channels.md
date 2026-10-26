---
"@marktiderman/genesis-core": minor
---

Live updates scale: the Supabase provider shares one realtime channel per resource and list filter (the first equality filter narrows it on the server; deletes still arrive), skips the echo of this client's own writes, and passes an update's row for resources read from their own table. `live` patches those rows' cached fields at once and refetches only the lists the change could touch.
