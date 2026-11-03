// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-1879
// source=packages/ui/src/components/data/DataPageShell.tsx
// component=DataPageShell
// The four states map to the shell's own flags: loading -> isLoading, empty -> isEmpty,
// error -> hasError (with onRetry).
import figma from 'figma'
const instance = figma.selectedInstance

const state = instance.getEnum('state', { default: 'default', loading: 'loading', empty: 'empty', error: 'error' })

const stateProps =
  state === 'loading'
    ? figma.code`
  isLoading`
    : state === 'empty'
      ? figma.code`
  isEmpty
  emptyAction={emptyAction}`
      : state === 'error'
        ? figma.code`
  hasError
  onRetry={refetch}`
        : ''

export default {
  example: figma.code`<DataPageShell
  title="Items"
  createAction={createAction}${stateProps}
>
  {content}
</DataPageShell>`,
  imports: ['import { DataPageShell } from "@marktiderman/genesis-ui/data"'],
  id: 'data-page-shell',
  metadata: { nestable: false },
}
