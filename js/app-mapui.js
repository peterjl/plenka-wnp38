/* 地图页 UI：今日路线 / 全部景点 / 自选路线；把交通方案画成线 */
(function () {
  const C = window.Core, U = window.UI, esc = C.esc;
  const V = (window.MapUI = {});
  let root, inited = false, sel = null;
  const st = { mode: "day", city: "msk" };

  const LL = (p) => [p.lon, p.lat];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const midOf = (cs) => cs[Math.floor(cs.length / 2)] || cs[0];
  function arc(a, b, k = 0.18) { // 轻微弧线，更有手绘感
    const m = mid(a, b), dx = b[0] - a[0], dy = b[1] - a[1], c = [m[0] - dy * k, m[1] + dx * k], out = [];
    for (let t = 0; t <= 1.0001; t += 0.1) out.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
    return out;
  }
  // 交通方案 -> 地图线段
  V.legGeo = function (city, A, B, r, mode) {
    mode = mode || r.best; const out = [];
    if (mode === "metro" && r.metro) {
      const m = r.metro, s0 = C.stName(city, m.from), s1 = C.stName(city, m.to);
      out.push({ mode: "walk", coords: [LL(A), [s0.lon, s0.lat]] });
      let tagged = false;
      m.legs.forEach((l) => {
        if (l.transfer) { const a = C.stName(city, l.from), b = C.stName(city, l.to); out.push({ mode: "walk", coords: [[a.lon, a.lat], [b.lon, b.lat]] }); return; }
        const ln = C.line(city, l.line), cs = l.seq.map((i) => { const s = C.stName(city, i); return [s.lon, s.lat]; });
        out.push({ mode: "metro", color: ln.color, coords: cs, tag: tagged ? null : `Ⓜ ${ln.num} · ${m.min}′`, tagAt: midOf(cs) }); tagged = true;
      });
      out.push({ mode: "walk", coords: [[s1.lon, s1.lat], LL(B)] });
    } else if (mode === "aeroexpress") {
      const bel = C.get("msk-belorussky") || { lat: 55.7766, lon: 37.582 };
      const toAir = B.id === "svo";
      const cityLeg = r.aeroexpress.cityLeg;
      const cityGeo = toAir ? V.legGeo(city, A, bel, cityLeg, cityLeg.best) : V.legGeo(city, bel, B, cityLeg, cityLeg.best);
      const air = { mode: "air", coords: toAir ? arc(LL(bel), LL(B), 0.1) : arc(LL(A), LL(bel), 0.1), tag: `🚆 机场快线 ${r.aeroexpress.min}′` };
      air.tagAt = midOf(air.coords);
      return toAir ? cityGeo.concat([air]) : [air].concat(cityGeo);
    } else {
      const cs = mode === "walk" ? [LL(A), LL(B)] : arc(LL(A), LL(B));
      const s = C.legSummary(city, r, mode);
      out.push({ mode: mode === "car" ? "car" : mode === "taxi" ? "taxi" : "walk", coords: cs, tag: `${s.icon} ${s.min}′`, tagAt: midOf(cs) });
    }
    if (mode === "walk" && out[0]) { out[0].tag = `🚶 ${r.walk.min}′`; out[0].tagAt = mid(LL(A), LL(B)); }
    return out;
  };

  function markerItems(highlight) { // highlight: Map id -> number
    const items = [];
    C.D.pois.forEach((p) => {
      const n = highlight && highlight.get(p.id);
      items.push({ id: p.id, lat: p.lat, lon: p.lon, label: p.name_zh.split("（")[0], score: p.score, food: p.group === "美食", num: n, inroute: n != null, dim: highlight && highlight.size && n == null, sel: p.id === sel });
    });
    return items;
  }

  function dayRoute(date) {
    const day = C.D.days.find((d) => d.date === date); const res = C.compute(day);
    const legs = [], hl = new Map();
    let prev = res.startP;
    res.rows.forEach((row, i) => { legs.push(...V.legGeo(day.city, prev, row.p, row.r, row.mode)); if (!row.p.kind) hl.set(row.p.id, i + 1); prev = row.p; });
    if (res.endInfo && !res.endInfo.same) legs.push(...V.legGeo(day.city, prev, res.endInfo.p, res.endInfo.r, res.endInfo.mode));
    // 关键地点（车站/机场/酒店/包车）
    const keys = [];
    const push = (id, tag) => { const p = C.get(id); if (p && !keys.find((k) => k.id === id)) keys.push({ id, lat: p.lat, lon: p.lon, tag, hotel: p.kind === "hotel" }); };
    (day.events || []).forEach((e) => e.place && push(e.place, `${e.time} ${e.title.split(" ")[0]}`));
    if (day.deadline) push(day.deadline.place, `${day.deadline.time} 前到`);
    push(res.startP.id, `${day.start.time} ${res.startP.kind === "hotel" ? "出发" : "到达"}`);
    return { day, res, legs, hl, keys };
  }

  function sheetDay(date) {
    const { day, res } = dayRoute(date);
    const rows = res.rows.map((row, i) => {
      const s = row.sum;
      return `<div class="custom-row" data-focus="${row.p.id}" style="grid-template-columns:26px 1fr auto"><span class="n" style="${row.p.group === "美食" ? "background:var(--mustard);color:var(--ink)" : ""}">${row.p.kind ? "⌂" : i + 1}</span>
        <div><b>${esc(row.p.name_zh.split("（")[0])}</b><div class="small">${C.fmt(row.start)}–${C.fmt(row.end)} · 前往 ${s.icon} ${s.min}′ ${esc(s.sub || "")}</div>${row.warns.filter((w) => w.lvl !== "info").map((w) => `<div class="warnline">⚠︎ ${esc(w.t)}</div>`).join("")}</div><span class="small">›</span></div>`;
    }).join("");
    const dl = res.endInfo && res.endInfo.deadline != null ? `<div class="alert ${res.endInfo.slack < 0 ? "" : "info"}" style="margin-top:8px"><span class="ic">${res.endInfo.slack < 0 ? "⚠︎" : "⏱"}</span><div>${esc(day.deadline.label)}：预计 ${C.fmt(res.endInfo.arrive)} 到，${res.endInfo.slack < 0 ? "晚 " + -res.endInfo.slack + " 分钟" : "富余 " + C.dur(res.endInfo.slack)}</div></div>` : "";
    return `<div class="mtitle"><b>${day.date.slice(5).replace("-", "/")} ${C.WDZH[C.wdOf(day.date)]} · ${esc(day.title)}</b><span class="spacer"></span><button class="pill" data-go="days">行程 ›</button></div>
      <div class="chips" style="padding:0 0 8px">${C.D.days.map((d) => `<button class="chip ${d.date === date ? "on" : ""}" data-mday="${d.date}">${d.date.slice(5).replace("-", "/")}</button>`).join("")}</div>
      ${dl}<div class="custom-list">${rows || '<div class="empty">这天没有安排景点</div>'}</div>
      <p class="small">图例：<b>···</b> 步行　<b style="color:#c7322a">- -</b> 打车　<b>彩色实线</b> 地铁（线路颜色）　<b style="color:#2e6a6c">- -</b> 机场快线　红色光圈 = 当天关键地点</p>`;
  }
  function sheetAll() {
    const arr = C.D.pois.filter((p) => p.city === st.city).sort((a, b) => b.score - a.score);
    return `<div class="mtitle"><b>${st.city === "spb" ? "圣彼得堡" : "莫斯科"} · 全部 ${arr.length} 项</b><span class="spacer"></span><span class="small">按精品度</span></div>
      <div class="custom-list">${arr.map((p, i) => `<div class="custom-row" data-focus="${p.id}"><span class="n" style="${p.group === "美食" ? "background:var(--mustard);color:var(--ink)" : p.score >= 5 ? "background:var(--red)" : ""}">${i + 1}</span><div><b>${esc(p.name_zh.split("（")[0])}</b><div class="small">${C.stars(p.score)} · ${esc(p.group)}</div></div><span class="small">›</span></div>`).join("")}</div>`;
  }
  function customStops() { C.store.custom = C.store.custom || { msk: [], spb: [] }; return C.store.custom[st.city] || (C.store.custom[st.city] = []); }
  function sheetCustom() {
    const ids = customStops(); let total = 0, html = "";
    ids.forEach((id, i) => {
      const p = C.get(id); if (!p) return;
      let legTxt = "";
      if (i > 0) { const r = C.route(st.city, C.get(ids[i - 1]), p), s = C.legSummary(st.city, r); total += s.min; legTxt = `<div class="small" style="margin:2px 0 2px 34px">${s.icon} ${esc(s.text)} · ${esc(s.sub || "")}</div>`; }
      total += C.stayMin(p, "normal");
      html += `${legTxt}<div class="custom-row"><span class="n">${i + 1}</span><div data-focus="${id}"><b>${esc(p.name_zh.split("（")[0])}</b><div class="small">停留约 ${C.stayMin(p, "normal")}′</div></div>
        <span style="display:flex;gap:4px"><button class="pill" data-cu="up" data-i="${i}">▲</button><button class="pill" data-cu="del" data-i="${i}">✕</button></span></div>`;
    });
    return `<div class="mtitle"><b>自选路线 · ${st.city === "spb" ? "圣彼得堡" : "莫斯科"}</b><span class="spacer"></span>${ids.length ? `<span class="pill dark">约 ${C.dur(total)}</span>` : ""}</div>
      <p class="small" style="margin:0 0 8px">点地图上的图钉把景点加进来；顺序可调，交通方案自动计算。</p>
      <div class="custom-list">${html || '<div class="empty">还没有选点</div>'}</div>
      ${ids.length ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" data-cu="opt">⚡ 智能排序</button><button class="btn" data-cu="save">⤓ 存为某天路线</button><button class="btn ghost" data-cu="clear">清空</button></div>` : ""}`;
  }
  function sheetSel(id) {
    const p = C.get(id); if (!p) return "";
    const h = C.fromHotel(p), date = App.state.day;
    return `<div class="card pcard" style="margin-bottom:10px" data-open="${id}">
      <div class="ph">${p.kind ? `<div class="placeholder-art"><div class="big">${p.kind === "hotel" ? "⌂" : "🚉"}</div></div>` : U.thumb(p)}</div>
      <div class="bd"><div class="nm">${esc(p.name_zh.split("（")[0])}</div><div class="ru">${esc(p.name_ru)}</div>
      <div class="meta">${p.score ? `<span class="pill stars">${C.stars(p.score)}</span>` : ""}${h ? `<span class="pill teal">离酒店 ${h.icon} ${h.min}′</span>` : ""}${U.openBadge(p, date, C.nowMin())}</div>
      <div style="display:flex;gap:6px;margin-top:8px"><span class="btn" style="padding:6px 10px" data-openbtn="${id}">详情</span>${p.kind ? "" : `<span class="btn" style="padding:6px 10px" data-addc="${id}">＋自选</span><span class="btn primary" style="padding:6px 10px" data-addd="${id}">＋某天</span>`}</div></div></div>`;
  }

  function renderSheet() {
    const body = U.$("#msheet-body", root);
    const top = sel ? sheetSel(sel) : "";
    body.innerHTML = top + (st.mode === "day" ? sheetDay(App.state.day) : st.mode === "all" ? sheetAll() : sheetCustom());
  }
  function banner() {
    const b = U.$("#mbanner", root);
    if (st.mode !== "day") { b.style.display = "none"; return; }
    const day = C.D.days.find((d) => d.date === App.state.day);
    const ev = day.deadline ? { time: day.deadline.time, title: day.deadline.label } : (day.events || [])[0];
    if (!ev) { b.style.display = "none"; return; }
    let extra = "";
    if (C.todayStr() === day.date && day.deadline) { const left = C.hm(day.deadline.time) - C.nowMin(); extra = left > 0 ? ` · 还有 ${C.dur(left)}` : " · 已过"; }
    b.style.display = "flex"; b.innerHTML = `<span class="blink"></span><div><b>${esc(ev.time)}</b> ${esc(ev.title)}${extra}</div>`;
  }

  function draw(fit) {
    const M = window.MapView;
    if (st.mode === "day") {
      const r = dayRoute(App.state.day);
      st.city = r.day.city;
      M.setMarkers(markerItems(r.hl));
      M.showRoute({ legs: r.legs, keys: r.keys, fit });
    } else if (st.mode === "custom") {
      const ids = customStops(), hl = new Map(ids.map((id, i) => [id, i + 1])), legs = [];
      for (let i = 1; i < ids.length; i++) { const a = C.get(ids[i - 1]), b = C.get(ids[i]); legs.push(...V.legGeo(st.city, a, b, C.route(st.city, a, b))); }
      M.setMarkers(markerItems(hl));
      M.showRoute({ legs, keys: [], fit: fit && ids.length > 1 });
      if (fit && ids.length < 2) M.flyCity(st.city);
    } else {
      M.setMarkers(markerItems(null));
      M.showRoute({ legs: [], keys: [] });
      if (fit) M.flyCity(st.city);
    }
    U.$$("[data-mcity]", root).forEach((b) => b.classList.toggle("on", b.dataset.mcity === st.city));
    U.$$("[data-mmode]", root).forEach((b) => b.classList.toggle("on", b.dataset.mmode === st.mode));
    banner(); renderSheet();
  }

  V.mount = async function (container) {
    root = container;
    if (!inited) {
      root.innerHTML = `<div id="map"></div>
        <div class="map-top"><div class="seg" id="mcity"><button data-mcity="msk">莫斯科</button><button data-mcity="spb">彼得堡</button></div>
          <div class="seg"><button data-mmode="day">当日</button><button data-mmode="all">全部</button><button data-mmode="custom">自选</button></div></div>
        <div class="map-banner glass" id="mbanner" style="display:none"></div>
        <div class="map-fabs"><button class="fab" data-fab="loc" title="定位"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg></button>
          <button class="fab" data-fab="3d" title="3D"><svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg></button>
          <button class="fab" data-fab="fit" title="全览"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div>
        <div class="msheet" id="msheet"><div class="grab" id="mgrab"></div><div class="scroll" id="msheet-body"><div class="empty">地图加载中…</div></div></div>`;
      inited = true;
      bindSheet();
      root.addEventListener("click", onClick);
      await window.MapView.init(U.$("#map", root), {
        onSelect: (id) => {
          if (st.mode === "custom" && C.POI.has(id)) { const ids = customStops(); if (!ids.includes(id)) { ids.push(id); C.save(); U.toast("已加入自选路线"); } sel = id; draw(false); return; }
          sel = id; window.MapView.select(id); renderSheet(); setSheet("half");
        },
        onBackground: () => { if (sel) { sel = null; window.MapView.select(null); renderSheet(); } },
      });
      if (V._pending) { const p = V._pending; V._pending = null; draw(false); V.show(p); } else draw(true);
    } else { window.MapView.resize(); }
  };
  V.show = function (opts) { // {mode, city, focus}
    if (opts.mode) st.mode = opts.mode; if (opts.city) st.city = opts.city;
    if (!inited || !window.MapView.get()) { V._pending = opts; return; }
    if (opts.focus) { const p = C.get(opts.focus); sel = opts.focus; st.city = p.city; if (st.mode === "day") { const d = C.D.days.find((x) => x.date === App.state.day); if (d.city !== p.city) st.mode = "all"; } draw(false); window.MapView.focus(p.lat, p.lon); setSheet("half"); }
    else draw(true);
  };
  V.refresh = () => inited && window.MapView.get() && draw(false);
  V.addCustom = function (id) { const p = C.get(id); st.city = p.city; const ids = customStops(); if (!ids.includes(id)) ids.push(id); C.save(); };

  function onClick(e) {
    const t = e.target;
    const mc = t.closest("[data-mcity]"); if (mc) { st.city = mc.dataset.mcity; if (st.mode === "day") st.mode = "all"; sel = null; draw(true); return; }
    const mm = t.closest("[data-mmode]"); if (mm) { st.mode = mm.dataset.mmode; sel = null; draw(true); if (st.mode === "custom") setSheet("half"); return; }
    const fab = t.closest("[data-fab]");
    if (fab) {
      const f = fab.dataset.fab;
      if (f === "3d") fab.classList.toggle("on", window.MapView.toggle3D());
      if (f === "loc") { fab.classList.add("on"); window.MapView.locate((pos, err) => { if (err) { U.toast("定位失败：" + err); fab.classList.remove("on"); } }); }
      if (f === "fit") draw(true);
      return;
    }
    const md = t.closest("[data-mday]"); if (md) { App.setDay(md.dataset.mday, true); sel = null; draw(true); return; }
    if (t.closest("[data-go=days]")) { App.go("days"); return; }
    const ob = t.closest("[data-openbtn]"); if (ob) { U.detail(ob.dataset.openbtn); return; }
    const ac = t.closest("[data-addc]"); if (ac) { V.addCustom(ac.dataset.addc); U.toast("已加入自选路线（切到「自选」查看）"); return; }
    const ad = t.closest("[data-addd]"); if (ad) { App.chooseDayToAdd(ad.dataset.addd); return; }
    const cu = t.closest("[data-cu]");
    if (cu) {
      const ids = customStops(), i = +cu.dataset.i, a = cu.dataset.cu;
      if (a === "up" && i > 0) [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
      if (a === "del") ids.splice(i, 1);
      if (a === "clear") ids.length = 0;
      if (a === "opt" && ids.length > 2) optimizeCustom(ids);
      if (a === "save") return App.saveCustomAsDay(st.city, ids.slice());
      C.save(); draw(a === "clear" || a === "opt"); return;
    }
    const fo = t.closest("[data-focus]"); if (fo) { const p = C.get(fo.dataset.focus); sel = p.id; window.MapView.select(p.id); window.MapView.focus(p.lat, p.lon); renderSheet(); setSheet("peek"); return; }
    const op = t.closest("[data-open]"); if (op) U.detail(op.dataset.open);
  }
  function optimizeCustom(ids) {
    const pts = ids.map(C.get), n = ids.length; let order = [0]; const left = new Set(ids.map((_, i) => i).slice(1));
    while (left.size) { const last = pts[order[order.length - 1]]; let best = null, bc = 1e9; left.forEach((j) => { const c = C.route(st.city, last, pts[j]).min; if (c < bc) { bc = c; best = j; } }); order.push(best); left.delete(best); }
    const cost = (o) => o.slice(1).reduce((s, j, k) => s + C.route(st.city, pts[o[k]], pts[j]).min, 0);
    let improved = true; while (improved) { improved = false; for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) { const o2 = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1)); if (cost(o2) < cost(order)) { order = o2; improved = true; } } }
    const re = order.map((k) => ids[k]); ids.length = 0; ids.push(...re);
  }

  // ---- 抽屉拖拽 ----
  function setSheet(s) { const el = U.$("#msheet", root); el.classList.remove("half", "full"); if (s !== "peek") el.classList.add(s); }
  function bindSheet() {
    const el = U.$("#msheet", root), grab = U.$("#mgrab", root), body = U.$("#msheet-body", root);
    let y0 = null, st0 = "peek", moved = 0;
    const state = () => (el.classList.contains("full") ? "full" : el.classList.contains("half") ? "half" : "peek");
    const start = (e) => { y0 = e.touches[0].clientY; st0 = state(); moved = 0; };
    grab.addEventListener("touchstart", start, { passive: true });
    body.addEventListener("touchstart", (e) => { if (body.scrollTop <= 0) start(e); }, { passive: true });
    el.addEventListener("touchmove", (e) => { if (y0 == null) return; moved = e.touches[0].clientY - y0; }, { passive: true });
    el.addEventListener("touchend", () => {
      if (y0 == null) return; y0 = null;
      if (Math.abs(moved) < 40) return;
      const order = ["peek", "half", "full"], i = order.indexOf(st0);
      if (moved < 0 && i < 2 && (st0 !== "half" || body.scrollTop <= 0)) setSheet(order[i + 1]);
      if (moved > 0 && i > 0 && body.scrollTop <= 0) setSheet(order[i - 1]);
    });
    grab.addEventListener("click", () => { const s = state(); setSheet(s === "peek" ? "half" : s === "half" ? "full" : "peek"); });
  }
})();
