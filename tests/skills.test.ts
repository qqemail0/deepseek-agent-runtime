import { describe, expect, it } from "vitest";
import type { SkillSummary } from "../src/skills/skill-loader.js";
import { parseFrontmatter } from "../src/skills/skill-loader.js";
import { rankSkills, selectSkills } from "../src/skills/skill-router.js";

describe("skill frontmatter", () => {
  it("extracts name and description", () => {
    const parsed = parseFrontmatter(`---
name: demo
description: Demo skill
---

# Body`);
    expect(parsed.frontmatter.name).toBe("demo");
    expect(parsed.frontmatter.description).toBe("Demo skill");
    expect(parsed.body).toContain("# Body");
  });
});

describe("skill router", () => {
  const skills: SkillSummary[] = [
    skill("Code", "Coding workflow with planning and verification.", "global"),
    skill("agency-agents", "Specialist agent library for product design, backend/frontend engineering, testing, and strategy.", "global"),
    skill("frontend-design", "Create production-grade frontend interfaces and UI systems.", "global"),
    skill("deepseek-optimizer", "Optimize DeepSeek cache hit rate, token cost, model routing, and thinking mode.", "project"),
    skill("autoglm-browser-agent", "Control browser tasks, search web pages, and open URLs.", "global")
  ];

  it("selects global skills by task relevance", () => {
    const selected = selectSkills("Upgrade the desktop UI and frontend interaction design", skills, 2);
    expect(selected[0]?.name).toBe("frontend-design");
  });

  it("selects project optimization skills for cache and token tasks", () => {
    const selected = selectSkills("Improve DeepSeek token cache hit rate and model routing", skills, 2);
    expect(selected[0]?.name).toBe("deepseek-optimizer");
  });

  it("keeps reasons for diagnostics without selecting unrelated skills", () => {
    const ranked = rankSkills("Open https://example.com in a browser", skills);
    expect(ranked[0]?.name).toBe("autoglm-browser-agent");
    expect(ranked.find((item) => item.name === "Code")?.score).toBe(0);
  });
});

function skill(name: string, description: string, scope: SkillSummary["scope"]): SkillSummary {
  return {
    name,
    description,
    path: `C:/skills/${name}/SKILL.md`,
    scope,
    tokens: 30
  };
}
