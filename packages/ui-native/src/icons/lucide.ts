/**
 * `lucideIcons` — the lucide-react-native icon for every semantic name, the
 * icon set `NativeIcon` draws on Android and web (and on iOS when an SF
 * Symbol can't be drawn). Opt in by importing this subpath and passing it as
 * `modules.icons`; the rest of the package never imports lucide.
 *
 * Needs lucide-react-native 0.475 or later (the names below).
 *
 * @stability Beta
 */
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleX,
  Clock,
  Ellipsis,
  ExternalLink,
  Funnel,
  Heart,
  House,
  Info,
  Lock,
  LogOut,
  Mail,
  Menu,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share,
  Star,
  Trash2,
  TriangleAlert,
  User,
  X,
} from "lucide-react-native";
import type { NativeIconName } from "../icon-names";
import type { GenesisIconComponent } from "../native-modules";

export const lucideIcons: Record<NativeIconName, GenesisIconComponent> = {
  "arrow-left": ArrowLeft,
  bell: Bell,
  calendar: Calendar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  clock: Clock,
  close: X,
  edit: Pencil,
  error: CircleX,
  "external-link": ExternalLink,
  filter: Funnel,
  heart: Heart,
  home: House,
  info: Info,
  lock: Lock,
  "log-out": LogOut,
  mail: Mail,
  menu: Menu,
  minus: Minus,
  more: Ellipsis,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  share: Share,
  star: Star,
  success: CircleCheck,
  trash: Trash2,
  user: User,
  warning: TriangleAlert,
  // The cast widens lucide's declared `color: string` to `ColorValue`. On iOS
  // NativeIcon passes theme roles as `PlatformColor` objects; lucide hands
  // `color` to react-native-svg's stroke, whose extractBrush resolves
  // PlatformColor and DynamicColorIOS objects (react-native-svg 15,
  // src/lib/extract/extractBrush.ts).
} as Record<NativeIconName, GenesisIconComponent>;
