/**
 * `@marktiderman/genesis-features/gate/react`: the gate's answers in React,
 * on the web and in React Native. The server computes a {@link GateSnapshot}
 * once per session and the provider hands it down; components never decide
 * on their own.
 *
 * @stability Beta
 */
import { createContext, useContext, type ReactNode } from "react";
import { fromSnapshot, type GateAnswer, type GateSnapshot } from "./gate";

const GateContext = createContext<GateSnapshot | null>(null);

/** Hands the session's gate answers to every {@link useFeature} below it. @stability Beta */
export function FeatureGateProvider({
  snapshot,
  children,
}: {
  snapshot: GateSnapshot;
  children: ReactNode;
}) {
  return (
    <GateContext.Provider value={snapshot}>{children}</GateContext.Provider>
  );
}

/**
 * The gate's answer for one feature. Outside a {@link FeatureGateProvider}
 * this throws: a missing provider would otherwise turn every feature off
 * without a word.
 *
 * @stability Beta
 */
export function useFeature(id: string): GateAnswer {
  const snapshot = useContext(GateContext);
  if (!snapshot)
    throw new Error(
      `useFeature("${id}") needs a <FeatureGateProvider> above it`,
    );
  return fromSnapshot(snapshot, id);
}

/** @stability Beta */
export interface FeatureGateProps {
  /** The feature this content belongs to. */
  feature: string;
  children: ReactNode;
  /** Shown when a plan would unlock the feature: an upgrade prompt, a locked row. Defaults to `fallback`. */
  upsell?: (answer: GateAnswer & { unlock: { plan: string } }) => ReactNode;
  /** Shown for any other "off". Defaults to nothing. */
  fallback?: ReactNode;
}

/**
 * Renders `children` when the feature is on; `upsell` when a plan would turn
 * it on; otherwise `fallback`.
 *
 * ```tsx
 * <FeatureGate feature="form-webhook-delivery" upsell={({ unlock }) => <UpgradeRow plan={unlock.plan} />}>
 *   <WebhookSettings />
 * </FeatureGate>
 * ```
 *
 * @stability Beta
 */
export function FeatureGate({
  feature,
  children,
  upsell,
  fallback = null,
}: FeatureGateProps) {
  const answer = useFeature(feature);
  if (answer.on) return <>{children}</>;
  if (answer.reason === "entitlement" && answer.unlock && upsell)
    return <>{upsell({ ...answer, unlock: answer.unlock })}</>;
  return <>{fallback}</>;
}
