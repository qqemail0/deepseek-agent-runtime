import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentConfig } from "../config/load-config.js";
import { SkillLoader } from "../skills/skill-loader.js";
import { rankSkills, type RankedSkill } from "../skills/skill-router.js";
import { listFilesRecursive, readTextIfExists } from "../utils/fs.js";
import { estimateTokens, truncateByTokens } from "../utils/text.js";
import { AlgorithmOptimizer } from "./algorithm-optimizer.js";
import type { AttachedContextFile, BuiltContext, ContextBudgetReport, ContextItem, TaskProfile } from "./types.js";

const execFileAsync = promisify(execFile);

const BASE_SYSTEM_PROMPT = `You are a local AI coding agent runtime.
Your job is to solve the user's task with minimal token use and high precision.

Stable operating rules:
1. Use tools only when the answer depends on local files, shell output, git state, or external tool state.
2. Prefer search before reading large files.
3. Read only relevant file fragments where possible.
4. Never invent file contents, command results, or test results.
5. Keep final answers concise: changed files, verification, remaining risks.
6. High-risk operations require permission.
7. If information is insufficient, call a tool instead of guessing.
8. For coding work, follow an evidence-first loop: inspect, change, verify, then summarize.

Tool protocol:
- Tool arguments must be minimal and specific.
- Do not repeat the same tool call if the result is already available.
- Summarize tool results before using them in the final answer.

Output contract:
- For code changes: state what changed and how it was verified.
- For analysis: cite the files or tool outputs used.
- For uncertainty: say exactly what is unknown and what would verify it.`;

const CACHE_ANCHOR_PROMPT = `Cache discipline:
- Keep this system prefix byte-stable across turns.
- Put current user tasks, selected tools, selected skills, file snippets, command output, errors, and history summaries in the dynamic tail.
- Prefer file-system pointers, hashes, compact summaries, and focused snippets over raw bulk content.
- When a local observation can be recovered by a tool call, summarize it and keep the recoverable path or command.
- Do not expand skill bodies, tool schemas, or command logs unless the task requires them.`;

const STATIC_RUNTIME_PROTOCOL = `Cacheable runtime protocol:
- Default to answer-from-known-context only for simple chat; otherwise inspect before editing.
- For code work, ask for or use precise file paths, then read the smallest needed fragments.
- For edits, prefer apply_patch and verify with targeted checks before broad test suites.
- For desktop actions, use deterministic desktop_open when intent is only to open a URL, app, folder, or file.
- For ambiguous desktop/open requests, ask one concise clarification instead of guessing the target.
- Treat project summaries as hints, not evidence; verify concrete file contents with tools before changing behavior.
- Tool schema budget is part of the prompt. Prefer the smallest viable tool set and reuse previous observations inside the same run.
- A project path in context is a pointer, not permission to infer unseen content.
- Use the execution strategy in the dynamic tail as the run contract; do not expand it into verbose planning.
- If cache health is low, first reduce dynamic context and tool schemas; do not add verbose explanations to the prompt.
- Keep final output short unless the user asks for architecture or research detail.`;

const PROMPT_PREFIX_VERSION = "deepseek-agent-prefix/v5-static-system";
const MINIMAL_CHAT_PREFIX_VERSION = "deepseek-agent-prefix/v1-minimal-chat";
const MINIMAL_CHAT_SYSTEM_PROMPT = `You are a concise local AI assistant.
Rules:
1. Answer the user directly.
2. Do not claim local files, tool output, command results, or web facts unless they were provided in the conversation.
3. Keep replies short unless the user asks for detail.`;
const TARGET_CACHE_HIT_RATE = 0.991;

export interface ContextBuildOptions {
  conversationSummary?: string;
  disabledSkillPaths?: string[];
  attachedFiles?: AttachedContextFile[];
  networkEnabled?: boolean;
  autoCompressContext?: boolean;
}

export class ContextManager {
  private readonly optimizer = new AlgorithmOptimizer();
  private readonly skillLoader: SkillLoader;

  constructor(
    private readonly config: AgentConfig,
    private readonly workspaceRoot: string
  ) {
    this.skillLoader = new SkillLoader(workspaceRoot);
  }

