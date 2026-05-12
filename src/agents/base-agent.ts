import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/database';
import { v4 as uuid } from 'uuid';

let anthropic: Anthropic;

function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

/**
 * Model selection by complexity:
 * - haiku: simple checks, validators, formatters (fast + cheap)
 * - sonnet: creative + strategic content (balanced) — DEFAULT for content generation
 * - opus: complex strategy, autonomous decisions, cross-data analysis
 *
 * Override per-environment with ANTHROPIC_MODEL_<TIER> if needed.
 */
function modelFor(tier: ModelTier): string {
  if (tier === 'haiku') return process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5';
  if (tier === 'sonnet') return process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-5';
  return process.env.ANTHROPIC_MODEL_OPUS || 'claude-opus-4-5';
}

export interface AgentResult {
  output: string;
  parsedOutput?: any;
  tokensUsed: number;
  durationMs: number;
}

export async function runAgent(params: {
  agentName: string;
  systemPrompt: string;
  userMessage: string;
  clientId: string;
  campaignId?: string;
  /** Model tier. Default 'sonnet' (balanced). Use 'haiku' for simple checks, 'opus' for strategy. */
  tier?: ModelTier;
  /** Override max_tokens. Default 4096. Use lower (1024) for short JSON outputs to save tokens. */
  maxTokens?: number;
}): Promise<AgentResult> {
  const start = Date.now();
  const client = getClient();
  const tier = params.tier || 'sonnet';
  const model = modelFor(tier);

  try {
    // Use prompt caching on the system prompt (saves ~90% input tokens on repeated calls within 5 min)
    const response = await client.messages.create({
      model,
      max_tokens: params.maxTokens || 4096,
      system: [{ type: 'text', text: params.systemPrompt, cache_control: { type: 'ephemeral' } }] as any,
      messages: [{ role: 'user', content: params.userMessage }],
    });

    const output = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('\n');

    const usage = response.usage || ({} as any);
    const tokensUsed =
      (usage.input_tokens ?? 0) +
      (usage.output_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    const durationMs = Date.now() - start;

    const db = getDb();
    await db.prepare(
      `INSERT INTO agent_logs (id, client_id, campaign_id, agent_name, input_data, output_data, tokens_used, duration_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success')`
    ).run(
      uuid(),
      params.clientId,
      params.campaignId ?? null,
      `${params.agentName}[${tier}]`,
      params.userMessage.substring(0, 2000),
      output.substring(0, 5000),
      tokensUsed,
      durationMs
    );

    let parsedOutput: any = undefined;
    try {
      const jsonMatch = output.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsedOutput = JSON.parse(jsonMatch[1]);
      } else if (output.trim().startsWith('{') || output.trim().startsWith('[')) {
        parsedOutput = JSON.parse(output);
      }
    } catch {}

    return { output, parsedOutput, tokensUsed, durationMs };
  } catch (error: any) {
    const durationMs = Date.now() - start;
    const db = getDb();
    await db.prepare(
      `INSERT INTO agent_logs (id, client_id, campaign_id, agent_name, input_data, tokens_used, duration_ms, status, error_message)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'error', ?)`
    ).run(
      uuid(),
      params.clientId,
      params.campaignId ?? null,
      `${params.agentName}[${tier}]`,
      params.userMessage.substring(0, 2000),
      durationMs,
      error.message
    );
    throw error;
  }
}
