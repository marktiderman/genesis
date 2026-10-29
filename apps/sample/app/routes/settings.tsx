// A settings screen on the Genesis settings layout: SettingsPage holds the
// sections, SettingsRow labels each control, ToggleRow is a labelled switch.
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@marktiderman/genesis-ui";
import { SettingsPage } from "@marktiderman/genesis-ui/settings-page";
import { SettingsRow } from "@marktiderman/genesis-ui/settings-row";
import { ToggleRow } from "@marktiderman/genesis-ui/toggle-row";

export default function Settings() {
  return (
    <SettingsPage
      title="Settings"
      description="Manage your application preferences."
      actions={<Button testID="settings-button-1">Save changes</Button>}
      sections={[
        {
          id: "general",
          title: "General",
          content: (
            <>
              <SettingsRow label="Application name" description="The display name for your app" htmlFor="app-name">
                <Input id="app-name" defaultValue="Sample App" className="w-48" />
              </SettingsRow>
              <SettingsRow label="Language" description="Choose your preferred language" htmlFor="app-language">
                <Select defaultValue="en">
                  <SelectTrigger id="app-language" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsRow>
              <SettingsRow label="Theme" description="Select light or dark mode" htmlFor="app-theme">
                <Select defaultValue="light">
                  <SelectTrigger id="app-theme" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsRow>
            </>
          ),
        },
        {
          id: "notifications",
          title: "Notifications",
          content: <ToggleRow label="Email notifications" description="Receive email notifications" defaultChecked />,
        },
      ]}
    />
  );
}
