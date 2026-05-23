import type { SkillSummary } from "./skill-loader.js";

export interface RankedSkill extends SkillSummary {
  score: number;
  reasons: string[];
}

interface BoostRule {
  task: RegExp;
  skill: RegExp;
  weight: number;
  reason: string;
}

const BOOST_RULES: BoostRule[] = [
  {
    task: /(?:ui|ux|frontend|front-end|design|electron|desktop|\u754c\u9762|\u524d\u7aef|\u684c\u9762|\u8bbe\u8ba1)/i,
    skill: /(?:\b(?:frontend|front-end|ui|ux|design|electron|desktop)\b|\u754c\u9762|\u524d\u7aef|\u684c\u9762|\u8bbe\u8ba1)/i,
    weight: 45,
    reason: "ui-design"
  },
  {
    task: /(?:deepseek|token|cache|thinking|model|\u7f13\u5b58|\u6210\u672c|\u547d\u4e2d|\u6a21\u578b|\u601d\u8003)/i,
    skill: /(?:deepseek|token|cache|optimizer|cost|precision|prompt)/i,
    weight: 48,
    reason: "deepseek-optimization"
  },
  {
    task: /(?:security|audit|owasp|permission|secret|\u5b89\u5168|\u5ba1\u8ba1|\u6743\u9650|\u5bc6\u94a5)/i,
    skill: /(?:security|audit|clawdefender|permission|secret)/i,
    weight: 42,
    reason: "security"
  },
  {
    task: /(?:web|search|browser|url|http|https|open link|\u8054\u7f51|\u641c\u7d22|\u6d4f\u89c8\u5668|\u7f51\u9875)/i,
    skill: /(?:websearch|web-search|browser|open-link|open link|deepresearch|web pages|open urls)/i,
    weight: 40,
    reason: "web"
  },
  {
    task: /(?:academic|paper|scholar|citation|aminer|\u5b66\u672f|\u8bba\u6587|\u5b66\u8005|\u5f15\u7528)/i,
    skill: /(?:aminer|academic|scholar|paper|citation)/i,
    weight: 38,
    reason: "academic"
  },
  {
    task: /(?:image|picture|photo|generate image|\u56fe\u7247|\u56fe\u50cf|\u751f\u6210\u56fe)/i,
    skill: /(?:image|picture|photo|generate-image|search-image)/i,
    weight: 38,
    reason: "image"
  },
  {
    task: /(?:git|commit|diff|branch|merge|rebase|status)/i,
    skill: /(?:git)/i,
    weight: 35,
    reason: "git"
  },
  {
    task: /(?:pdf|docx|word|document|\u6587\u6863)/i,
    skill: /(?:pdf|document|docx|word)/i,
    weight: 34,
    reason: "document"
  },
  {
    task: /(?:spreadsheet|excel|xlsx|csv|\u8868\u683c)/i,
    skill: /(?:spreadsheet|excel|xlsx|csv)/i,
    weight: 34,
    reason: "spreadsheet"
  },
  {
    task: /(?:ppt|presentation|slide|deck|\u5e7b\u706f\u7247|\u6f14\u793a)/i,
    skill: /(?:presentation|slide|deck|ppt)/i,
    weight: 34,
    reason: "presentation"
  },
  {
    task: /(?:test|debug|refactor|implement|code|build|fix|\u4fee\u590d|\u91cd\u6784|\u5b9e\u73b0|\u6d4b\u8bd5|\u4ee3\u7801)/i,
    skill: /(?:^code$|coding|programming|test|debug|refactor|scaffold)/i,
    weight: 28,
    reason: "coding"
  }
];

export function selectSkills(task: string, skills: SkillSummary[], limit = 4): SkillSummary[] {
  return rankSkills(task, skills)
    .filter((skill) => skill.score > 0)
    .slice(0, limit)
    .map(stripRank);
}

export function selectSkillNames(task: string, skills: SkillSummary[]): string[] {
  return selectSkills(task, skills, 2).map((skill) => skill.name);
}

export function rankSkills(task: string, skills: SkillSummary[]): RankedSkill[] {
  const loweredTask = task.toLowerCase();
  const taskTokens = extractKeywords(loweredTask);
  const ranked = skills.map((skill) => rankSkill(skill, loweredTask, taskTokens));

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.scope !== b.scope) {
      return a.scope === "project" ? -1 : 1;
    }
    if (a.tokens !== b.tokens) {
      return a.tokens - b.tokens;
    }
    return a.name.localeCompare(b.name);
  });

  return dedupeRankedSkills(ranked);
}

function rankSkill(skill: SkillSummary, loweredTask: string, taskTokens: string[]): RankedSkill {
  const loweredName = skill.name.toLowerCase();
  const normalizedName = loweredName.replace(/[-_]+/g, " ");
  const haystack = `${skill.name} ${skill.description}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  const explicitName = loweredTask.includes(loweredName) || loweredTask.includes(normalizedName);

  if (explicitName) {
    score += 100;
    reasons.push("explicit-name");
  }

  const skillNameTokens = extractKeywords(loweredName);
  for (const token of taskTokens) {
    if (token.length < 3) {
      continue;
    }
    if (haystack.includes(token)) {
      score += token.length >= 6 ? 12 : 6;
      reasons.push(`keyword:${token}`);
    }
  }

  for (const token of skillNameTokens) {
    if (token.length >= 3 && loweredTask.includes(token)) {
      score += 10;
      reasons.push(`name-token:${token}`);
    }
  }

  for (const rule of BOOST_RULES) {
    if (rule.task.test(loweredTask) && rule.skill.test(loweredName)) {
      score += rule.weight;
      reasons.push(rule.reason);
    }
  }

  if (/^(agency-agents|programming-team-roles)$/.test(loweredName) && !explicitName) {
    score -= 38;
    reasons.push("broad-skill-penalty");
  }

  return {
    ...skill,
    score,
    reasons: [...new Set(reasons)]
  };
}

function dedupeRankedSkills(skills: RankedSkill[]): RankedSkill[] {
  const selected = new Map<string, RankedSkill>();
  for (const skill of skills) {
    const key = skill.name.trim().toLowerCase();
    if (!selected.has(key)) {
      selected.set(key, skill);
    }
  }
  return [...selected.values()];
}

function stripRank(skill: RankedSkill): SkillSummary {
  return {
    name: skill.name,
    description: skill.description,
    path: skill.path,
    scope: skill.scope,
    tokens: skill.tokens
  };
}

function extractKeywords(text: string): string[] {
  return [...new Set(text
    .split(/[^a-z0-9_\u3400-\u9fff]+/i)
    .map((part) => part.trim())
    .filter(Boolean))];
}
