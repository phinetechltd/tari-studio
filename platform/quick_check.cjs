const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({headless:true});
  const p = await b.newPage();
  await p.goto('http://localhost:3400', {waitUntil:'networkidle'});
  const title = await p.title();
  const body = await p.$eval('body', el => el.innerText.slice(0,300));
  await b.close();
  console.log('TITLE:', title);
  console.log('BODY:', body);
})();
