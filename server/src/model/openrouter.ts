import type { ModelPrice } from './pricing.js';
import {
  ModelError,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelUsage,
  UNKNOWN_USAGE,
} from './provider.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterOptions {
  apiKey: string | undefined;
  pricing: Record<string, ModelPrice>;
  /** OpenRouter `reasoning.effort`; omitted when undefined. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

interface OpenRouterBody {
  provider?: string;
  error?: { code?: number | string; message?: string };
  choices?: { finish_reason?: string | null; native_finish_reason?: string | null; message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
    cost?: number;
  };
}

function readUsage(body: OpenRouterBody, model: string, pricing: Record<string, ModelPrice>): ModelUsage {
  const u = body.usage;
  if (!u) return UNKNOWN_USAGE;
  const inputTokens = u.prompt_tokens ?? null;
  const outputTokens = u.completion_tokens ?? null;
  const reasoningTokens = u.completion_tokens_details?.reasoning_tokens ?? null;
  if (typeof u.cost === 'number') return { inputTokens, outputTokens, reasoningTokens, costUsd: u.cost, costSource: 'reported' };
  const price = pricing[model];
  if (price && inputTokens !== null && outputTokens !== null) {
    const costUsd = (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000;
    return { inputTokens, outputTokens, reasoningTokens, costUsd: Math.round(costUsd * 1e8) / 1e8, costSource: 'estimated' };
  }
  return { inputTokens, outputTokens, reasoningTokens, costUsd: null, costSource: 'unknown' };
}

function scrub(message: string, apiKey: string | undefined): string {
  const clipped = message.slice(0, 300);
  return apiKey ? clipped.replaceAll(apiKey, '***') : clipped;
}

function errorForStatus(status: number, message: string, retryAfter: string | null): ModelError {
  if (status === 429) {
    const seconds = Number(retryAfter);
    return new ModelError('MODEL_RATE_LIMITED', '模型服务限流（429）', {
      ...(Number.isFinite(seconds) && seconds > 0 && { retryAfterMs: seconds * 1000 }),
    });
  }
  if (status === 401 || status === 402) return new ModelError('MODEL_AUTH', `模型密钥无效或余额不足（${status}）`);
  if (status === 403) {
    return /moderat|flag|safety|refus/i.test(message)
      ? new ModelError('MODEL_REFUSED', `内容被服务商拒绝：${message}`)
      : new ModelError('MODEL_AUTH', `模型服务拒绝访问（403）：${message}`);
  }
  if (status === 408 || status >= 500) return new ModelError('MODEL_UNAVAILABLE', `模型服务暂不可用（${status}）：${message}`);
  return new ModelError('INTERNAL', `模型请求被拒绝（${status}）：${message}`);
}

export function createOpenRouterProvider(opts: OpenRouterOptions): ModelProvider {
  const { apiKey, pricing } = opts;
  return {
    name: 'openrouter',
    configured: Boolean(apiKey),
    async complete(req: ModelRequest): Promise<ModelResponse> {
      if (!apiKey) throw new ModelError('MODEL_NOT_CONFIGURED', '未配置 OPENROUTER_API_KEY');
      const payload = {
        model: req.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        max_tokens: req.maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
        },
        provider: { require_parameters: true },
        usage: { include: true },
        ...(opts.reasoningEffort && { reasoning: { effort: opts.reasoningEffort } }),
      };

      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'x-title': 'bitbeing-character-life',
          },
          body: JSON.stringify(payload),
          signal: req.signal,
        });
      } catch (err) {
        if (req.signal.aborted || (err as Error).name === 'AbortError') {
          throw new ModelError('MODEL_TIMEOUT', '模型响应超时');
        }
        throw new ModelError('MODEL_UNAVAILABLE', `无法连接模型服务：${scrub((err as Error).message, apiKey)}`);
      }

      let raw: string;
      try {
        raw = await res.text();
      } catch {
        throw req.signal.aborted
          ? new ModelError('MODEL_TIMEOUT', '模型响应超时')
          : new ModelError('MODEL_UNAVAILABLE', '读取模型响应失败');
      }
      let body: OpenRouterBody = {};
      try {
        body = raw ? (JSON.parse(raw) as OpenRouterBody) : {};
      } catch {
        if (res.ok) throw new ModelError('MODEL_UNAVAILABLE', '模型服务返回了无法解析的响应');
      }
      const errMessage = scrub(body.error?.message ?? '', apiKey);
      if (!res.ok) throw errorForStatus(res.status, errMessage, res.headers.get('retry-after'));
      if (body.error) {
        const code = Number(body.error.code);
        throw errorForStatus(Number.isFinite(code) && code >= 400 ? code : 502, errMessage, null);
      }

      const usage = readUsage(body, req.model, pricing);
      const choice = body.choices?.[0];
      const text = choice?.message?.content ?? '';
      const finishReason = choice?.finish_reason ?? null;
      const provider = body.provider ?? null;
      const ctx = { usage, provider, responseText: text };
      if (finishReason === 'length') throw new ModelError('MODEL_TRUNCATED', '输出达到长度上限被截断', ctx);
      if (finishReason === 'content_filter' || choice?.native_finish_reason === 'refusal') {
        throw new ModelError('MODEL_REFUSED', '模型拒绝生成这段内容', ctx);
      }
      if (!text.trim()) throw new ModelError('MODEL_INVALID_OUTPUT', '模型返回了空内容', ctx);
      return { text, finishReason, provider, usage };
    },
  };
}
