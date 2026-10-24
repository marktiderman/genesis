export default function Root({ children }: { children: unknown }) {
  return <html lang="en"><body>{children as never}</body></html>;
}
