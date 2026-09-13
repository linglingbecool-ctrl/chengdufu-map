const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("script.js", "utf8");

const fileNameSource = source.slice(
  source.indexOf("function publicMemoryImageFileName("),
  source.indexOf("function renderPublicMemoryImageViewer(")
);
const fileNameContext = vm.createContext({ URL });
vm.runInContext(fileNameSource, fileNameContext);
assert.equal(
  fileNameContext.publicMemoryImageFileName("四川大学/望江", 1, "https://example.com/photo.jpeg?token=1"),
  "城市记忆-四川大学-望江-2.jpg"
);
assert.equal(
  fileNameContext.publicMemoryImageFileName("", 0, "not a url"),
  "城市记忆-成都-1.jpg"
);

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

const downloadSource = source.slice(
  source.indexOf("async function downloadPublicMemoryImage("),
  source.indexOf("async function setPublicMemoryLike(")
);
const status = { textContent: "" };
let downloadedFileId = "";
const downloadContext = vm.createContext({
  publicMemoryImageState: {
    urls: ["https://example.com/photo.jpg"],
    files: [{ fileId: "cloud://archive/photo.jpg" }],
    index: 0,
    pointName: "四川大学"
  },
  cloudApp: {
    async downloadFile({ fileID }) {
      downloadedFileId = fileID;
      return { statusCode: 200 };
    }
  },
  document: { querySelector: () => status },
  fetch: () => { throw new Error("SDK path should be used"); },
  URL,
  window: { setTimeout }
});
vm.runInContext(downloadSource, downloadContext);

downloadContext.downloadPublicMemoryImage({ disabled: false })
  .then(() => {
    assert.equal(downloadedFileId, "cloud://archive/photo.jpg");
    assert.equal(status.textContent, "下载已开始");
    console.log("PASS: image download path, safe names and Citywalk navigation boundaries");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
