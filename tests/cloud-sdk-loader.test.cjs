const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('script.js', 'utf8');
const loader = source.slice(source.indexOf('let cloudSdkPromise ='), source.indexOf('async function initCloudBase()'));
function harness() {
  const scripts = [], timers = new Map();
  let sequence = 0;
  const context = vm.createContext({
    window: {},
    document: {
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { append: script => scripts.push(script) }
    },
    setTimeout: fn => { const id = ++sequence; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(loader, context);
  return { context, scripts, timers, load: context.window.tuhuiEnsureCloudBase };
}
(async () => {
  for (const failure of ['network', 'invalid', 'timeout']) {
    const h = harness(), first = h.load(), second = h.load();
    assert.equal(first, second, 'Concurrent callers must share one download');
    assert.equal(h.scripts.length, 1);
    assert.equal(h.scripts[0].async, true);
    const rejected = assert.rejects(first, /云服务/);
    if (failure === 'timeout') [...h.timers.values()][0]();
    else if (failure === 'network') h.scripts[0].onerror();
    else h.scripts[0].onload();
    await rejected;
    assert.equal(h.timers.size, 0);
    assert.equal(h.scripts[0].removed, true);
    const retry = h.load();
    assert.equal(h.scripts.length, 2);
    h.context.window.cloudbase = { init() {} };
    h.scripts[1].onload();
    await retry;
    await h.load();
    assert.equal(h.scripts.length, 2, 'Loaded SDK must be reused');
    assert.equal(h.timers.size, 0);
  }
  console.log('PASS: shared async SDK download; network, invalid SDK and timeout cleanup; successful retry and reuse.');
})().catch(error => { console.error(error); process.exitCode = 1; });
