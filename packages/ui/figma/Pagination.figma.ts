// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-118
// source=packages/ui/src/components/ui/pagination.tsx
// component=Pagination
// Pagination is the shadcn link row; it has no summary or page-size prop. The "Summary" text
// is a sibling line, and "Show page size" adds a Select beside it (ViewSettings holds the
// same control in a page header).
import figma from 'figma'
const instance = figma.selectedInstance

const summary = instance.getString('Summary')
const showPageSize = instance.getBoolean('Show page size')

export default {
  example: figma.code`<div className="flex items-center justify-between">
  <p className="text-sm text-muted-foreground">${summary}</p>${showPageSize ? figma.code`
  <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="25">25</SelectItem>
      <SelectItem value="50">50</SelectItem>
    </SelectContent>
  </Select>` : ''}
  <Pagination>
    <PaginationContent>
      <PaginationItem><PaginationPrevious href="#" onClick={onPrevious} /></PaginationItem>
      <PaginationItem><PaginationNext href="#" onClick={onNext} /></PaginationItem>
    </PaginationContent>
  </Pagination>
</div>`,
  imports: [
    'import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@marktiderman/genesis-ui"',
  ],
  id: 'pagination',
  metadata: { nestable: true },
}
