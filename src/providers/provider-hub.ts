import { OfficeConfig, AgentRole } from '../types/office.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  model: string;
}

const MODEL_PRICING: Record<string, { promptPer1k: number; completionPer1k: number }> = {
  'claude-3-5-sonnet': { promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-opus': { promptPer1k: 0.015, completionPer1k: 0.075 },
  'gpt-4o-mini': { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  'gpt-4o': { promptPer1k: 0.0025, completionPer1k: 0.01 },
  'deepseek-chat': { promptPer1k: 0.00014, completionPer1k: 0.00028 },
  'deepseek-coder': { promptPer1k: 0.00014, completionPer1k: 0.00028 }
};

const DEFAULT_PRICING = { promptPer1k: 0.003, completionPer1k: 0.015 };

const SORTED_PRICING_KEYS = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);

function getPricing(modelName?: string): { promptPer1k: number; completionPer1k: number } {
  if (!modelName) return DEFAULT_PRICING;
  const lower = modelName.toLowerCase();
  for (const key of SORTED_PRICING_KEYS) {
    if (lower.includes(key)) {
      return MODEL_PRICING[key];
    }
  }
  return DEFAULT_PRICING;
}

export class ModelProviderHub {
  private config: OfficeConfig;

  constructor(config: OfficeConfig) {
    this.config = config;
  }

  public async callChatCompletion(
    messages: ChatMessage[],
    role?: AgentRole,
    customModel?: string
  ): Promise<CompletionResult> {
    const targetModel =
      customModel ||
      (role ? this.config.roleModels[role] : undefined) ||
      this.config.roleModels.BACKEND ||
      'claude-3-5-sonnet';

    const baseUrl = this.config.proxyBaseUrl.replace(/\/+$/, '');
    const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey || 'local-proxy'}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) {
      let errorDetail = res.statusText || 'Unknown error';
      const raw = await res.text().catch(() => '');
      if (raw) {
        try {
          const errorBody = JSON.parse(raw);
          if (errorBody?.error?.message) {
            errorDetail = errorBody.error.message;
          } else if (errorBody?.message) {
            errorDetail = errorBody.message;
          } else if (typeof errorBody === 'string') {
            errorDetail = errorBody;
          } else {
            errorDetail = raw;
          }
        } catch {
          errorDetail = raw;
        }
      }
      throw new Error(`Proxy error (${res.status}): ${errorDetail}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? promptTokens + completionTokens;
    const resultModel = data.model || targetModel;
    const costUsd = this.calculateCost(promptTokens, completionTokens, resultModel);

    return {
      content,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      model: resultModel
    };
  }

  public calculateCost(promptTokens: number, completionTokens: number, model?: string): number {
    if (promptTokens <= 0 && completionTokens <= 0) return 0;
    const pricing = getPricing(model);
    const cost =
      (Math.max(0, promptTokens) / 1000) * pricing.promptPer1k +
      (Math.max(0, completionTokens) / 1000) * pricing.completionPer1k;
    return Number(cost.toFixed(6));
  }
}
