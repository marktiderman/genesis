import { Settings as SettingsIcon } from "lucide-react";
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  Separator,
} from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";

export default function Settings() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your application preferences."
        icon={SettingsIcon}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle>General</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Application Name</p>
              <p className="text-xs text-muted-foreground">The display name for your app</p>
            </div>
            <Input defaultValue="Sample App" className="w-48" />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Notifications</p>
              <p className="text-xs text-muted-foreground">Receive email notifications</p>
            </div>
            <Checkbox defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Language</p>
              <p className="text-xs text-muted-foreground">Choose your preferred language</p>
            </div>
            <Select defaultValue="en">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Select light or dark mode</p>
            </div>
            <Select defaultValue="light">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>Save Changes</Button>
      </div>
    </div>
  );
}
