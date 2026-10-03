const { Pool } = require('pg');

async function check() {
  const client = new Pool({
    host: '127.0.0.1',
    port: 54329,
    database: 'agency_dev',
    user: 'agency',
    password: 'agency',
    connectionTimeoutMillis: 5000,
  });
  try {
    const r = await client.query('SELECT NOW()');
    console.log('DB OK:', r.rows[0].now);
    const r2 = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    console.log('Tables (' + r2.rows.length + '):', r2.rows.map(r=>r.tablename).join(', '));
    await client.end();
    process.exit(0);
  } catch (e) {
    console.error('DB FAIL:', e.message);
    process.exit(1);
  }
}
check();
