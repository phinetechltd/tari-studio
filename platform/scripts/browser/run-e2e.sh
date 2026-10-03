#!/bin/bash
# Generate TOTP code and run E2E test
cd "$(dirname "$0")/../.."
npx tsx --tsconfig scripts/tsconfig.json scripts/get-totp-quiet.ts > .tmp_totp.txt 2>&1
cat .tmp_totp.txt
npx playwright test --config=scripts/browser/playwright.config.ts --reporter=list 2>&1
