export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  role: AgentRole;
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type RiskLevel = "safe" | "low" | "medium" | "high" | "forbidden";
export type PermissionMode = "ask" | "allow" | "deny" | "full_access";
export type ThinkingMode = "enabled" | "disabled";
export type ReasoningEffort = "high" | "max";
export type ResponseFormat = "text" | "json_object";
export type AgentTurnLimit = number | "auto";
export type AgentExecutionMode = "answer_direct" | "inspect_first" | "edit_verify" | "deep_research" | "operate_direct";
export type ContextPolicy = "minimal" | "focused" | "evidence_first" | "broad";
export type QualityGate = "grounded_answer" | "tool_evidence" | "verify_changes" | "risk_check" | "concise_final" | "no_unverified_claims";

export interface TaskProfile {
  kind: "chat" | "inspect" | "edit" | "debug" | "refactor" | "git" | "shell";
  complexity: 1 | 2 | 3 | 4 | 5;
  risk: RiskLevel;
  needsTools: boolean;
  wantsJson: boolean;
  domains?: Array<"agent" | "cache" | "code" | "desktop" | "git" | "shell" | "skill" | "tool" | "ui" | "web">;
  confidence?: number;
  signals?: string[];
  executionMode?: AgentExecutionMode;
  contextPolicy?: ContextPolicy;
  qualityGates?: QualityGate[];
}

export interface ModelRoute {
  model: string;
  thinking: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
  maxTokens: number;
  responseFormat: ResponseFormat;
  source?: "auto" | "manual";
}

export interface ContextItem {
  id: string;
  type: "rule" | "project" | "skill_summary" | "skill_body" | "file" | "diff" | "shell" | "history" | "tool_brief" | "diagnostic";
  stable: boolean;
  score: number;
  tokens: number;
  content: string;
}

export interface AttachedContextFile {
  path: string;
  name: string;
  size: number;
  content: string;
}

export interface ContextBudgetReport {
  budgetTokens: number;
  dynamicBudgetTokens: number;
  usedTokens: number;
  stableTokens: number;
  dynamicTokens: number;
  cacheablePrefixTokens: number;
  volatileTailTokens: number;
  compressedTokensSaved: number;
  compressionLevel: "none" | "light" | "aggressive";
  stablePrefixHash: string;
  cacheablePrefixHash: string;
  dynamicTailHash: string;
  itemCount: number;
  droppedItemCount: number;
  stableRatio: number;
  targetCacheHitRate: number;
  projectedWarmCacheHitRate: number;
  minimumDynamicTokens: number;
  optionalDynamicTokens: number;
  dynamicTokenCeilingForTarget: number;
  dynamicTokensOverTarget: number;
  targetReachableWithoutPadding: boolean;
  stablePaddingTokensForTarget: number;
  cacheStrategy: "excellent" | "good" | "needs_work";
  recommendations: string[];
}

export interface BuiltContext {
  messages: AgentMessage[];
  items: ContextItem[];
  selectedToolNames: string[];
  estimatedTokens: number;
  budgetReport: ContextBudgetReport;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    strict?: boolean;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: false;
    };
  };
}

export interface ToolExecutionRequest {
  name: string;
  args: Record<string, unknown>;
  cwd: string;
}

export interface ToolExecutionResult {
  ok: boolean;
  content: string;
  summary: string;
  risk: RiskLevel;
  metadata?: Record<string, unknown>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  risk: (args: Record<string, unknown>) => RiskLevel;
  schema: ToolSchema;
  execute: (request: ToolExecutionRequest) => Promise<ToolExecutionResult>;
}

export interface PermissionDecision {
  allowed: boolean;
  risk: RiskLevel;
  reason: string;
}

export interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cacheHitRate: number;
  estimatedCostUsd: number;
}

export interface CacheHealthReport {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cacheHitRate: number;
  estimatedCostUsd: number;
  grade: "A" | "B" | "C" | "D";
  recommendations: string[];
}

export interface CacheRateSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cacheHitRate: number;
  estimatedCostUsd: number;
}

export interface ProviderModel {
  id: string;
  ownedBy: string;
}

export interface AgentProgressEvent {
  stage: "route" | "context" | "model" | "tool" | "permission" | "final" | "error";
  message: string;
  percent: number;
  detail?: Record<string, unknown>;
}

export interface AgentStreamEvent {
  type: "content" | "reasoning";
  delta: string;
  turn: number;
}

export interface ModelResponse {
  message: AgentMessage;
  content: string;
  toolCalls: ToolCall[];
  reasoningContent?: string;
  finishReason?: string;
  usage?: Partial<{
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens: number;
    prompt_cache_miss_tokens: number;
  }>;
  raw?: unknown;
}

export interface ModelProvider {
  complete(request: {
    route: ModelRoute;
    messages: AgentMessage[];
    tools?: ToolSchema[];
    onStream?: (event: AgentStreamEvent) => void | Promise<void>;
    turn?: number;
    signal?: AbortSignal;
  }): Promise<ModelResponse>;
}

export interface AgentRunOptions {
  cwd: string;
  task: string;
  conversationSummary?: string;
  disabledSkillPaths?: string[];
  attachedFiles?: AttachedContextFile[];
  networkEnabled?: boolean;
  autoCompressContext?: boolean;
  dryRun?: boolean;
  permissionMode?: PermissionMode;
  maxTurns?: AgentTurnLimit;
  modelOverride?: string;
  thinkingOverride?: ThinkingMode;
  onProgress?: (event: AgentProgressEvent) => void | Promise<void>;
  onStream?: (event: AgentStreamEvent) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  content: string;
  route: ModelRoute;
  profile: TaskProfile;
  usage: UsageRecord[];
  context: BuiltContext;
  toolResults: ToolExecutionResult[];
  reasoning: string[];
  completedFiles: string[];
  requestCache: CacheRateSnapshot;
  conversationCache: CacheRateSnapshot;
}
