// Run from platform dir: node analyze-coverage-v2.js
const fs = require('fs');
const path = require('path');

const routes = JSON.parse(fs.readFileSync('api-routes.json', 'utf8'));
const testDir = 'scripts/integration';
const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts'));

// Group routes by feature (first segment)
const categories = {};
for (const r of routes) {
  const seg = r.split('/')[1];
  categories[seg] = categories[seg] || [];
  categories[seg].push(r);
}

// For each test file, find imported server modules + referenced API paths
const testInfo = {};
for (const file of testFiles) {
  const content = fs.readFileSync(path.join(testDir, file), 'utf8');
  const imports = [...content.matchAll(/from\s+['"]@\/server\/([a-z0-9\-]+)['"]/gi)].map(m => m[1]);
  const apiPaths = [...content.matchAll(/['"](\/api\/[^\s'"]+)['"]/g)].map(m => m[1]);
  testInfo[file] = { imports, apiPaths, lines: content.split('\n').length };
}

// Map server modules to route categories
const moduleToCategory = {
  accounts: ['account'],
  ai: ['ai'],
  'ai-credits': ['platform'],
  assistant: ['assistant'],
  auth: ['auth'],
  autopilot: ['autopilots', 'autopilot-runs'],
  brands: ['brands'],
  campaigns: ['campaigns'],
  channels: ['channels'],
  characters: ['characters'],
  content: ['content'],
  credits: ['billing'],
  generation: ['studio'],
  invites: ['team', 'teams'],
  leads: ['leads'],
  messaging: ['inbox'],
  'meta-oauth': ['channels'],
  mfa: ['account'],
  notify: ['notifications'],
  'oauth-google': ['auth'],
  orders: ['orders', 'order-desk'],
  organizations: ['orgs', 'platform'],
  payments: ['billing', 'payments'],
  pricing: ['platform'],
  products: ['products'],
  settings: ['platform'],
  setup: ['setup'],
  studio: ['studio'],
  templates: ['templates', 'platform'],
  tokens: ['billing'],
  webhooks: ['webhooks'],
  whatsapp: ['channels', 'webhooks']
};

const coverage = {};
for (const [cat, catRoutes] of Object.entries(categories)) {
  coverage[cat] = { routes: catRoutes, testedBy: new Set() };
}

for (const [file, info] of Object.entries(testInfo)) {
  for (const p of info.apiPaths) {
    const seg = p.replace('/api/', '').split('/')[0];
    if (coverage[seg]) coverage[seg].testedBy.add(file + ' (api-ref)');
  }
  for (const mod of info.imports) {
    const cats = moduleToCategory[mod] || [mod];
    for (const c of cats) {
      if (coverage[c]) coverage[c].testedBy.add(file + ' (module:' + mod + ')');
    }
  }
}

const report = {
  totalRoutes: routes.length,
  totalTestFiles: testFiles.length,
  categories: {},
  untestedRoutes: []
};

for (const [cat, info] of Object.entries(coverage)) {
  const tested = info.testedBy.size > 0;
  report.categories[cat] = {
    routeCount: info.routes.length,
    tested,
    testedBy: [...info.testedBy]
  };
  if (!tested) report.untestedRoutes.push(...info.routes);
}

console.log(JSON.stringify(report, null, 2));
fs.writeFileSync('route-coverage.json', JSON.stringify(report, null, 2));
