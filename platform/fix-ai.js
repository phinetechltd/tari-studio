
const fs = require('fs');
const lines = fs.readFileSync('src/server/ai.ts', 'utf8').split('
');
// Fix line 198 (index 197): model: resolveModel } -> model: resolvedModel }
if (lines[197].includes('model: resolveModel }')) {
  lines[197] = lines[197].replace('model: resolveModel }', 'model: resolvedModel }');
  console.log('Fixed line 198');
} else {
  console.log('Pattern not found on line 198:', lines[197]);
}
// Also check line 117
if (lines[116].includes('model: resolveModel,')) {
  lines[116] = lines[116].replace('model: resolveModel,', 'model: resolvedModel,');
  console.log('Fixed line 117');
}
fs.writeFileSync('src/server/ai.ts', lines.join('
'));
console.log('Done');
