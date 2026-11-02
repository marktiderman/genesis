/**
 * Code Connect: the Figma Avatar in the Genesis library ↔ NativeAvatar.
 *
 * Published with `npx figma connect publish` (figma.config.json at the repo
 * root). The first mapping, used to confirm the Figma plan accepts
 * Code Connect writes; the rest of the library follows the same shape.
 */
import figma from "@figma/code-connect";
import { NativeAvatar } from "../src/components/avatar";

figma.connect(
  NativeAvatar,
  "https://www.figma.com/design/iv9xTsgM7t2mBff8dniDk0/Growth90-Zones-v2-prototype?node-id=1-123",
  {
    props: {
      fallback: figma.textContent("Initials"),
    },
    example: ({ fallback }) => <NativeAvatar fallback={fallback} size={40} />,
  },
);
