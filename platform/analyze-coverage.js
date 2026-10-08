const fs = require('fs');
const routes = JSON.parse(fs.readFileSync('api-routes.json', 'utf8'));
const testFiles = fs.readdirSync('scripts/integration').filter(f => f.endsWith('.test.ts'));
const testCoverage = new Map();
routes.forEach(r => testCoverage.set(r, { tested: false, testFile: null }));

testFiles.forEach(file => {
  const content = fs.readFileSync('scripts/integration/' + file, 'utf8');
  const matches = content.match(/(['"])\/api\/([^\s'"]+)\1/g) || [];
  matches.forEach(m => {
    const url = m.slice(1, -1).split('?')[0];
    if (url.startsWith('/api/')) {
      const ur = url.replace('/api', '');
      if (testCoverage.has(ur)) {
        testCoverage.set(ur, { tested: true, testFile: file });
      }
    }
  });
});

const summary = {
  totalRoutes: routes.length,
  tested: [...testCoverage.values()].filter(v => v.tested).length,
  untested: routes.filter(r => !testCoverage.get(r).tested)
};
console.log(JSON.stringify({ summary }, null, 2));
fs.writeFileSync('route-coverage.json', JSON.stringify({ routes, testCoverage: Object.fromEntries(testCoverage), summary }, null, 2));
