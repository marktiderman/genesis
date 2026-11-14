---
"@marktiderman/genesis-ui": minor
---

Features: ui-twins
A web twin for every genesis-ui-native component that had none (ui-parity.json), with the phone component's props: `Banner` and `InlineAlert` (the Alert, tinted, with dismiss and actions), `ChoiceCard` (the RadioGroup's item, or with `multiple` a checkbox), `ChipGroup` with `ChipGroupItem` (the toggle Chip on Radix's ToggleGroup, `multiple` or `single`), `Combobox` (Command in a Popover), `NumberInput` (a spinbutton with − and + on the InputGroup, with a ref, `name` and `onBlur` for a form), `RangeSlider`, `Stepper`, `TimePicker` (an "HH:MM" string or a Date; typed times read as on the phone), `WhatsNewSheet` (a dialog that rises as a sheet on a phone-width screen) and `NotificationsPage` (day headings counted in the browser or on a given `now` and `timeZone`, unread rows, Mark all read). Each takes its behaviour from `@marktiderman/genesis-core/headless`.

`Slider` draws a thumb per value and takes `thumbLabels`. SortableList, ChartContainer's ChartStyle, StatCard's trend, FieldArrayRenderer, WizardForm and FileUploadField now use the same genesis-core rules as their phone twins; what they render is unchanged.

A new doctor rule, `times-use-time-picker` (warn, new files), points a browser `<Input type="time">` at TimePicker. `InputOTP` strips the spaces, dashes and dots of a pasted code, as the phone's does.