  async build(task: string, profile: TaskProfile, selectedToolNames: string[], optionsInput: ContextBuildOptions | string = {}): Promise<BuiltContext> {
    const options = typeof optionsInput === "string" ? { conversationSummary: optionsInput } : optionsInput;
    const minimalChatSystem = shouldUseMinimalChatSystem(profile, selectedToolNames, options);
    const systemContent = buildSystemContent(minimalChatSystem);
    const items = await this.collectItems(task, profile, selectedToolNames, options);
    const ranked = this.optimizer.rankContextItems(task, items);
    const precompressedTokens = ranked.reduce((sum, item) => sum + (item.tokens || estimateTokens(item.content)), 0);
    const dynamicBudgetTokens = options.autoCompressContext === false
      ? this.config.contextBudgetTokens
      : dynamicBudgetFor(profile, selectedToolNames, options, this.config.contextBudgetTokens);
    const compressed = options.autoCompressContext === false
      ? { items: ranked, level: "none" as const }
      : autoCompressItems(ranked, dynamicBudgetTokens);
    const selected = options.autoCompressContext === false
      ? this.optimizer.fitBudget(compressed.items, dynamicBudgetTokens)
      : optimizeSelectedForCacheTarget(
        this.optimizer.fitBudget(compressed.items, dynamicBudgetTokens),
        systemContent,
        task,
        profile,
        selectedToolNames
      );

    const dynamic = selected;
    const renderedUser = renderUserContentParts(task, dynamic, profile);
    const userContent = renderedUser.content;
    const minimumUser = renderUserContentParts(task, [], profile);

    const budgetReport = buildBudgetReport({
      budgetTokens: this.config.contextBudgetTokens,
      dynamicBudgetTokens,
      selected,
      totalItems: ranked.length,
      systemContent,
      userContent,
      cacheableUserPrefixContent: renderedUser.cacheablePrefixContent,
      volatileTailContent: renderedUser.volatileTailContent,
      minimumDynamicTokens: estimateTokens(minimumUser.volatileTailContent),
      compressedTokensSaved: Math.max(0, precompressedTokens - compressed.items.reduce((sum, item) => sum + (item.tokens || estimateTokens(item.content)), 0)),
      compressionLevel: compressed.level
    });

    return {
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent }
      ],
      items: selected,
      selectedToolNames,
      estimatedTokens: budgetReport.usedTokens,
      budgetReport
    };
  }

  private async collectItems(task: string, profile: TaskProfile, selectedToolNames: string[], options: ContextBuildOptions): Promise<ContextItem[]> {
    const items: ContextItem[] = [];
    const hasAttachments = Boolean(options.attachedFiles?.length);
    const lightweightChat = profile.kind === "chat" && !profile.needsTools && !selectedToolNames.length && !hasAttachments;

    if (!lightweightChat || selectedToolNames.length) {
      const content = [
        `Tools: ${selectedToolNames.join(", ") || "none"}.`,
        `Network: ${options.networkEnabled === false ? "off" : "on"}. Compression: ${options.autoCompressContext === false ? "off" : "auto"}.`
      ].join("\n");
      items.push({
        id: "tool-brief",
        type: "tool_brief",
        stable: false,
        score: 5,
        tokens: estimateTokens(content),
        content
      });
    }

    const rules = lightweightChat ? undefined : await readTextIfExists(path.join(this.workspaceRoot, ".agent", "rules.md"), 24_000);
    if (rules) {
      const content = truncateByTokens(rules, 420);
      items.push({
        id: "agent-rules",
        type: "rule",
        stable: true,
        score: 9,
        tokens: estimateTokens(content),
        content
      });
    }

    if (options.conversationSummary?.trim()) {
      const summary = truncateByTokens(options.conversationSummary.trim(), lightweightChat ? 160 : 260);
      items.push({
        id: "conversation-summary",
        type: "history",
        stable: false,
        score: 9,
        tokens: estimateTokens(summary),
        content: `Compressed current conversation memory:\n${summary}`
      });
    }

    if (lightweightChat) {
      return items;
    }

    const projectFiles = await listFilesRecursive(this.workspaceRoot, { maxFiles: 900 });

    const disabledSkillPaths = new Set((options.disabledSkillPaths ?? []).map((item) => path.resolve(item)));
    const skills = (await this.skillLoader.listSkills({ includeGlobal: true }))
      .filter((skill) => !disabledSkillPaths.has(path.resolve(skill.path)));
    if (skills.length) {
      const rankedSkills = rankSkills(task, skills);
      const selectedSkills = rankedSkills.filter((skill) => skill.score > 0).slice(0, 2);
      const summarySkills = selectSkillSummaries(rankedSkills, selectedSkills, 7);
      const summary = summarySkills
        .map((skill) => {
          const reasons = skill.reasons.length ? `; reasons=${skill.reasons.slice(0, 3).join(",")}` : "";
          return `- [${skill.scope}] ${skill.name}: ${skill.description}${reasons}`;
        })
        .join("\n");
      items.push({
        id: "skill-summary",
        type: "skill_summary",
        stable: false,
        score: 7,
        tokens: estimateTokens(summary),
        content: [
          `Skill shortlist from ${skills.length} enabled skills:`,
          summary ? `Relevant skill summaries:\n${summary}` : "No relevant skills matched this task.",
          "Skill bodies are loaded only when highly relevant."
        ].join("\n")
      });

      if (selectedSkills.length) {
        items.push({
          id: "skill-router-diagnostic",
          type: "diagnostic",
          stable: false,
          score: 8,
          tokens: 0,
          content: `Selected skills for this task: ${selectedSkills.map((skill) => `${skill.name} (${skill.scope})`).join(", ")}`
        });
      }

      for (const skill of selectedSkills.slice(0, 1)) {
        const loaded = await this.skillLoader.loadSkillByPath(skill.path, skillBodyBudget(profile), { includeGlobal: true });
        if (loaded) {
          items.push({
            id: `skill:${loaded.scope}:${hashText(loaded.path)}`,
            type: "skill_body",
            stable: false,
            score: 10,
            tokens: estimateTokens(loaded.body),
            content: `Loaded skill (${loaded.scope}): ${loaded.name}\nSource: ${loaded.path}\n${loaded.body}`
          });
        }
      }
    }

    if (options.attachedFiles?.length) {
      for (const file of options.attachedFiles.slice(0, 8)) {
        const content = truncateByTokens(file.content, 520);
        items.push({
          id: `attached:${file.name}`,
          type: "file",
          stable: false,
          score: 12,
          tokens: estimateTokens(content),
          content: `Attached file: ${file.path}\n${content}`
        });
      }
    }

    const [projectSummary, fileItems, gitStatus, gitDiff] = await Promise.all([
      this.buildProjectSummary(projectFiles),
      this.collectRelevantFileItems(task, profile, projectFiles),
      runGit(this.workspaceRoot, ["status", "--short"]),
      runGit(this.workspaceRoot, ["diff", "--stat", "--", "."])
    ]);

    items.push({
      id: "project-summary",
      type: "project",
      stable: true,
      score: 8,
      tokens: estimateTokens(projectSummary),
      content: projectSummary
    });

    items.push(...fileItems);

    if (gitStatus) {
      items.push({
        id: "git-status",
        type: "diff",
        stable: false,
        score: 8,
        tokens: estimateTokens(gitStatus),
        content: `git status --short:\n${truncateByTokens(gitStatus, 320)}`
      });
    }

    if (gitDiff) {
      items.push({
        id: "git-diff",
        type: "diff",
        stable: false,
        score: 10,
        tokens: estimateTokens(gitDiff),
        content: `git diff --stat:\n${truncateByTokens(gitDiff, 520)}`
      });
    }

    return items;
  }

  private async buildProjectSummary(files: string[]): Promise<string> {
    const readme = await readTextIfExists(path.join(this.workspaceRoot, "README.md"), 16_000);
    const packageJson = await readTextIfExists(path.join(this.workspaceRoot, "package.json"), 12_000);
    const topFiles = stableProjectFiles(files).slice(0, 18);
    const packageSummary = packageJson ? compactPackageJson(packageJson) : "";
    const readmeSummary = readme ? `README compact:\n${truncateByTokens(readme, 80)}` : "";

    return [
      `Workspace: ${path.basename(this.workspaceRoot) || "workspace"}`,
      `Project index sample (${topFiles.length}/${files.length} files):`,
      topFiles.map((file) => `- ${file}`).join("\n") || "(empty)",
      packageSummary,
      readmeSummary
    ].filter(Boolean).join("\n\n");
  }

  private async collectRelevantFileItems(task: string, profile: TaskProfile, files: string[]): Promise<ContextItem[]> {
    const candidates = files
      .map((file) => ({ file, score: this.optimizer.scoreFilePath(task, file) }))
      .filter((candidate) => candidate.score > 0 && isTextFile(candidate.file))
      .sort((a, b) => b.score - a.score)
      .slice(0, relevantFileLimit(profile));

    const items: ContextItem[] = [];
    for (const candidate of candidates) {
      const content = await readTextIfExists(path.join(this.workspaceRoot, candidate.file), 48_000);
      if (!content) {
        continue;
      }
      const snippet = extractFocusedSnippet(content, task, focusedSnippetBudget(profile));
      items.push({
        id: `file:${candidate.file}`,
        type: "file",
        stable: false,
        score: candidate.score,
        tokens: estimateTokens(snippet),
        content: `${candidate.file}:\n${snippet}`
      });
    }

    return items;
  }
}

