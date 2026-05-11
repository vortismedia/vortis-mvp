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
}): Promise<AgentResult> {
  const start = Date.now();
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 4096,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userMessage }],
    });

    const output = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    const durationMs = Date.now() - start;

    const db = getDb();
    await db.prepare(
      `INSERT INTO agent_logs (id, client_id, campaign_id, agent_name, input_data, output_data, tokens_used, duration_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success')`
    ).run(
      uuid(),
      params.clientId,
      params.campaignId ?? null,
      params.agentName,
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
      params.agentName,
      params.userMessage.substring(0, 2000),
      durationMs,
      error.message
    );
    throw error;
  }
}
