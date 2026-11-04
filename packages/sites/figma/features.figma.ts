// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=135-250
// source=packages/sites/src/sections/features.tsx
// component=features
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "grid": "grid", "list": "list", "alternating": "alternating", "steps": "steps" })
export default {
  example: figma.code`{
  id: "features",
  type: "features",
  v: 1,
  variant: "${variant}",
  props: { heading: "What you get", items: [{ title: "Guided sessions", body: "A coach in every class." }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-features',
  metadata: { nestable: false },
}