function selectSkillSummaries(rankedSkills: RankedSkill[], selectedSkills: RankedSkill[], limit: number): RankedSkill[] {
  const selectedPaths = new Set<string>();
  const result: RankedSkill[] = [];

  for (const skill of selectedSkills) {
    const resolved = path.resolve(skill.path);
    if (!selectedPaths.has(resolved)) {
      selectedPaths.add(resolved);
      result.push(skill);
    }
  }

  for (const skill of rankedSkills) {
    if (result.length >= limit) {
      break;
    }
    if (skill.score <= 0) {
      continue;
    }
    const resolved = path.resolve(skill.path);
    if (selectedPaths.has(resolved)) {
      continue;
    }
    selectedPaths.add(resolved);
    result.push(skill);
  }

  return result;
}

function dynamicBudgetFor(profile: TaskProfile, selectedToolNames: string[], options: ContextBuildOptions, configBudgetTokens: number): number {
  const domains = new Set(profile.domains ?? []);
  const attachedTokens = Math.min(900, (options.attachedFiles?.length ?? 0) * 260);
  const toolAllowance = selectedToolNames.length ? 140 : 0;
  const editingAllowance = selectedToolNames.includes("apply_patch") ? 180 : 0;
  const policy = profile.contextPolicy ?? "focused";
  let budget = 260;

  if (profile.kind === "inspect") {
    budget = 560;
  } else if (profile.kind === "shell" || profile.kind === "git") {
    budget = 520;
  } else if (profile.kind === "debug") {
    budget = 860;
  } else if (profile.kind === "edit") {
    budget = 820;
  } else if (profile.kind === "refactor") {
    budget = 1120;
  }

  if (domains.has("agent") || domains.has("cache") || domains.has("tool")) {
    budget += 160;
  }
  if (domains.has("ui") || domains.has("desktop")) {
    budget += 120;
  }

  if (policy === "minimal") {
    budget = Math.min(budget, 220);
  } else if (policy === "focused") {
    budget = Math.min(budget + 60, 760);
  } else if (policy === "evidence_first") {
    budget += selectedToolNames.includes("read_file") || selectedToolNames.includes("search_text") ? 40 : 180;
  } else if (policy === "broad") {
    budget += 260;
  }

  return Math.min(configBudgetTokens, Math.max(220, budget + toolAllowance + editingAllowance + attachedTokens));
}

