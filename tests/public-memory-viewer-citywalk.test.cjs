const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("script.js", "utf8");

assert.doesNotMatch(source, /data-public-image-download|downloadPublicMemoryImage|下载图片/);
assert.match(source, /data-public-memory-image/);
assert.match(source, /function openPublicMemoryImageViewer/);

const changeSource = source.slice(
  source.indexOf("function changeWalkStop("),
  source.indexOf("function setWalkScene(")
);
const walkContext = vm.createContext({
  activeWalkStopIndex: 0,
  getCitywalkPoints: () => [{}, {}, {}],
  renderCount: 0,
  closeCount: 0,
  renderWalkScene() { walkContext.renderCount += 1; },
  setWalkScene(open) { if (!open) walkContext.closeCount += 1; }
});
vm.runInContext(changeSource, walkContext);
walkContext.changeWalkStop(-1);
assert.equal(walkContext.activeWalkStopIndex, 0);
walkContext.changeWalkStop(1);
assert.equal(walkContext.activeWalkStopIndex, 1);
assert.equal(walkContext.renderCount, 1);
walkContext.activeWalkStopIndex = 2;
walkContext.changeWalkStop(1);
assert.equal(walkContext.closeCount, 1);

console.log("PASS: public memory image viewer controls and Citywalk navigation boundaries");
