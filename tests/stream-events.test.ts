import { describe, expect, it } from "vitest";
import { compactStreamEvents } from "../src/utils/stream-events.js";

describe("stream event compaction", () => {
  it("merges adjacent stream deltas without changing order", () => {
    const compacted = compactStreamEvents([
      { runId: "a", type: "content", delta: "你", turn: 0 },
      { runId: "a", type: "content", delta: "好", turn: 0 },
      { runId: "a", type: "reasoning", delta: "想", turn: 0 },
      { runId: "a", type: "reasoning", delta: "一下", turn: 0 },
      { runId: "a", type: "content", delta: "。", turn: 0 },
      { runId: "b", type: "content", delta: "x", turn: 0 }
    ]);

    expect(compacted).toEqual([
      { runId: "a", type: "content", delta: "你好", turn: 0 },
      { runId: "a", type: "reasoning", delta: "想一下", turn: 0 },
      { runId: "a", type: "content", delta: "。", turn: 0 },
      { runId: "b", type: "content", delta: "x", turn: 0 }
    ]);
  });

  it("drops empty deltas", () => {
    expect(compactStreamEvents([
      { runId: "a", type: "content", delta: "", turn: 0 },
      { runId: "a", type: "content", delta: "ok", turn: 0 }
    ])).toEqual([
      { runId: "a", type: "content", delta: "ok", turn: 0 }
    ]);
  });
});
