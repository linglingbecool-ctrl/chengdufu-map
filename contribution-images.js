/* Phone photos: local validation/conversion only; no new service or dependency. */
(() => {
  "use strict";
  const MAX_COUNT = 3, MAX_SOURCE_SIZE = 20 * 1024 * 1024, MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
  const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

  function imageType(file) {
    const type = String(file.type || "").toLowerCase();
    if (type === "image/jpg") return "image/jpeg";
    if (type && type !== "application/octet-stream") return type;
    return types[String(file.name || "").split(".").pop().toLowerCase()] || "";
  }

  function validate(files) {
    if (files.length > MAX_COUNT) throw new Error(`每次最多选择${MAX_COUNT}张照片，请重新选择。`);
    for (const file of files) {
      if (!Object.values(types).includes(imageType(file))) throw new Error(`“${file.name}”格式不支持，请选择 JPG、PNG、WebP 或 HEIC 照片。`);
      if (!file.size) throw new Error(`“${file.name}”没有读到照片内容，请先在相册下载原图，再重新选择。`);
      if (file.size > MAX_SOURCE_SIZE) throw new Error(`“${file.name}”超过20MB，请在相册导出较小的副本后重选。`);
    }
  }

  function detectType(bytes) {
    const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
    if ([137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) return "image/png";
    if (text(0,4) === "RIFF" && text(8,12) === "WEBP") return "image/webp";
    if (text(4,8) === "ftyp") {
      const brands = [text(8,12)];
      for (let i = 16; i + 4 <= bytes.length; i += 4) brands.push(text(i,i+4));
      if (brands.some(brand => ["heic","heix","hevc","hevx","mif1","msf1"].includes(brand))) return "image/heic";
    }
    return "";
  }

  function readHeader(file) {
    const blob = file.slice(0,64);
    if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`“${file.name}”读取失败，请先下载相册中的原图再重选。`));
      reader.readAsArrayBuffer(blob);
    });
  }

  function decode(url, fileName, type) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const fail = () => {
        clearTimeout(timer); img.onload = img.onerror = null; img.src = "";
        reject(new Error(type === "image/heic"
          ? `当前浏览器无法读取“${fileName}”的 HEIC 格式，请从相册导出 JPG 副本，或改选照片截图。`
          : `“${fileName}”无法读取，请确认原图已下载到手机；也可以重新导出 JPG 后再试。`));
      };
      const timer = setTimeout(fail, 30000);
      img.onerror = fail;
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) { fail(); return; }
        clearTimeout(timer); img.onload = img.onerror = null; resolve(img);
      };
      img.src = url;
    });
  }

  async function prepare(file) {
    validate([file]);
    const type = detectType(new Uint8Array(await readHeader(file)));
    if (!type) throw new Error(`“${file.name}”的内容不是支持的照片格式，请重新导出 JPG 后再试。`);
    const normalized = file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
    const url = URL.createObjectURL(normalized);
    let img, canvas;
    try {
      img = await decode(url, file.name, type);
      if (type !== "image/heic" && file.size <= MAX_UPLOAD_SIZE) return normalized;
      // Process photos serially. Source cap is 20 MB; a 2048 px canvas stays
      // within 4 MP for older phones. Larger originals need a server-side path.
      const scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("手机暂时无法处理照片，请关闭其他页面后重试。");
      ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for (const quality of [0.86, 0.72, 0.58]) {
        const blob = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("照片处理超时，请导出较小的 JPG 副本后再试。")), 30000);
          try { canvas.toBlob(value => { clearTimeout(timer); resolve(value); }, "image/jpeg", quality); }
          catch (error) { clearTimeout(timer); reject(error); }
        });
        if (blob?.size > 0 && blob.type === "image/jpeg" && blob.size <= MAX_UPLOAD_SIZE) {
          return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
        }
      }
      throw new Error(`“${file.name}”压缩未完成，请导出较小的 JPG 副本后再试。`);
    } finally {
      if (img) img.src = "";
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      URL.revokeObjectURL(url);
    }
  }

  const api = { imageType, validate, detectType, prepare };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.tuhuiImages = api;
})();
