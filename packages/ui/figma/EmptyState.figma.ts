// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-285
// source=packages/ui/src/components/patterns/empty-state.tsx
// component=EmptyState
// "variant" has no prop: no-results is NoSearchResults (the same component with the
// filtered copy), default is EmptyState, and error is EmptyState with an error title.
import figma from 'figma'
const instance = figma.selectedInstance

const variant = instance.getEnum('variant', { default: 'default', 'no-results': 'no-results', error: 'error' })
const showAction = instance.getBoolean('Show action')

const action = showAction ? figma.code`
  action={<Button onClick={onCreate}>Create</Button>}` : ''

export default {
  example:
    variant === 'no-results'
      ? figma.code`<EmptyState hasFilters onClearFilters={onClearFilters}${action} />`
      : variant === 'error'
        ? figma.code`<EmptyState title="Something went wrong" description={errorMessage}${action} />`
        : figma.code`<EmptyState title="Nothing here yet" description="Create your first item."${action} />`,
  imports: ['import { EmptyState, Button } from "@marktiderman/genesis-ui"'],
  id: 'empty-state',
  metadata: { nestable: true },
}
