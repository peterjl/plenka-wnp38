/* 景点项目：筛选、排序、列表；以及"加一站"选择器 */
(function () {
  const C = window.Core, U = window.UI, esc = C.esc;
  const V = (window.PlacesView = {});
  const f = { city: "msk", group: "全部", sort: "score", q: "" };
  const GROUPS = ["全部", "景点", "建筑", "博物馆", "公园", "体验", "美食"];

  function items() {
    const q = f.q.trim().toLowerCase();
    let arr = C.D.pois.filter((p) => p.city === f.city && (f.group === "全部" || p.group === f.group));
    if (q) arr = arr.filter((p) => [p.name_zh, p.name_ru, p.name_en, p.name_translit, p.summary].join(" ").toLowerCase().includes(q));
    const hotel = C.hotelOf(f.city);
    const dist = (p) => (p.region ? 999 : C.route(p.city, hotel, p).min);
    if (f.sort === "score") arr.sort((a, b) => b.score - a.score || dist(a) - dist(b));
    if (f.sort === "near") arr.sort((a, b) => dist(a) - dist(b));
    if (f.sort === "name") arr.sort((a, b) => a.name_zh.localeCompare(b.name_zh, "zh"));
    return arr;
  }

  V.card = function (p, rank, date) {
    const h = C.fromHotel(p);
    return `<button class="card pcard" data-open="${p.id}">
      <div class="ph">${U.thumb(p)}${rank ? `<span class="rank">#${rank}</span>` : ""}</div>
      <div class="bd"><div class="nm">${esc(p.name_zh.split("（")[0])}</div><div class="ru">${esc(p.name_ru)}</div>
        <div class="sm">${esc(p.summary || "")}</div>
        <div class="meta"><span class="pill stars">${C.stars(p.score)}</span>
          <span class="pill">${esc(p.group)}</span>
          ${p.duration_min ? `<span class="pill">⏱ ${p.duration_min.quick}–${p.duration_min.relaxed}′</span>` : ""}
          ${h ? `<span class="pill teal">${h.icon} ${h.min}′</span>` : p.region ? `<span class="pill dark">包车</span>` : ""}
          ${date ? U.openBadge(p, date) : ""}</div></div></button>`;
  };

  V.render = function (root, state) {
    const date = state.day;
    const list = items();
    root.innerHTML = `
      <div class="section-title" style="margin-top:14px"><h2>景点项目 · Места</h2><span>${list.length} 项</span></div>
      <div class="wrap" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="seg">${[["msk", "莫斯科"], ["spb", "圣彼得堡"]].map(([k, t]) => `<button class="${f.city === k ? "on" : ""}" data-city="${k}">${t}</button>`).join("")}</div>
        <div class="seg">${[["score", "精品度"], ["near", "离酒店"], ["name", "名称"]].map(([k, t]) => `<button class="${f.sort === k ? "on" : ""}" data-sort="${k}">${t}</button>`).join("")}</div>
      </div>
      <div class="searchbar"><input id="pq" type="search" placeholder="搜中文 / Русский / English" value="${esc(f.q)}"></div>
      <div class="chips">${GROUPS.map((g) => `<button class="chip ${f.group === g ? "on" : ""}" data-group="${g}">${g}</button>`).join("")}</div>
      <div class="plist" id="plist">${list.map((p, i) => V.card(p, f.sort === "score" ? i + 1 : 0, date)).join("") || '<div class="empty">没有匹配的项目</div>'}</div>
      <p class="small wrap">开放状态按行程中所选日期（${date.slice(5).replace("-", "/")} ${C.WDZH[C.wdOf(date)]}）显示；"离酒店"按推荐交通方式估算。</p>`;
    root.onclick = (e) => {
      const b = e.target.closest("[data-city],[data-sort],[data-group]");
      if (b) { if (b.dataset.city) f.city = b.dataset.city; if (b.dataset.sort) f.sort = b.dataset.sort; if (b.dataset.group) f.group = b.dataset.group; V.render(root, state); return; }
      const o = e.target.closest("[data-open]"); if (o) U.detail(o.getAttribute("data-open"), { date });
    };
    const inp = U.$("#pq", root); let tmr;
    inp.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { f.q = inp.value; const l = items(); U.$("#plist", root).innerHTML = l.map((p, i) => V.card(p, 0, date)).join("") || '<div class="empty">没有匹配的项目</div>'; }, 180); };
  };
  V.setCity = (c) => (f.city = c);

  // ---- 选择器：给某一天 / 自选路线 加一站 ----
  V.picker = function (city, fromPoint, onPick, title, exclude) {
    exclude = new Set(exclude || []);
    let q = "";
    const draw = (el) => {
      let arr = C.D.pois.filter((p) => p.city === city && !p.region && !exclude.has(p.id));
      if (q) arr = arr.filter((p) => [p.name_zh, p.name_ru, p.name_en].join(" ").toLowerCase().includes(q));
      const d = (p) => (fromPoint ? C.route(city, fromPoint, p).min : 0);
      arr.sort((a, b) => b.score - a.score || d(a) - d(b));
      U.$("#pk-list", el).innerHTML = arr.map((p) => {
        const r = fromPoint ? C.legSummary(city, C.route(city, fromPoint, p)) : null;
        return `<button class="picker-item" data-pick="${p.id}">${p.img ? `<img loading="lazy" src="${p.img.thumb}" alt="">` : `<div class="ph0"></div>`}
          <div style="min-width:0"><div style="font-weight:700">${esc(p.name_zh.split("（")[0])}</div><div class="d">${C.stars(p.score)} · ${esc(p.group)}${r ? ` · 从上一站 ${r.icon}${r.min}′` : ""}</div></div><span class="add">＋</span></button>`;
      }).join("");
    };
    const sh = U.openSheet(`<div class="section-title" style="margin-top:6px"><h2>${esc(title || "加一站")}</h2></div>
      <div class="searchbar"><input id="pk-q" type="search" placeholder="搜索"></div><div class="plist" id="pk-list" style="gap:8px"></div>`);
    draw(sh.el);
    U.$("#pk-q", sh.el).oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(sh.el); };
    sh.el.addEventListener("click", (e) => { const b = e.target.closest("[data-pick]"); if (b) { onPick(b.getAttribute("data-pick")); sh.close(); } });
  };
})();
