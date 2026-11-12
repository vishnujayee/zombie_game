// Tiny test runner. Usage: node tests/run.js [filter]
'use strict';
const fs = require('fs');
const path = require('path');

const filter = process.argv[2] || '';
const tests = [];
global.test = (name, fn) => tests.push({ name, fn, file: global.__file });

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && f.includes(filter)).sort();
for (const f of files) {
  global.__file = f;
  require(path.join(__dirname, f));
}

(async () => {
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('PASS ' + t.file + ' :: ' + t.name);
    } catch (e) {
      fail++;
      console.log('FAIL ' + t.file + ' :: ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e));
    }
  }
  console.log(`\n${tests.length - fail}/${tests.length} passed`);
  process.exit(fail || !tests.length ? 1 : 0);
})();
