import { describe, expect, it } from "vitest";
import { planDirectDesktopOpen } from "../src/core/orchestrator.js";

describe("direct desktop open planner", () => {
  it("opens the current workspace without model tokens", () => {
    expect(planDirectDesktopOpen("\u6253\u5f00\u5f53\u524d\u5de5\u4f5c\u533a")?.args).toEqual({
      target: ".",
      kind: "path"
    });
  });

  it("opens relative project files directly", () => {
    expect(planDirectDesktopOpen("open package.json")?.args).toEqual({
      target: "package.json",
      kind: "path"
    });
  });

  it("does not guess a target for vague folder open requests", () => {
    expect(planDirectDesktopOpen("\u6253\u5f00\u6587\u4ef6\u76ee\u5f55")).toBeUndefined();
    expect(planDirectDesktopOpen("open folder")).toBeUndefined();
  });

  it("still opens explicit current folders directly", () => {
    expect(planDirectDesktopOpen("\u6253\u5f00\u5f53\u524d\u76ee\u5f55")?.args).toEqual({
      target: ".",
      kind: "path"
    });
  });

  it("opens known websites by name", () => {
    const operation = planDirectDesktopOpen("open GitHub");
    expect(operation?.args).toEqual({
      target: "https://github.com",
      kind: "url"
    });
    expect(operation?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("opens common local apps by alias", () => {
    expect(planDirectDesktopOpen("open VSCode")?.args).toEqual({
      target: "code",
      kind: "app"
    });
  });
});
