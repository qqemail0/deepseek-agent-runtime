import type { AgentStreamEvent } from "../core/types.js";

export type RunStreamEvent = AgentStreamEvent & { runId: string };

export function compactStreamEvents(events: RunStreamEvent[]): RunStreamEvent[] {
  const compacted: RunStreamEvent[] = [];

  for (const event of events) {
    if (!event.delta) {
      continue;
    }
    const previous = compacted.at(-1);
    if (previous && previous.runId === event.runId && previous.type === event.type && previous.turn === event.turn) {
      previous.delta += event.delta;
      continue;
    }
    compacted.push({ ...event });
  }

  return compacted;
}
