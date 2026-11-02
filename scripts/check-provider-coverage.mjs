// Public metadata only. No environment file, wallet, signing or purchase imports.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const intents = ['SMART_CONTRACT_AUDIT_GENERAL', 'WASH_TRADING_DETECTION_GENERAL',
  'ONCHAIN_METRIC_VERIFY_GENERAL', 'LIQUIDITY_DEPTH_VERIFY_GENERAL'];
const endpoints = {
  integrations: 'https://explorer.telegraphprotocol.com/api/integrations',
  leaderboard: 'https://explorer.telegraphprotocol.com/api/leaderboard/miners',
  evaluatorPool: 'https://devnode.telegraphprotocol.com/api/evalpool/status?intent_id=LIQUIDITY_DEPTH_VERIFY_GENERAL',
};
const sources = await Promise.all(Object.entries(endpoints).map(async ([name, url]) => {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const raw = await response.text();
  return [name, { url, sha256: createHash('sha256').update(raw).digest('hex'), data: JSON.parse(raw) }];
}));
const source = Object.fromEntries(sources);
if (!Array.isArray(source.integrations.data) || !source.leaderboard.data.intents) {
  throw new Error('Unsupported public catalogue or leaderboard response');
}
const report = {
  checkedAt: new Date().toISOString(), paymentSigned: false, paymentSent: false,
  scope: 'Public catalogue and ranking metadata; no provider result or useful paid workflow is verified.',
  sources: Object.fromEntries(sources.map(([name, { url, sha256 }]) => [name, { url, sha256 }])),
  leaderboardEpoch: source.leaderboard.data.epoch,
  checks: intents.map(intent => {
    const providers = source.integrations.data.filter(p => p.activation_status === 'active' && p.supported_intents?.includes(intent));
    return { intent, activeListedProviders: providers.length,
      rankedProviders: source.leaderboard.data.intents[intent] ?? [],
      providers: providers.map(p => ({ id: p.id, slug: p.slug, description: p.description,
        yamlUrl: p.yaml_url, inputSchema: p.input_schema, outputSchema: p.output_schema })) };
  }),
  evaluatorPool: source.evaluatorPool.data,
  acceptanceBeforeAnotherReview: [
    'Confirm Engine routing to providers that answer the exact requested token and chain.',
    'Resolve the recorded paid liquidity failure and audit routing failure with the upstream operator.',
    'Confirm a supported Intent/schema for contract state at an explicit block.',
    'Confirm executable USD depth for the exact token, chain and notional, including route/fee/slippage constraints; reserve value is insufficient.',
    'Do not treat a catalogue entry, advertised schema or empty leaderboard as proof that a provider succeeds or fails.',
  ],
};
if (values.out) {
  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ checkedAt: report.checkedAt, paymentSent: false,
  checks: report.checks.map(({ intent, activeListedProviders, rankedProviders }) =>
    ({ intent, activeListedProviders, rankedProviders: rankedProviders.length })),
  evaluatorPool: report.evaluatorPool, output: values.out ?? null }, null, 2));
