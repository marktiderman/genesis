// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-406
// source=packages/ui/src/components/ui/table.tsx
// component=Table
// Table has no Figma properties: the columns and rows are the screen's. For a list of records
// use ResourceView (DataTable), not a hand-built table.
import figma from 'figma'

export default {
  example: figma.code`<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Acme</TableCell>
      <TableCell>Active</TableCell>
    </TableRow>
  </TableBody>
</Table>`,
  imports: ['import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@marktiderman/genesis-ui"'],
  id: 'table',
  metadata: { nestable: true },
}
