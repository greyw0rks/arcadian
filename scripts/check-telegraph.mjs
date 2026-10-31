import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { setDefaultResultOrder } from 'node:dns';

setDefaultResultOrder('ipv4first');

const yaml = await readFile(new URL('../public/telegraph-risk.yaml', import.meta.url), 'utf8');
const manifest = parse(yaml);
const output = process.argv.indexOf('--output');
const requestFile = process.argv.indexOf('--request-file');
const registrationId = process.env.REGISTER_ID ?? '401';
if (!/^\d+$/.test(registrationId)) throw new Error('REGISTER_ID must be a registration number');
if (requestFile !== -1) {
  await writeFile(process.argv[requestFile + 1], JSON.stringify({ yaml, miner_address: '0x634E8E643fb9a9919671824B48402D7AD93F321f' }));
  console.log('Wrote official validator request with the public manifest and owner address.');
  process.exit(0);
}
const report = { checkedAt: new Date().toISOString(), localHash: createHash('sha256').update(yaml).digest('hex'), registrationId };
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
  return response;
}
const results = await Promise.allSettled([
  get(manifest.base_url + '/telegraph-risk.yaml').then(r => r.text()),
  get('https://devnode.telegraphprotocol.com/api/miners/' + registrationId).then(r => r.json()),
  get('https://devnode.telegraphprotocol.com/api/miners?intent=TVL_LOOKUP').then(r => r.json()),
]);
report.hosted = results[0].status === 'fulfilled' ? { matchesLocal: results[0].value === yaml, sha256: createHash('sha256').update(results[0].value).digest('hex') } : { error: results[0].reason.message };
report.registration = results[1].status === 'fulfilled' ? results[1].value.miner ?? results[1].value : { error: results[1].reason.message };
report.activeMiner = results[2].status === 'fulfilled' && Array.isArray(results[2].value)
  ? results[2].value.find(m => m.slug === manifest.slug) ?? null
  : { error: results[2].status === 'rejected' ? results[2].reason.message : 'Node miner catalogue is not an array' };
const sameIntents = actual => Array.isArray(actual) && JSON.stringify([...actual].sort()) === JSON.stringify([...manifest.semantics.supported_intents].sort());
const passed = report.hosted.matchesLocal === true && report.registration.activation_status === 'active'
  && String(report.registration.yaml_hash ?? '').replace(/^0x/, '').toLowerCase() === report.localHash
  && report.registration.slug === manifest.slug && report.registration.yaml_url === manifest.base_url + '/telegraph-risk.yaml'
  && sameIntents(report.registration.supported_intents) && report.activeMiner?.activation_status === 'active'
  && report.activeMiner.yaml_url === report.registration.yaml_url && sameIntents(report.activeMiner.supported_intents);
report.readyToServe = passed;
if (output !== -1) await writeFile(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = passed ? 0 : 1;
