// Quick read-only SQL against the dev database: node scripts/q.cjs <name>  (named queries only, no user input)
const { Client } = require("pg");
const QUERIES = {
  payments: `select p.status, p.provider, p."amountCents", p."createdAt" from "PaymentIntent" p join "Organization" o on o.id=p."organizationId" where o.name='Savanna Creative' order by p."createdAt" desc limit 5`,
  wallet: `select w.* from "CreditWallet" w join "Organization" o on o.id=w."organizationId" where o.name='Savanna Creative'`,
  jobs: `select status, type, count(*) from "Job" group by 1,2 order by 3 desc limit 10`,
};
(async () => {
  const c = new Client({ connectionString: "postgresql://agency:agency@127.0.0.1:54329/agency_dev" });
  await c.connect();
  const r = await c.query(QUERIES[process.argv[2]]);
  console.table(r.rows);
  await c.end();
})().catch((e) => console.log("ERR", e.message));
