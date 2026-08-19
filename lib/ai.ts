import Anthropic from "@anthropic-ai/sdk";
import { type RiskResult } from "./scorer";

// Qwen exposes an Anthropic-compatible endpoint, so we use the official SDK
// with a custom baseURL — same setup as YieldScout and the treasury agent.

const client = new Anthropic({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/apps/anthropic",
});

export const AI_MODEL = process.env.QWEN_MODEL || "qwen3.7-max";

export function aiConfigured(): boolean {
  return Boolean(process.env.QWEN_API_KEY);
}

// Generate a one-paragraph plain-english explanation of the risk score.
// Falls back gracefully if AI not configured.
export async function explainRisk(result: RiskResult): Promise<string> {
  if (!aiConfigured()) return buildFallbackExplanation(result);

  const prompt =
    `Protocol: ${result.protocol} on ${result.chain}\n` +
    `Symbol: ${result.symbol}\n` +
    `APY: ${result.apy}%\n` +
    `TVL: $${result.tvl_usd.toLocaleString()}\n` +
    `Risk score: ${result.risk_score}/100 (${result.verdict})\n` +
    `Component breakdown — APY credibility: ${result.components.apy_credibility}/20, ` +
    `Liquidity: ${result.components.liquidity_depth}/20, ` +
    `Exploits: ${result.components.exploit_history}/20, ` +
    `Maturity: ${result.components.protocol_maturity}/20, ` +
    `Concentration: ${result.components.concentration}/10, ` +
    `Reward token: ${result.components.reward_token}/10\n` +
    `Flags: ${result.flags.length > 0 ? result.flags.join("; ") : "none"}\n\n` +
    `Write a 2-3 sentence plain-english explanation of this risk score for a DeFi investor. ` +
    `Be direct. Lead with the verdict. Mention the most important flag if any. No markdown.`;

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
      // qwen3 rejects non-streaming calls unless thinking is disabled.
      thinking: { type: "disabled" },
    } as Anthropic.MessageCreateParamsNonStreaming);

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    const text = (textBlock?.text ?? "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    return text || buildFallbackExplanation(result);
  } catch {
    return buildFallbackExplanation(result);
  }
}

function buildFallbackExplanation(r: RiskResult): string {
  const topFlag = r.flags[0] ?? null;
  const tvlStr =
    r.tvl_usd >= 1_000_000
      ? `$${(r.tvl_usd / 1_000_000).toFixed(1)}M`
      : `$${(r.tvl_usd / 1_000).toFixed(0)}K`;

  const verdictProse: Record<string, string> = {
    LOW_RISK: "This pool carries low risk",
    MEDIUM_RISK: "This pool carries moderate risk",
    HIGH_RISK: "This pool carries high risk",
    VERY_HIGH_RISK: "This pool carries very high risk",
  };

  let explanation =
    `${verdictProse[r.verdict] ?? "Risk is undetermined"} ` +
    `(score ${r.risk_score}/100). ` +
    `${r.protocol} on ${r.chain} is offering ${r.apy}% APY with ${tvlStr} TVL.`;

  if (topFlag) explanation += ` Key concern: ${topFlag}.`;

  return explanation;
}