function skillBodyBudget(profile: TaskProfile): number {
  if (profile.kind === "refactor" || profile.complexity >= 5) {
    return 900;
  }
  if (profile.kind === "edit" || profile.kind === "debug") {
    return 680;
  }
  return 420;
}

function relevantFileLimit(profile: TaskProfile): number {
  if (profile.contextPolicy === "minimal") {
    return 0;
  }
  if (profile.contextPolicy === "broad") {
    return profile.kind === "refactor" ? 4 : 3;
  }
  if (profile.kind === "refactor") {
    return 3;
  }
  if (profile.kind === "edit" || profile.kind === "debug") {
    return 2;
  }
  if (profile.kind === "inspect") {
    return 3;
  }
  return 1;
}

function focusedSnippetBudget(profile: TaskProfile): number {
  if (profile.contextPolicy === "minimal") {
    return 100;
  }
  if (profile.contextPolicy === "broad") {
    return 230;
  }
  if (profile.contextPolicy === "evidence_first") {
    return 190;
  }
  if (profile.kind === "refactor") {
    return 190;
  }
  if (profile.kind === "debug") {
    return 180;
  }
  if (profile.kind === "edit") {
    return 170;
  }
  return 150;
}

function shouldUseMinimalChatSystem(profile: TaskProfile, selectedToolNames: string[], options: ContextBuildOptions): boolean {
  return profile.kind === "chat"
    && !profile.needsTools
    && selectedToolNames.length === 0
    && !(options.attachedFiles?.length)
    && !options.conversationSummary?.trim();
}

