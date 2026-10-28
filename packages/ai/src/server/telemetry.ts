import type { TelemetrySink } from "../types";

/** The part of an OpenTelemetry `Tracer` the sink uses, so the package doesn't depend on OTel. */
export interface TracerLike {
  startSpan(name: string, options: { startTime: number; attributes: Record<string, string | number | boolean> }): { end(endTime?: number): void };
}

/** Sends genesis-ai's spans to an OpenTelemetry tracer: `telemetry: otelSink(trace.getTracer("ai"))`. */
export const otelSink =
  (tracer: TracerLike): TelemetrySink =>
  (span) =>
    tracer.startSpan(span.name, { startTime: span.startTime, attributes: span.attributes }).end(span.endTime);
