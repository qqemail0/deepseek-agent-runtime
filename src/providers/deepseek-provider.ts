import OpenAI from "openai";
import type { AgentConfig } from "../config/load-config.js";
import type { AgentMessage, AgentStreamEvent, ModelProvider, ModelResponse, ProviderModel, ToolCall, ToolSchema } from "../core/types.js";

export class DeepSeekProvider implements ModelProvider {
  private readonly client: OpenAI;

  constructor(private readonly config: AgentConfig) {
    const apiKey = process.env[config.deepseek.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing DeepSeek API key. Set ${config.deepseek.apiKeyEnv}.`);
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.deepseek.baseURL
    });
  }

  async complete(request: Parameters<ModelProvider["complete"]>[0]): Promise<ModelResponse> {
    const body = this.createBody(request.messages, request.tools, request.route);
    if (request.onStream && request.route.responseFormat !== "json_object") {
      return this.completeStream(body, request.onStream, request.turn ?? 0, request.signal);
    }

    const response = await this.client.chat.completions.create(body as never, requestOptions(request.signal) as never);
    const parsed = parseResponse(response);

    if (request.route.responseFormat === "json_object" && !parsed.content.trim()) {
      const retryBody = {
        ...body,
        messages: [
          ...request.messages,
          {
            role: "user",
            content: "The previous JSON response was empty. Return valid json now, following the requested schema."
          }
        ]
      };
      return parseResponse(await this.client.chat.completions.create(retryBody as never, requestOptions(request.signal) as never));
    }

    return parsed;
  }

  private async completeStream(body: Record<string, unknown>, onStream: (event: AgentStreamEvent) => void | Promise<void>, turn: number, signal?: AbortSignal): Promise<ModelResponse> {
    const stream = await this.createStream(body, signal);
    let content = "";
    let reasoningContent = "";
    let finishReason: string | undefined;
    let usage: ModelResponse["usage"];
    const toolCalls = new Map<number, ToolCall>();

    for await (const chunk of stream) {
      const parsed = chunk as {
        choices?: Array<{
          finish_reason?: string | null;
          delta?: Partial<AgentMessage> & {
            reasoning_content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              type?: "function";
              function?: {
                name?: string;
                arguments?: string;
              };
            }>;
          };
        }>;
        usage?: ModelResponse["usage"];
      };
      if (parsed.usage) {
        usage = parsed.usage;
      }

      const choice = parsed.choices?.[0];
      if (typeof choice?.finish_reason === "string" && choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const delta = choice?.delta;
      if (!delta) {
        continue;
      }

      if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
        reasoningContent += delta.reasoning_content;
        await onStream({ type: "reasoning", delta: delta.reasoning_content, turn });
      }

      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        await onStream({ type: "content", delta: delta.content, turn });
      }

      for (const part of delta.tool_calls ?? []) {
        const index = Number(part.index ?? toolCalls.size);
        const current = toolCalls.get(index) ?? {
          id: part.id ?? `tool-${turn}-${index}`,
          type: "function" as const,
          function: {
            name: "",
            arguments: ""
          }
        };
        if (part.id) {
          current.id = part.id;
        }
        if (part.type) {
          current.type = part.type;
        }
        if (part.function?.name) {
          current.function.name += part.function.name;
        }
        if (part.function?.arguments) {
          current.function.arguments += part.function.arguments;
        }
        toolCalls.set(index, current);
      }
    }

    const calls = [...toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => call)
      .filter((call) => call.function.name);
    const message: AgentMessage = {
      role: "assistant",
      content,
      reasoning_content: reasoningContent || undefined,
      tool_calls: calls.length ? calls : undefined
    };
    return {
      message,
      content,
      toolCalls: calls,
      reasoningContent,
      finishReason,
      usage,
      raw: undefined
    };
  }

  private async createStream(body: Record<string, unknown>, signal?: AbortSignal): Promise<AsyncIterable<unknown>> {
    const streamBody = {
      ...body,
      stream: true,
      stream_options: { include_usage: true }
    };
    try {
      return await this.client.chat.completions.create(streamBody as never, requestOptions(signal) as never) as unknown as AsyncIterable<unknown>;
    } catch (error) {
      if (!/stream_options|include_usage|unknown parameter|unsupported/i.test(error instanceof Error ? error.message : String(error))) {
        throw error;
      }
      return await this.client.chat.completions.create({ ...body, stream: true } as never, requestOptions(signal) as never) as unknown as AsyncIterable<unknown>;
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    const response = await fetch(`${this.config.deepseek.baseURL.replace(/\/$/, "")}/models`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env[this.config.deepseek.apiKeyEnv] ?? ""}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list DeepSeek models: HTTP ${response.status}`);
    }

    const body = await response.json() as { data?: Array<{ id: string; owned_by?: string }> };
    return (body.data ?? [])
      .filter((model) => model.id)
      .map((model) => ({ id: model.id, ownedBy: model.owned_by ?? "deepseek" }));
  }

  private createBody(messages: AgentMessage[], tools: ToolSchema[] | undefined, route: Parameters<ModelProvider["complete"]>[0]["route"]): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: route.model,
      messages: messages.map(toDeepSeekMessage),
      max_tokens: route.maxTokens,
      extra_body: {
        thinking: { type: route.thinking }
      }
    };

    if (route.thinking === "enabled") {
      body.reasoning_effort = route.reasoningEffort ?? "high";
    }

    if (route.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    return body;
  }
}

function requestOptions(signal?: AbortSignal): { signal?: AbortSignal } | undefined {
  return signal ? { signal } : undefined;
}

function toDeepSeekMessage(message: AgentMessage): Record<string, unknown> {
  const out: Record<string, unknown> = {
    role: message.role,
    content: message.content ?? null
  };
  if (message.name) out.name = message.name;
  if (message.tool_call_id) out.tool_call_id = message.tool_call_id;
  if (message.tool_calls) out.tool_calls = message.tool_calls;
  if (message.reasoning_content) out.reasoning_content = message.reasoning_content;
  return out;
}

function parseResponse(response: unknown): ModelResponse {
  const value = response as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: AgentMessage & { reasoning_content?: string };
    }>;
    usage?: ModelResponse["usage"];
  };
  const choice = value.choices?.[0];
  const message = choice?.message ?? { role: "assistant", content: "" };
  const toolCalls = message.tool_calls ?? [];
  return {
    message,
    content: message.content ?? "",
    toolCalls,
    reasoningContent: message.reasoning_content,
    finishReason: choice?.finish_reason ?? undefined,
    usage: value.usage,
    raw: response
  };
}
