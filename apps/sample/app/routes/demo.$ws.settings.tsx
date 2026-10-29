/** An owner's settings: switch this organization's features and the assistant's release flag. */
import { Navigate } from "react-router";
import { useFeature } from "@marktiderman/genesis-features/gate/react";
import { Badge } from "@marktiderman/genesis-ui";
import { SettingsPage } from "@marktiderman/genesis-ui/settings-page";
import { SettingsRow } from "@marktiderman/genesis-ui/settings-row";
import { ToggleRow } from "@marktiderman/genesis-ui/toggle-row";
import { useDemo } from "../demo/context";
import { demoFeatures, type DemoFeatureId } from "../demo/features";
import { ViewSource } from "../demo/source";
import featuresSource from "../demo/features.ts?raw";

function GateStatus({ id }: { id: DemoFeatureId }) {
  const answer = useFeature(id);
  return answer.on ? <Badge>On</Badge> : <Badge variant="outline">Off: {answer.reason === "entitlement" ? "needs a plan" : answer.reason}</Badge>;
}

export default function DemoSettings() {
  const { org, role, overrides, setOverrides, href } = useDemo();
  if (role !== "owner" || !org) return <Navigate to={href()} replace />;
  const baseOff = new Set(org.off);
  const isOff = (id: string) => baseOff.has(id) ? !overrides.flags[`on:${id}`] : overrides.off.includes(id);
  const setOn = (id: string, on: boolean) => {
    if (baseOff.has(id)) setOverrides({ ...overrides, flags: { ...overrides.flags, [`on:${id}`]: on } });
    else setOverrides({ ...overrides, off: on ? overrides.off.filter((x) => x !== id) : [...overrides.off, id] });
  };
  const ids = Object.keys(demoFeatures) as DemoFeatureId[];
  return (
    <SettingsPage
      title="Settings"
      description={`${org.name}'s features. The menu and the pages follow the gate at once; the gate never decides who may see data (roles and row rules do).`}
      actions={<ViewSource files={{ "features.ts": featuresSource }} />}
      sections={[
        {
          id: "features",
          title: "Features",
          description: "Turn a feature off for this organization only.",
          content: (
            <>
              {ids.map((id) => (
                <ToggleRow
                  key={id}
                  label={demoFeatures[id].name}
                  description={demoFeatures[id].summary}
                  checked={!isOff(id)}
                  onCheckedChange={(on) => setOn(id, on)}
                />
              ))}
            </>
          ),
        },
        {
          id: "flags",
          title: "Release flags",
          description: "A beta reaches an organization when its release flag is on.",
          content: (
            <ToggleRow
              label="demo-assistant.release"
              description="Holds the assistant back while it's in beta."
              checked={overrides.flags["demo-assistant.release"] ?? true}
              onCheckedChange={(on) => setOverrides({ ...overrides, flags: { ...overrides.flags, "demo-assistant.release": on } })}
            />
          ),
        },
        {
          id: "gate",
          title: "What the gate says",
          content: (
            <>
              {ids.map((id) => (
                <SettingsRow key={id} label={demoFeatures[id].name}>
                  <GateStatus id={id} />
                </SettingsRow>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}
