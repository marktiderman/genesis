---
"@marktiderman/genesis-work": minor
---

Sessions gain attendees by person record (exactly one of a login or the app's person record, resolved through genesis-supabase's viewer-people hook), RSVPs, capacity with bookings and a waitlist (`book_session`, `cancel_booking`, `session_places`, `settle_session_bookings`), self check-in (`check_in`), and recurring series (`session_series`, `extend_series`), in migration 0007.

Features: sessions
