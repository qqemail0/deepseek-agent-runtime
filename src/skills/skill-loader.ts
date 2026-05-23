import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathExists } from "../utils/fs.js";
import { estimateTokens, truncateByTokens } from "../utils/text.js";

export type SkillScope = "project" | "global";

export interface SkillSummary {
  name: string;
  description: string;
  path: string;
  scope: SkillScope;
  tokens: number;
}

export interface LoadedSkill extends SkillSummary {
  body: string;
}

export interface SkillListOptions {
  includeGlobal?: boolean;
}

export class SkillLoader {
  constructor(private readonly workspaceRoot: string) {}

  async listSkills(options: SkillListOptions = {}): Promise<SkillSummary[]> {
    const roots = this.skillRoots(Boolean(options.includeGlobal));
    const skills: SkillSummary[] = [];
    const seenPaths = new Set<string>();

    for (const { root, scope } of roots) {
      if (!(await pathExists(root))) {
        continue;
      }

      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillPath = path.join(root, entry.name, "SKILL.md");
        if (!(await pathExists(skillPath))) {
          continue;
        }
        const resolvedPath = path.resolve(skillPath);
        if (seenPaths.has(resolvedPath)) {
          continue;
        }
        seenPaths.add(resolvedPath);

        const text = await fs.readFile(skillPath, "utf8");
        const { frontmatter } = parseFrontmatter(text);
        skills.push({
          name: frontmatter.name ?? entry.name,
          description: frontmatter.description ?? "No description provided.",
          path: skillPath,
          scope,
          tokens: estimateTokens(frontmatter.description ?? "")
        });
      }
    }

    return dedupeSkills(skills).sort((a, b) => {
      if (a.scope !== b.scope) {
        return a.scope === "project" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async loadSkill(name: string, maxTokens = 3000, options: SkillListOptions = {}): Promise<LoadedSkill | undefined> {
    const summaries = await this.listSkills(options);
    const match = summaries.find((skill) => skill.name === name);
    if (!match) {
      return undefined;
    }

    return this.readSkill(match, maxTokens);
  }

  async loadSkillByPath(skillPath: string, maxTokens = 3000, options: SkillListOptions = {}): Promise<LoadedSkill | undefined> {
    const summaries = await this.listSkills(options);
    const resolved = path.resolve(skillPath);
    const match = summaries.find((skill) => path.resolve(skill.path) === resolved);
    if (!match) {
      return undefined;
    }

    return this.readSkill(match, maxTokens);
  }

  private async readSkill(match: SkillSummary, maxTokens: number): Promise<LoadedSkill> {
    const text = await fs.readFile(match.path, "utf8");
    const { body } = parseFrontmatter(text);
    return {
      ...match,
      body: truncateByTokens(body.trim(), maxTokens)
    };
  }

  private skillRoots(includeGlobal: boolean): Array<{ root: string; scope: SkillScope }> {
    const roots: Array<{ root: string; scope: SkillScope }> = [
      { root: path.join(this.workspaceRoot, ".agent", "skills"), scope: "project" }
    ];

    if (includeGlobal) {
      const home = os.homedir();
      roots.push(
        { root: path.join(home, ".agents", "skills"), scope: "global" },
        { root: path.join(home, ".codex", "skills"), scope: "global" }
      );
    }

    return roots;
  }
}

function dedupeSkills(skills: SkillSummary[]): SkillSummary[] {
  const byKey = new Map<string, SkillSummary>();
  for (const skill of skills) {
    const key = `${skill.scope}:${skill.name.trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || existing.path.length > skill.path.length) {
      byKey.set(key, skill);
    }
  }
  return [...byKey.values()];
}

export function parseFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  if (!text.startsWith("---")) {
    return { frontmatter: {}, body: text };
  }

  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: text };
  }

  const raw = text.slice(3, end).trim();
  const frontmatter: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    frontmatter[key] = value;
  }

  return { frontmatter, body: text.slice(end + 4) };
}
