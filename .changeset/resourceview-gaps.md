---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": patch
---

ResourceView gaps a consumer app found while adopting it. Every new behaviour is opt-in.

- **ResourceForm from a view.** `<ResourceForm view={tasksView} …>` opens the form ResourceView would, with no list around it: the same fields (one builder, `useViewFormFields`, now exported from `/data`), links as pickers, the viewer's scope and a single-value `filter` filled hidden on create, and the view's noun and `copy.form` words. `filter`, `defaults` and `scoped` work as on ResourceView; `fields`, `title`, `submitLabel`, `description` and `noun` still win. `resource` is optional when a view is given.
- **Calendar mode.** A view's `calendar` block takes `durationField` and `durationUnit` (`minutes`, `hours`, `days`): a row with no end runs from its start for its duration. `phoneLayout` (`"agenda"`, say) is the layout below 768px until the person picks one; unset, phones are unchanged. The screen's `calendar` takes `classNameOf(row)` and `statusOf(row)`, so a cancelled event can be struck through, with words read out and printed, rather than dropped; `EventCalendar`'s `CalendarEvent` takes `className` and `status`. `defineView` checks the new keys.
- **Calendar subtitle (fix).** Calendar mode now shows the screen's `subtitle`, else the view's `copy.subtitle`, under its title, as the list does; it used to drop it.
- **A link picker's order.** `fields.<link>.link.orderBy` is `"view"` (the linked view's `orderBy`, a `position` say) or `{ field, direction }`. Unset, a picker sorts by name as before. `relation.orderBy` on a hand-written relation field and `useLinkOptions`' target `orderBy` do the same; web's RelationField and native's link picker both send it.
