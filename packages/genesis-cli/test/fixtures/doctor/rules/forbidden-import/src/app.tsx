import { Button } from "@marktiderman/genesis-ui";
import * as Dialog from "@radix-ui/react-dialog";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Thing } from "../components/ui/thing";
// import { Old } from "@radix-ui/react-popover";
const Lazy = () => import("~/components/ui/lazy");
export { Button, Dialog, Card, cn, Thing, Lazy };
