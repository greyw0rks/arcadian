import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const example = await readFile(new URL('../.env.local.example', import.meta.url), 'utf8');
const key = generatePrivateKey();
const env = example.replace(/^AGENT_PRIVATE_KEY=$/m, 'AGENT_PRIVATE_KEY=' + key)
  .replace(/^DESK_ACCESS_TOKEN=$/m, 'DESK_ACCESS_TOKEN=' + randomBytes(32).toString('hex'));
try {
  await writeFile(new URL('../.env.local', import.meta.url), env, { flag: 'wx', mode: 0o600 });
  console.log('Created .env.local with a dedicated Telegraph Sepolia payer, an operator token and local SQLite storage.');
  console.log('Payer address: ' + privateKeyToAccount(key).address);
  console.log('Run the operator check before funding. The current node uses its own Ethereum Sepolia test token; Circle faucet USDC is a different asset.');
  console.log('Run npm run check:operator. Operator access is the DESK_ACCESS_TOKEN in .env.local.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.local already exists; existing wallet and operator settings were preserved.');
}