function buildSystemContent(minimalChatSystem = false): string {
  if (minimalChatSystem) {
    return [
      `Prompt prefix version: ${MINIMAL_CHAT_PREFIX_VERSION}`,
      MINIMAL_CHAT_SYSTEM_PROMPT
    ].join("\n\n");
  }

  return [
    `Prompt prefix version: ${PROMPT_PREFIX_VERSION}`,
    BASE_SYSTEM_PROMPT,
    CACHE_ANCHOR_PROMPT,
    STATIC_RUNTIME_PROTOCOL
  ].filter(Boolean).join("\n\n");
}

interface RenderedUserContent {
  content: string;
  cacheablePrefixContent: string;
  volatileTailContent: string;
}

function renderUserContent(task: string, dynamic: ContextItem[], profile?: TaskProfile): string {
  return renderUserContentParts(task, dynamic, profile).content;
}

function renderUserContentParts(task: string, dynamic: ContextItem[], profile?: TaskProfile): RenderedUserContent {
  const strategy = profile
    ? [
      "Execution strategy:",
      `mode=${profile.executionMode ?? "inspect_first"}`,
      `contextPolicy=${profile.contextPolicy ?? "focused"}`,
      `qualityGates=${(profile.qualityGates ?? []).join(",") || "grounded_answer,concise_final"}`,
      ""
    ]
    : [];
  const cacheableItems = dynamic.filter(isReusablePrefixItem);
  const volatileItems = dynamic.filter((item) => !isReusablePrefixItem(item));
  const cacheablePrefixContent = cacheableItems.length
    ? [
      "Reusable context:",
      cacheableItems.map(renderItem).join("\n\n")
    ].join("\n")
    : "";
  const volatileTailContent = [
    "Current task:",
    task,
    "",
    ...strategy,
    "Volatile context:",
    volatileItems.length ? volatileItems.map(renderItem).join("\n\n") : "No volatile context selected yet."
  ].join("\n");

  return {
    content: [cacheablePrefixContent, volatileTailContent].filter(Boolean).join("\n\n"),
    cacheablePrefixContent,
    volatileTailContent
  };
}

function isReusablePrefixItem(item: ContextItem): boolean {
  return item.stable && (item.type === "rule" || item.type === "project");
}

function optimizeSelectedForCacheTarget(
  items: ContextItem[],
  systemContent: string,
  task: string,
  profile: TaskProfile,
  selectedToolNames: string[]
): ContextItem[] {
  if (!shouldPressureForCacheTarget(profile, task)) {
    return items;
  }

  const stableTokens = estimateTokens(systemContent);
  const reusableTokens = estimateTokens(renderUserContentParts(task, items.filter(isReusablePrefixItem), profile).cacheablePrefixContent);
  const cacheablePrefixTokens = stableTokens + reusableTokens;
  const targetCeiling = Math.max(0, Math.floor(cacheablePrefixTokens * (1 - TARGET_CACHE_HIT_RATE) / TARGET_CACHE_HIT_RATE));
  const minimumDynamicTokens = estimateTokens(renderUserContentParts(task, [], profile).volatileTailContent);
  const targetReachableWithoutPadding = minimumDynamicTokens <= targetCeiling;
  const fallbackCeiling = minimumDynamicTokens + cacheFallbackOptionalBudget(profile, selectedToolNames);
  const ceiling = targetReachableWithoutPadding ? targetCeiling : fallbackCeiling;
  let selected = [...items];

  while (selected.length && estimateTokens(renderUserContentParts(task, selected, profile).volatileTailContent) > ceiling) {
    const dropIndex = lowestValueDroppableIndex(selected, selectedToolNames);
    if (dropIndex === -1) {
      break;
    }
    selected = selected.filter((_, index) => index !== dropIndex);
  }

  return selected;
}

