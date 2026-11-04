// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-501
// source=packages/sites/src/sections/schedule.tsx
// component=schedule
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "grid": "grid", "agenda": "agenda" })
export default {
  example: figma.code`{
  id: "schedule",
  type: "schedule",
  v: 2,
  variant: "${variant}",
  props: { heading: "Class times", sessions: [{ day: "mon", start: "18:00", end: "19:00", title: "Session name" }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-schedule',
  metadata: { nestable: false },
}
