import { createClient, type Client } from "@libsql/client";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

async function snapshot(client: Client) {
  const tx = await client.transaction("read");
  try {
    const definitions = (await tx.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name LIKE 'arcadian_%' ORDER BY name")).rows;
    const tables = [];
    for (const definition of definitions) {
      const name = String(definition.name);
      if (!/^arcadian_[a-z_]+$/.test(name)) throw new Error("Unsupported review table name");
      const result = await tx.execute('SELECT * FROM "' + name + '"');
      const rows = result.rows.map(row => result.columns.map(column => {
        const value = row[column];
        return value === null ? null : value instanceof Uint8Array ? Buffer.from(value).toString("hex") : String(value);
      })).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      tables.push({ name, sql: String(definition.sql), columns: result.columns, rows });
    }
    const indexes = (await tx.execute("SELECT sql FROM sqlite_master WHERE type='index' AND name LIKE 'arcadian_%' AND sql IS NOT NULL ORDER BY name")).rows.map(row => String(row.sql));
    const sha256 = createHash("sha256").update(JSON.stringify(tables.map(({name,columns,rows}) => ({name,columns,rows})))).digest("hex");
    await tx.rollback();
    return { tables, indexes, sha256 };
  } finally { tx.close(); }
}

async function main() {
  const { values } = parseArgs({ options: { "target-env": { type: "string" }, out: { type: "string" }, apply: { type: "boolean" } } });
  if (!process.env.REVIEW_DB_URL?.startsWith("file:") || !values["target-env"]) throw new Error("Use the authoritative local REVIEW_DB_URL and --target-env with a private remote configuration");
  const remoteConfig = JSON.parse(await readFile(values["target-env"], "utf8"));
  if (!/^(libsql|https):\/\//.test(remoteConfig.REVIEW_DB_URL) || !remoteConfig.REVIEW_DB_AUTH_TOKEN) throw new Error("The target needs a remote libSQL URL and token");
  const source = createClient({ url: process.env.REVIEW_DB_URL });
  const target = createClient({ url: remoteConfig.REVIEW_DB_URL, authToken: remoteConfig.REVIEW_DB_AUTH_TOKEN });
  try {
    const before = await snapshot(source);
    if (!before.tables.some(t => t.name === "arcadian_reviews")) throw new Error("Source is not the recovered review journal");
    const destination = await snapshot(target);
    const empty = destination.tables.every(t => t.rows.length === 0);
    if (!empty && destination.sha256 !== before.sha256) throw new Error("Remote journal already contains different reviews; migration refused");
    if (values.apply && destination.sha256 !== before.sha256) {
      const statements: { sql: string; args?: (string|null)[] }[] = [];
      if (!destination.tables.length) statements.push(...before.tables.map(t => ({ sql: t.sql })), ...before.indexes.map(sql => ({ sql })));
      else if (JSON.stringify(destination.tables.map(t => ({name:t.name,columns:t.columns}))) !== JSON.stringify(before.tables.map(t => ({name:t.name,columns:t.columns})))) throw new Error("Remote journal schema differs; migration refused");
      for (const table of before.tables) for (const row of table.rows) statements.push({
        sql: 'INSERT INTO "' + table.name + '" (' + table.columns.map(c => '"' + c + '"').join(',') + ') VALUES (' + row.map(() => '?').join(',') + ')', args: row
      });
      await target.batch(statements, "write");
    }
    const after = await snapshot(target);
    const unchangedSource = await snapshot(source);
    const matches = before.sha256 === after.sha256 && before.sha256 === unchangedSource.sha256;
    const report = { checkedAt: new Date().toISOString(), applied: Boolean(values.apply), sourceSha256: before.sha256, targetSha256: after.sha256,
      sourceUnchanged: before.sha256 === unchangedSource.sha256, matches,
      tables: before.tables.map(t => ({ name: t.name, rows: t.rows.length })),
      sourceModified: false, scope: "Exact logical journal copy. No payment, authorization or recovery was submitted." };
    if (values.out) { await mkdir(dirname(values.out), {recursive:true}); await writeFile(values.out,JSON.stringify(report,null,2)+"\n"); }
    console.log(JSON.stringify(report,null,2));
    if (values.apply && !matches) throw new Error("Journal fingerprint mismatch; do not switch payer processes to remote storage");
  } finally { source.close(); target.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
