// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=135-503
// source=packages/sites/src/sections/pricing.tsx
// component=pricing
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "cards": "cards", "compact": "compact" })
export default {
  example: figma.code`{
  id: "pricing",
  type: "pricing",
  v: 1,
  variant: "${variant}",
  props: { heading: "Simple plans", tiers: [{ name: "Monthly", price: "£79", period: "per month", features: ["Unlimited classes"] }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-pricing',
  metadata: { nestable: false },
}