function shouldPressureForCacheTarget(profile: TaskProfile, task: string): boolean {
  const domains = new Set(profile.domains ?? []);
  return domains.has("cache") || /99\.?1|99%|\u547d\u4e2d\u7387|\u7f13\u5b58|token/i.test(task);
}

function cacheFallbackOptionalBudget(profile: TaskProfile, selectedToolNames: string[]): number {
  const hasReadTools = selectedToolNames.includes("read_file") || selectedToolNames.includes("search_text");
  if (profile.kind === "chat") {
    return 80;
  }
  if (profile.kind === "inspect") {
    return hasReadTools ? 180 : 320;
  }
  if (profile.kind === "edit" || profile.kind === "debug") {
    return hasReadTools ? 260 : 460;
  }
  if (profile.kind === "refactor") {
    return hasReadTools ? 360 : 620;
  }
  return hasReadTools ? 160 : 280;
}

function lowestValueDroppableIndex(items: ContextItem[], selectedToolNames: string[]): number {
  const candidates = items
    .map((item, index) => ({ index, value: contextRetentionValue(item, selectedToolNames) }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => a.value - b.value);
  return candidates[0]?.index ?? -1;
}

function contextRetentionValue(item: ContextItem, selectedToolNames: string[]): number {
  if (item.type === "tool_brief") {
    return Number.POSITIVE_INFINITY;
  }

  const hasReadTools = selectedToolNames.includes("read_file") || selectedToolNames.includes("search_text");
  const typeValue: Record<ContextItem["type"], number> = {
    diagnostic: 5,
    diff: hasReadTools ? 8 : 28,
    file: item.id.startsWith("attached:") ? 65 : hasReadTools ? 12 : 42,
    skill_body: 18,
    skill_summary: 24,
    project: 36,
    history: 46,
    rule: 58,
    shell: 20,
    tool_brief: 9999
  };

  return typeValue[item.type] + Math.min(40, item.score);
}

function renderItem(item: ContextItem): string {
  return `<context id="${item.id}" type="${item.type}" stable="${item.stable}">\n${item.content}\n</context>`;
}

function buildBudgetReport(input: {
  budgetTokens: number;
  dynamicBudgetTokens: number;
  selected: ContextItem[];
  totalItems: number;
  systemContent: string;
  userContent: string;
  cacheableUserPrefixContent: string;
  volatileTailContent: string;
  minimumDynamicTokens: number;
  compressedTokensSaved: number;
  compressionLevel: "none" | "light" | "aggressive";
}): ContextBudgetReport {
  const stableTokens = estimateTokens(input.systemContent);
  const dynamicTokens = estimateTokens(input.userContent);
  const cacheableUserPrefixTokens = estimateTokens(input.cacheableUserPrefixContent);
  const cacheablePrefixTokens = stableTokens + cacheableUserPrefixTokens;
  const volatileTailTokens = estimateTokens(input.volatileTailContent);
  const usedTokens = stableTokens + dynamicTokens;
  const stableRatio = usedTokens ? stableTokens / usedTokens : 0;
  const projectedWarmCacheHitRate = usedTokens ? cacheablePrefixTokens / usedTokens : 0;
  const dynamicTokenCeilingForTarget = Math.max(0, Math.floor(cacheablePrefixTokens * (1 - TARGET_CACHE_HIT_RATE) / TARGET_CACHE_HIT_RATE));
  const dynamicTokensOverTarget = Math.max(0, volatileTailTokens - dynamicTokenCeilingForTarget);
  const optionalDynamicTokens = Math.max(0, volatileTailTokens - input.minimumDynamicTokens);
  const targetReachableWithoutPadding = input.minimumDynamicTokens <= dynamicTokenCeilingForTarget;
  const stablePaddingTokensForTarget = Math.max(0, Math.ceil((volatileTailTokens * TARGET_CACHE_HIT_RATE / (1 - TARGET_CACHE_HIT_RATE)) - cacheablePrefixTokens));
  const recommendations: string[] = [];

  if (!targetReachableWithoutPadding) {
    recommendations.push(`Target 99.1% is not reachable without padding for this turn because the current task alone needs about ${input.minimumDynamicTokens} volatile-tail tokens, above the ${dynamicTokenCeilingForTarget} token target ceiling. The runtime trims optional context instead of adding fake stable padding.`);
  }
  if (dynamicTokensOverTarget > 0) {
    recommendations.push(`Target 99.1% cache reuse requires volatile tail <= ${dynamicTokenCeilingForTarget} estimated tokens after warmup; current volatile tail is ${volatileTailTokens}. True token reduction mode keeps the tail small instead of padding the prefix.`);
  }
  if (volatileTailTokens > input.dynamicBudgetTokens) {
    recommendations.push("Volatile tail exceeded the lean budget. Drop lower-ranked snippets or rely on tools for evidence.");
  }
  if (stableTokens > input.budgetTokens * 0.35) {
    recommendations.push("Stable prefix is larger than expected. Keep only byte-stable runtime protocol in the system message.");
  }
  if (input.totalItems > input.selected.length) {
    recommendations.push(`${input.totalItems - input.selected.length} low-ranked context items were dropped by the token budget.`);
  }
  if (!recommendations.length) {
    recommendations.push("Stable prefix and dynamic tail are within the current budget.");
  }

  return {
    budgetTokens: input.budgetTokens,
    dynamicBudgetTokens: input.dynamicBudgetTokens,
    usedTokens,
    stableTokens,
    dynamicTokens,
    cacheablePrefixTokens,
    volatileTailTokens,
    compressedTokensSaved: input.compressedTokensSaved,
    compressionLevel: input.compressionLevel,
    stablePrefixHash: hashText(input.systemContent),
    cacheablePrefixHash: hashText([input.systemContent, input.cacheableUserPrefixContent].filter(Boolean).join("\n\n")),
    dynamicTailHash: hashText(input.volatileTailContent),
    itemCount: input.selected.length,
    droppedItemCount: Math.max(0, input.totalItems - input.selected.length),
    stableRatio,
    targetCacheHitRate: TARGET_CACHE_HIT_RATE,
    projectedWarmCacheHitRate,
    minimumDynamicTokens: input.minimumDynamicTokens,
    optionalDynamicTokens,
    dynamicTokenCeilingForTarget,
    dynamicTokensOverTarget,
    targetReachableWithoutPadding,
    stablePaddingTokensForTarget,
    cacheStrategy: projectedWarmCacheHitRate >= TARGET_CACHE_HIT_RATE ? "excellent" : projectedWarmCacheHitRate >= 0.72 && usedTokens <= input.budgetTokens * 0.12 && optionalDynamicTokens <= input.dynamicBudgetTokens * 0.35 ? "good" : "needs_work",
    recommendations
  };
}

function autoCompressItems(items: ContextItem[], budgetTokens: number): { items: ContextItem[]; level: "none" | "light" | "aggressive" } {
  const total = items.reduce((sum, item) => sum + (item.tokens || estimateTokens(item.content)), 0);
  const dynamic = items.filter((item) => !item.stable).reduce((sum, item) => sum + (item.tokens || estimateTokens(item.content)), 0);
  const level: "none" | "light" | "aggressive" = total > budgetTokens * 0.5 || dynamic > budgetTokens * 0.22
    ? "aggressive"
    : total > budgetTokens * 0.32 || dynamic > budgetTokens * 0.14
      ? "light"
      : "none";

  if (level === "none") {
    return { items, level };
  }

  const maxDynamicTokens = level === "aggressive" ? 220 : 320;
  const compressed = items.map((item) => {
    if (item.stable || item.tokens <= maxDynamicTokens) {
      return item;
    }
    const content = truncateByTokens(item.content, maxDynamicTokens);
    return {
      ...item,
      content,
      tokens: estimateTokens(content)
    };
  });

  return { items: compressed, level };
}

function prioritizeProjectFiles(files: string[], task: string): string[] {
  const optimizer = new AlgorithmOptimizer();
  return files
    .map((file) => ({ file, score: optimizer.scoreFilePath(task, file) + projectFileBaseline(file) }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .map((item) => item.file);
}

function stableProjectFiles(files: string[]): string[] {
  return files
    .map((file) => ({ file, score: projectFileBaseline(file) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .map((item) => item.file);
}

function projectFileBaseline(file: string): number {
  if (/^(package\.json|README\.md|tsconfig\.json|vite\.config|electron|src\/)/i.test(file)) {
    return 10;
  }
  if (/^(tests?\/|\.agent\/)/i.test(file)) {
    return 6;
  }
  if (/^(dist\/|node_modules\/|coverage\/)/i.test(file)) {
    return -20;
  }
  return 0;
}

function compactPackageJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      name?: string;
      version?: string;
      type?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const scripts = Object.keys(parsed.scripts ?? {}).slice(0, 7);
    const deps = [
      ...Object.keys(parsed.dependencies ?? {}).slice(0, 5),
      ...Object.keys(parsed.devDependencies ?? {}).slice(0, 5)
    ];
    return [
      "package.json compact:",
      `name=${parsed.name ?? "unknown"} version=${parsed.version ?? "-"} type=${parsed.type ?? "-"}`,
      scripts.length ? `scripts=${scripts.join(", ")}` : "",
      deps.length ? `deps=${deps.join(", ")}` : ""
    ].filter(Boolean).join("\n");
  } catch {
    return `package.json excerpt:\n${truncateByTokens(raw, 220)}`;
  }
}

function extractFocusedSnippet(content: string, task: string, maxTokens: number): string {
  const lines = content.split(/\r?\n/);
  const terms = focusedSnippetTerms(task);
  if (!terms.length || lines.length <= 24) {
    return truncateByTokens(addLineNumbers(lines.slice(0, 28), 1), maxTokens);
  }

  let bestIndex = 0;
  let bestScore = 0;
  const loweredTerms = terms.map((term) => term.toLowerCase());
  for (let index = 0; index < lines.length; index += 1) {
    const loweredLine = lines[index]!.toLowerCase();
    let score = 0;
    for (const term of loweredTerms) {
      if (term.length >= 2 && loweredLine.includes(term)) {
        score += term.length > 8 ? 4 : 2;
      }
    }
    if (/export\s+(class|function|interface|type)|function\s+\w+|class\s+\w+/i.test(lines[index]!)) {
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestScore === 0) {
    return truncateByTokens(addLineNumbers(lines.slice(0, 28), 1), maxTokens);
  }

  const start = Math.max(0, bestIndex - 8);
  const end = Math.min(lines.length, bestIndex + 20);
  const excerpt = addLineNumbers(lines.slice(start, end), start + 1);
  return truncateByTokens(`Focused excerpt lines ${start + 1}-${end}:\n${excerpt}`, maxTokens);
}

function addLineNumbers(lines: string[], startLine: number): string {
  return lines.map((line, index) => `${startLine + index}: ${line}`).join("\n");
}

function focusedSnippetTerms(task: string): string[] {
  const lower = task.toLowerCase();
  const terms = task
    .split(/[^a-z0-9_\u3400-\u9fff./-]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  if (/\u667a\u80fd|\u667a\u80fd\u5ea6|\u8def\u7531|\u8c03\u5ea6|agent|orchestrator|runtime|thinking|reasoning|model/i.test(lower)) {
    terms.push(
      "classifyTask",
      "ModelRouter",
      "route(profile",
      "buildDecisionTrace",
      "AgentOrchestrator",
      "reasoning",
      "thinking",
      "TaskProfile"
    );
  }
  if (/token|cache|\u7f13\u5b58|\u547d\u4e2d|\u6210\u672c|\u4e0a\u4e0b\u6587/i.test(lower)) {
    terms.push("cacheHit", "budgetReport", "stablePrefix", "dynamicTail", "autoCompress", "rankContextItems", "fitBudget");
  }
  if (/tool|\u5de5\u5177|\u8c03\u7528|\u6743\u9650|mcp/i.test(lower)) {
    terms.push("selectToolNames", "toolCallHash", "PermissionManager", "execute", "parseArguments");
  }
  if (/skill|\u6280\u80fd/i.test(lower)) {
    terms.push("rankSkills", "loadSkill", "skill_summary", "skill_body");
  }
  if (/ui|desktop|electron|\u684c\u9762|\u754c\u9762|\u5bf9\u8bdd|\u601d\u8003/i.test(lower)) {
    terms.push("renderReasoning", "renderProgress", "composer", "conversationHistory", "onStream");
  }

  return [...new Set(terms)];
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function isTextFile(filePath: string): boolean {
  return !/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|tar|7z|exe|dll|docx|xlsx|pptx|woff2?|ttf)$/i.test(filePath);
}

async function runGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 512_000
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
