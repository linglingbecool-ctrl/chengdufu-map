/* Personal postcard export. Original images stay original; edits here never update a contribution. */
(() => {
  "use strict";
  const W = 1536, H = 1024, SCALE = 2400 / W;
  const SERIF = '"Songti SC", "STSong", "SimSun", serif';
  const INK = "#4b2913", RED = "#9a3e2d", RULE = "#bd9471";

  function wrapText(ctx, text, width) {
    const lines = [];
    for (const paragraph of String(text).replace(/\r\n?/g, "\n").split("\n")) {
      const chars = Array.from(paragraph);
      if (!chars.length) {lines.push(""); continue;}
      let start = 0;
      while (start < chars.length) {
        let end = start + 1;
        while (end < chars.length && ctx.measureText(chars.slice(start, end + 1).join("")).width <= width) end++;
        // Keep closing punctuation off the next line and opening punctuation with its following text.
        while (end < chars.length && end > start + 1 && (/^[，。！？；：、）》」』】〉,.!?;:]$/.test(chars[end]) || /^[（《「『【〈(]$/.test(chars[end - 1]))) end--;
        lines.push(chars.slice(start, end).join("")); start = end;
      }
    }
    return lines;
  }

  function fitText(ctx, text, width, height, maxSize, minSize, lineFactor = 1.45) {
    for (let size = maxSize; size >= minSize; size--) {
      ctx.font = `${size}px ${SERIF}`;
      const lines = wrapText(ctx, text, width), lineHeight = size * lineFactor;
      const usedHeight = lines.reduce((sum, line) => sum + lineHeight * (line === "" ? .45 : 1), 0);
      if (usedHeight <= height) return {lines, size, lineHeight};
    }
    return null;
  }

  function containRect(iw, ih, x, y, w, h) {
    const scale = Math.min(w / iw, h / ih);
    return [x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale];
  }

  function eligibleBadges(badges, pointId) {
    const unlocked = (Array.isArray(badges) ? badges : []).filter(badge => badge.unlocked === true);
    if (["sichuandaxue", "huaxiba"].includes(pointId)) {
      unlocked.sort((a, b) => Number(b.key === "scuMemoryKeeper") - Number(a.key === "scuMemoryKeeper"));
    }
    return unlocked;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Anonymous CORS is necessary for downloadable canvases, including CloudBase temporary URLs.
      img.crossOrigin = "anonymous";
      const finish = (error) => {
        clearTimeout(timer); img.onload = img.onerror = null;
        if (error) { img.src = ""; reject(error); } else resolve(img);
      };
      const timer = setTimeout(() => finish(new Error("图片读取超时，请重试；旧投稿照片可关闭后重新打开“我的记忆”刷新。")), 20000);
      img.onload = () => finish(img.naturalWidth && img.naturalHeight ? null : new Error("照片没有可读取的尺寸，请换一张照片。"));
      img.onerror = () => finish(new Error("图片暂时无法用于下载，请重试；旧投稿照片可关闭后重新打开“我的记忆”刷新。"));
      img.src = src;
    });
  }

  function drawLines(ctx, layout, x, y, color = INK) {
    ctx.font = `${layout.size}px ${SERIF}`; ctx.fillStyle = color;
    for (const line of layout.lines) {
      ctx.fillText(line, x, y);
      y += layout.lineHeight * (line === "" ? .45 : 1);
    }
  }

  function drawPostcard(canvas, {map, photo, mode, side = "front", title, text, place, time, badge, memoryNumber}) {
    canvas.width = W * SCALE; canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器暂时无法生成明信片，请稍后重试。");
    ctx.scale(SCALE, SCALE); ctx.textBaseline = "top";
    ctx.fillStyle = "#faf8f2"; ctx.fillRect(0, 0, W, H);
    const numbered = /^CD-\d{6,}$/.test(memoryNumber || "");
    const metadata = [place, time].filter(Boolean).join(" · ");

    if (side === "back") {
      // A writing reverse is independent of photo loading and front-side text capacity.
      ctx.strokeStyle = "#8da3ac"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) ctx.strokeRect(112 + i * 54, 104, 42, 50);
      ctx.strokeStyle = "#b4ad9e"; ctx.setLineDash([3, 5]);
      ctx.strokeRect(1252, 104, 172, 208); ctx.setLineDash([]);
      ctx.fillStyle = "#9b9385"; ctx.textAlign = "center";
      ctx.font = `18px ${SERIF}`; ctx.fillText("贴邮票处", 1338, 196); ctx.textAlign = "left";
      ctx.strokeStyle = "#d4cdbf"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(842, 212); ctx.lineTo(842, 842); ctx.stroke();
      ctx.strokeStyle = "#b6ad9e"; ctx.setLineDash([4, 5]);
      ctx.beginPath();
      for (const y of [508, 628, 748]) {ctx.moveTo(922, y); ctx.lineTo(1424, y);}
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = INK; ctx.font = `26px ${SERIF}`; ctx.fillText("舆上·成都", 112, 886);
      const detail = fitText(ctx, metadata, 690, 42, 18, 14, 1.2);
      if (!detail) throw new Error("地点、年代过长，请调整后再生成背面。");
      drawLines(ctx, detail, 112, 930, "#807461");
      ctx.fillStyle = "#807461"; ctx.font = `15px ${SERIF}`; ctx.textAlign = "right";
      if (numbered) ctx.fillText(`记忆编号 ${memoryNumber}`, 1424, 904);
      ctx.fillText("tuhuichengdu.cn", 1424, 938); ctx.textAlign = "left";
      return canvas;
    }

    // Wide unprinted margins and uncropped images keep the front close to an art postcard.
    ctx.fillStyle = INK; ctx.font = 'bold 40px "STKaiti", "KaiTi", ' + SERIF;
    ctx.fillText("舆上·成都", 112, 66);
    ctx.fillStyle = "#887a66"; ctx.font = `19px ${SERIF}`;
    ctx.fillText("你的专属城市记忆", 114, 120);
    if (badge) {
      const cx = 1378, cy = 82, radius = 25;
      ctx.strokeStyle = RED; ctx.fillStyle = RED; ctx.lineWidth = 1.3;
      for (const r of [radius, radius - 4]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
      const glyph = {chengduLamplighter:"✦", scuMemoryKeeper:"川", familyMemoryKeeper:"童", imageRecorder:"影", placeNameExplorer:"名", oralHistorian:"述", cityWalker:"行"}[badge.key] || "记";
      ctx.textAlign = "center"; ctx.font = `27px ${SERIF}`; ctx.fillText(glyph, cx, cy - 15);
      ctx.font = `18px ${SERIF}`; ctx.fillText(badge.title, cx, 115);
      if (badge.numberLabel) { ctx.font = `14px ${SERIF}`; ctx.fillText(badge.numberLabel, cx, 140); }
      ctx.textAlign = "left";
    }
    // Keep an even paper mat around the complete map, like the printed reference.
    const mapRect = containRect(map.naturalWidth, map.naturalHeight, 112, 228, 736, 648);
    const frameTop = mapRect[1] - 32, frameHeight = mapRect[3] + 64;
    const contentTop = frameTop + 32, contentBottom = frameTop + frameHeight - 32;
    ctx.strokeStyle = RULE; ctx.lineWidth = 1.4;
    ctx.strokeRect(mapRect[0] - 32, frameTop, mapRect[2] + 64, frameHeight);
    ctx.strokeRect(920, frameTop, 536, frameHeight);
    ctx.drawImage(map, ...mapRect);
    if (mode === "photo") {
      if (!photo) throw new Error("请先选择一张可读取的投稿照片，或切换文字版。");
      const heading = fitText(ctx, title, 472, 68, 30, 22, 1.2);
      const detail = fitText(ctx, metadata, 472, 44, 20, 16, 1.25);
      if (!heading || !detail) throw new Error("标题或地点、年代过长，请在编辑区调整后再生成。");
      const photoHeight = Math.min(500, 472 * photo.naturalHeight / photo.naturalWidth);
      const headingHeight = heading.lines.length * heading.lineHeight;
      const detailHeight = detail.lines.length * detail.lineHeight;
      const groupTop = frameTop + (frameHeight - photoHeight - 28 - headingHeight - 18 - detailHeight) / 2;
      ctx.drawImage(photo, ...containRect(photo.naturalWidth, photo.naturalHeight, 952, groupTop, 472, photoHeight));
      ctx.textAlign = "center";
      drawLines(ctx, heading, 1188, groupTop + photoHeight + 28);
      drawLines(ctx, detail, 1188, groupTop + photoHeight + 28 + headingHeight + 18, "#807461");
      ctx.textAlign = "left";
    } else {
      if (!text.trim()) throw new Error("请填写要放在明信片上的文字，或选择照片版。");
      const detail = fitText(ctx, metadata, 472, 50, 20, 16, 1.25);
      const heading = fitText(ctx, title, 472, 84, 34, 26, 1.2);
      if (!detail || !heading) throw new Error("标题或地点、年代过长，请在编辑区调整后再生成。");
      drawLines(ctx, detail, 952, contentTop, RED);
      const titleTop = contentTop + 18 + detail.lines.length * detail.lineHeight;
      drawLines(ctx, heading, 952, titleTop);
      const bodyTop = titleTop + heading.lines.length * heading.lineHeight + 28;
      const body = text.length <= 10000 && fitText(ctx, text, 472, contentBottom - bodyTop, 24, 21, 1.42);
      if (!body) throw new Error("全文超出这张明信片的容量。请在文字框自行选择、确认摘录后再生成；原投稿全文仍保留。");
      drawLines(ctx, body, 952, bodyTop);
    }
    ctx.fillStyle = "#807461"; ctx.font = `16px ${SERIF}`;
    ctx.fillText("《四川全图》· 成都府图 ｜ 四川大学图书馆", 112, 935);
    if (numbered) {ctx.font = `15px ${SERIF}`; ctx.fillText(`记忆编号 ${memoryNumber}`, 958, 935);}
    ctx.font = `16px ${SERIF}`; ctx.textAlign = "right";
    ctx.fillText("tuhuichengdu.cn", 1424, 962); ctx.textAlign = "left";
    return canvas;
  }

  let activeDialog;
  function open({item, text = "", files = [], badges = []}) {
    if (activeDialog) activeDialog.close();
    const returnFocus = document.activeElement;
    const earned = eligibleBadges(badges, item.pointId);
    const localUrls = files.map(file => URL.createObjectURL(file));
    const sources = localUrls.length ? localUrls : (item.imageUrls || []).filter(url => {
      try { return ["https:", "http:"].includes(new URL(url, location.href).protocol); } catch { return false; }
    });
    const dialog = document.createElement("dialog"); dialog.className = "postcard-dialog";
    dialog.setAttribute("aria-labelledby", "postcardTitle");
    dialog.innerHTML = `<header class="postcard-head"><div><p>一份可以带走的成都记忆</p><h2 id="postcardTitle">你的专属明信片</h2></div><button type="button" class="btn ghost" data-close aria-label="关闭明信片">关闭 ×</button></header>
      <div class="postcard-layout"><section class="postcard-paper" aria-label="明信片预览"><img alt="专属明信片预览，包含古地图、个人记忆及右上角所选徽章" hidden><p data-placeholder>正在生成预览……</p></section>
      <form class="postcard-editor"><fieldset><legend>正反面</legend><label><input type="radio" name="side" value="front" checked> 正面 · 城市记忆</label><label><input type="radio" name="side" value="back"> 背面 · 手写寄语</label></fieldset>
      <p data-back-notice hidden>邮票框、邮编格与地址横线已留好，左侧留白可在打印后手写寄语。正反面分别保存。</p>
      <fieldset data-front-field><legend>正面版式</legend><label><input type="radio" name="layout" value="photo"> 古图＋照片</label><label><input type="radio" name="layout" value="text"> 古图＋文字</label></fieldset>
      <p data-photo-notice hidden>投稿照片暂未加载，请关闭后重新打开“我的记忆”刷新；也可先生成文字版。</p>
      <label data-photo-field>投稿照片<select name="photo" aria-label="选择投稿照片"></select></label>
      <label data-front-field>明信片标题<input name="title" maxlength="60"></label>
      <div class="postcard-fields"><label>记忆地点<input name="place" maxlength="80"></label><label>年代（选填）<input name="time" maxlength="60"></label></div>
      <label data-text-field>明信片文字<textarea name="story" rows="8" maxlength="10000"></textarea><small>初始载入完整记忆。这里只编辑明信片，原投稿不变；超出篇幅时需自行确认摘录。</small></label>
      <label data-front-field>右上角徽章<select name="badge" aria-describedby="postcardBadgeNote"></select><small id="postcardBadgeNote"></small></label>
      <p class="postcard-status" role="status" aria-live="polite"></p>
      <div class="postcard-actions"><button type="button" class="btn primary" data-save disabled>保存到手机</button><a class="btn ghost" data-download aria-disabled="true" tabindex="-1">下载 PNG</a><button type="submit" class="btn ghost">重新生成预览</button></div>
      <small data-memory-number></small>
      <small>正反面分别保存 · PNG 图片 · 2400 × 1600。手机请点保存按钮，长按大图保存到相册。</small></form></div>`;
    document.body.append(dialog); activeDialog = dialog;
    const form = dialog.querySelector("form"), fields = form.elements;
    const img = dialog.querySelector(".postcard-paper img"), placeholder = dialog.querySelector("[data-placeholder]");
    const status = dialog.querySelector(".postcard-status"), download = dialog.querySelector("[data-download]");
    const save = dialog.querySelector("[data-save]");
    dialog.querySelector("[data-memory-number]").textContent = /^CD-\d{6,}$/.test(item.memoryNumber || "")
      ? `记忆编号 ${item.memoryNumber} · 换版式、换照片或再次下载，编号不变。` : "";
    fields.title.value = `${(item.pointName || "成都").replace(/（[^）]*）|\([^)]*\)/g, "")}的记忆`;
    fields.place.value = item.pointName || "成都"; fields.time.value = item.approximateTime || "";
    fields.story.value = text;
    fields.layout.value = sources.length ? "photo" : "text";
    fields.layout[0].disabled = !sources.length;
    dialog.querySelector("[data-photo-notice]").hidden = sources.length > 0 || !(Number(item.imageCount) > 0);
    sources.forEach((src, index) => fields.photo.add(new Option(`第 ${index + 1} 张照片`, String(index))));
    earned.forEach(badge => fields.badge.add(new Option(badge.title, badge.key)));
    fields.badge.add(new Option("不显示徽章", ""));
    fields.badge.value = earned[0]?.key || "";
    dialog.querySelector("#postcardBadgeNote").textContent = earned.length ? "只显示你已获得的徽章，可选择其中一枚。" : "暂未解锁徽章；获得后可从“我的记忆”重新生成。";
    let revision = 0, timer, previewUrl = "", closed = false, exportBlob = null, saveDialog = null;
    save.onclick = () => {
      if (!exportBlob || saveDialog) return;
      const view = document.createElement("dialog");
      view.className = "postcard-dialog postcard-save-dialog";
      view.setAttribute("aria-labelledby", "postcardSaveTitle");
      view.innerHTML = `<header class="postcard-head"><div><h2 id="postcardSaveTitle">把这份记忆留在相册里</h2></div><button type="button" class="btn ghost" data-close aria-label="关闭保存图片">关闭 ×</button></header>
        <p role="status">正在准备图片……</p><img hidden alt="可长按保存的完整明信片">
        <p class="postcard-save-help">若没有保存选项，请从微信右上角菜单选择在 Safari 中打开，再生成明信片并保存。</p>`;
      document.body.append(view); saveDialog = view;
      const picture = view.querySelector("img"), message = view.querySelector('[role="status"]');
      const reader = new FileReader();
      // Only encode on demand: a 2400 × 1600 PNG may add ~8 MB as a data URL.
      // Use a plain image for native long-press menus; release it when the dialog closes.
      reader.onload = () => {if (view.open) picture.src = reader.result;};
      reader.onerror = () => {message.textContent = "图片准备失败，请关闭后重试，或返回选择“下载 PNG”。";};
      picture.onload = () => {picture.hidden = false; message.textContent = "图片已准备好，请长按下方图片保存。";};
      picture.onerror = () => {message.textContent = "图片加载失败，请关闭后重试，或返回选择“下载 PNG”。";};
      view.querySelector("[data-close]").onclick = () => view.close();
      view.addEventListener("keydown", event => event.stopPropagation());
      view.addEventListener("close", () => {
        reader.onload = reader.onerror = null;
        if (reader.readyState === FileReader.LOADING) reader.abort();
        picture.onload = picture.onerror = null; picture.removeAttribute("src");
        view.remove(); if (saveDialog === view) saveDialog = null;
        if (!closed && save.isConnected) save.focus({preventScroll: true});
      }, {once: true});
      view.showModal(); reader.readAsDataURL(exportBlob);
    };
    const images = new Map();
    const getImage = src => {
      if (!images.has(src)) images.set(src, loadImage(src).catch(error => {images.delete(src); throw error;}));
      return images.get(src);
    };
    function invalidate() {
      revision++; clearTimeout(timer);
      exportBlob = null; save.disabled = true; saveDialog?.close();
      download.removeAttribute("href"); download.setAttribute("aria-disabled", "true"); download.tabIndex = -1;
      img.hidden = true; placeholder.hidden = false; placeholder.textContent = "正在生成预览……";
      status.textContent = "正在生成预览……";
      const back = fields.side.value === "back";
      dialog.querySelectorAll("[data-front-field]").forEach(el => {el.hidden = back;});
      dialog.querySelector("[data-back-notice]").hidden = !back;
      dialog.querySelector("[data-photo-notice]").hidden = back || sources.length > 0 || !(Number(item.imageCount) > 0);
      dialog.querySelector("[data-photo-field]").hidden = back || fields.layout.value !== "photo";
      dialog.querySelector("[data-text-field]").hidden = back || fields.layout.value !== "text";
      save.textContent = back ? "保存背面到手机" : "保存正面到手机";
      download.textContent = back ? "下载背面 PNG" : "下载正面 PNG";
      img.alt = back ? "明信片背面：邮编格、邮票框、地址横线和手写留白" : "明信片正面：馆藏古图、个人记忆及所选徽章";
    }
    async function render() {
      invalidate(); const current = revision;
      const state = {side: fields.side.value, mode: fields.layout.value, title: fields.title.value.trim(), text: fields.story.value,
        place: fields.place.value.trim(), time: fields.time.value.trim(), badge: earned.find(b => b.key === fields.badge.value)};
      let canvas;
      try {
        if (state.side !== "back" && !state.title) throw new Error("请填写明信片标题。");
        const [map, photo] = await Promise.all([state.side === "back" ? null : getImage("./chengdu-map-original.jpg"), state.side !== "back" && state.mode === "photo" ? getImage(sources[Number(fields.photo.value)]) : null]);
        if (closed || current !== revision) return;
        canvas = drawPostcard(document.createElement("canvas"), {...state, map, photo, memoryNumber: item.memoryNumber});
        const blob = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("图片导出失败，请重试。")), "image/png"));
        if (closed || current !== revision) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob); img.src = previewUrl; img.hidden = false; placeholder.hidden = true;
        exportBlob = blob; save.disabled = false;
        download.href = previewUrl; download.download = `舆上成都-${(state.place || "城市记忆").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 40)}-${state.side === "back" ? "背面" : (state.mode === "photo" ? "照片正面" : "文字正面")}明信片.png`;
        download.setAttribute("aria-disabled", "false"); download.tabIndex = 0;
        status.textContent = state.side === "back" ? "背面已生成，可保存后与正面配对使用。" : state.mode === "photo" ? "预览已更新，照片完整呈现，可下载保存。" : "预览已更新，当前文字完整排入，可下载保存。";
      } catch (error) {
        if (closed || current !== revision) return;
        status.textContent = error.name === "SecurityError" ? "照片暂时无法导出，请关闭后重新打开“我的记忆”刷新，或使用文字版。" : error.message;
        placeholder.textContent = "请按右侧提示调整后重新生成。";
      } finally {
        if (canvas) {canvas.width = 0; canvas.height = 0;}
      }
    }
    form.addEventListener("submit", event => {event.preventDefault(); render();});
    form.addEventListener("input", () => {invalidate(); timer = setTimeout(render, 300);});
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    // Keep Escape and arrow keys inside this native modal, away from map/panel shortcuts.
    dialog.addEventListener("keydown", event => event.stopPropagation());
    dialog.addEventListener("close", () => {
      closed = true; revision++; clearTimeout(timer);
      exportBlob = null; saveDialog?.close();
      localUrls.forEach(url => URL.revokeObjectURL(url));
      if (previewUrl) {const lastUrl = previewUrl; setTimeout(() => URL.revokeObjectURL(lastUrl), 60000);}
      dialog.remove(); if (activeDialog === dialog) activeDialog = null;
      if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    }, {once: true});
    dialog.showModal(); render();
  }

  const api = {open, wrapText, fitText, containRect, eligibleBadges, drawPostcard};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    window.tuhuiPostcards = api;
    window.addEventListener("tuhui:account-changed", () => activeDialog?.close());
  }
})();
