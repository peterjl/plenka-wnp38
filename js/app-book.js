/* 口袋书：票与住宿、西里尔字母、短语、标牌、菜单、交通、开桥、日落、闭馆、紧急、钱与网络 */
(function () {
  const C = window.Core, U = window.UI, esc = C.esc, D = C.D;
  const V = (window.BookView = {});
  const TILES = [
    ["tickets", "🎫", "票与住宿", "БИЛЕТЫ"], ["abc", "Ё", "西里尔字母", "АЛФАВИТ"], ["phr", "💬", "常用短语", "ФРАЗЫ"], ["signs", "🪧", "标牌速认", "ЗНАКИ"],
    ["menu", "🥟", "菜单词典", "МЕНЮ"], ["trans", "Ⓜ", "交通与打车", "ТРАНСПОРТ"], ["bridge", "🌉", "开桥时刻", "МОСТЫ"], ["sun", "☀", "日出日落", "СОЛНЦЕ"],
    ["closed", "🔒", "闭馆速查", "ВЫХОДНЫЕ"], ["sos", "☎", "紧急电话", "SOS"], ["money", "₽", "钱与网络", "ДЕНЬГИ"], ["weather", "☂", "天气穿衣", "ПОГОДА"],
  ];
  const rows = (arr, ru, tr, zh, extra) => `<div class="rowlist">${arr.map((x) => `<button class="row-item" data-big="${esc(x[ru])}" data-bigzh="${esc(x[zh])}"><div><div class="r">${esc(x[ru])}</div><div class="t">${esc(x[tr] || "")}</div><div class="z">${esc(x[zh])}</div></div><div class="tag">${esc(extra ? x[extra] || "" : "")}</div></button>`).join("")}</div>`;
  const text = (o) => (o == null ? "" : typeof o === "string" ? o : Array.isArray(o) ? o.map(text).join("\n") : Object.entries(o).filter(([k]) => k !== "sources").map(([k, v]) => text(v)).join("\n"));
  const para = (s) => `<p style="white-space:pre-line;margin:0 0 8px;color:var(--ink-2);font-size:14px">${esc(s)}</p>`;

  function sec(id) {
    if (id === "tickets") {
      const t = [
        ["✈ 航班", "9/29 21:00 抵达 SVO", "10/06 约 20:00 从 SVO 起飞（国际，17:00 前到）"],
        ["🚂 028А", "10/03 21:45 莫斯科列宁格勒站 → 10/04 06:40 圣彼得堡莫斯科站", "4 号车厢 29、31 号下铺（同一间）· RW.by 订单 · 已电子登记，凭护照上车"],
        ["🚂 003А", "10/05 23:30 圣彼得堡莫斯科站 → 10/06 08:30 莫斯科列宁格勒站", "车厢铺位：待订 / 待确认"],
        ["🚐 包车", "10/01 16:00–22:00", "武装力量主教堂（爱国者公园，库宾卡）"],
      ].map((x) => `<div class="ticket"><div class="main"><div class="kind">${esc(x[0])}</div><div class="t" style="font-size:14px">${esc(x[1])}</div><div class="s">${esc(x[2])}</div></div><div class="stub"><div class="big">✓</div></div></div>`).join("");
      const hotels = D.places.filter((p) => p.kind === "hotel").map((h) => `<button class="row-item" data-openp="${h.id}"><div><div class="z"><b>${esc(h.name_zh)}</b></div><div class="r" style="font-size:14px">${esc(h.address_ru || "")}</div><div class="small">☎ ${esc(h.phone || "")} · 入住 ${esc((h.checkin || "").slice(0, 12))} · 退房 ${esc((h.checkout || "").slice(0, 10))}</div></div><div class="tag">›</div></button>`).join("");
      return `<div class="tickets" style="margin:0">${t}</div><div class="hr"></div><div class="rowlist">${hotels}</div>`;
    }
    if (id === "abc") return `${D.cyrillic_note ? para(D.cyrillic_note) : ""}<div class="alpha">${(D.cyrillic || []).map((c) => `<button class="${/假朋友|⚠/.test(c.hint || "") ? "fake" : ""}" data-big="${esc(c.upper + " " + c.lower)}" data-bigzh="${esc(c.sound + " · " + (c.hint || ""))}"><div class="L">${esc(c.upper)}<small>${esc(c.lower)}</small></div><div class="S">${esc(c.sound)}</div><div class="H">${esc(c.hint || "")}</div></button>`).join("")}</div><p class="small">黄框 = "长得像拉丁字母但读音不同"的假朋友，最容易认错。</p>`;
    if (id === "phr") {
      const g = {}; (D.phrases || []).forEach((p) => (g[p.situation] = g[p.situation] || []).push(p));
      return Object.entries(g).map(([k, arr]) => `<h4 style="margin:12px 0 6px">${esc(k)}</h4>${rows(arr, "ru", "translit", "zh")}`).join("");
    }
    if (id === "signs") return rows(D.signs || [], "ru", "translit", "zh");
    if (id === "menu") return `<div class="searchbar" style="margin:0 0 10px"><input id="dq" type="search" placeholder="搜菜名（中/俄）"></div><div id="dlist">${menuList("")}</div>`;
    if (id === "trans") return para(text(D.transport));
    if (id === "bridge") {
      const b = D.bridges || {};
      return `${b.season_note ? para(b.season_note) : ""}<div class="rowlist">${(b.schedule || []).map((s) => `<div class="row-item"><div><div class="z"><b>${esc(s.bridge_zh)}</b></div><div class="r" style="font-size:14px">${esc(s.bridge_ru)}</div></div><div class="mono" style="font-size:13px;text-align:right">${esc(s.open_times).replace(/, /g, "<br>")}</div></div>`).join("")}</div>${b.best_viewpoints ? `<h4>最佳观看点</h4>${para(text(b.best_viewpoints))}` : ""}`;
    }
    if (id === "sun") return `<div class="rowlist">${(D.sun || []).map((s) => `<div class="row-item"><div><b>${esc(s.date.slice(5).replace("-", "/"))} · ${/sp|pet/i.test(s.city) ? "圣彼得堡" : "莫斯科"}</b><div class="small">黄金 ${esc(s.golden_hour_pm || "")} · 蓝调 ${esc(s.blue_hour_pm || "")}</div></div><div class="mono">☀ ${esc(s.sunrise)}<br>☾ ${esc(s.sunset)}</div></div>`).join("")}</div>${D.sun_note ? para(D.sun_note) : ""}`;
    if (id === "closed") return `<div class="rowlist">${(D.closures || []).map((c) => `<div class="row-item" style="grid-template-columns:1fr"><div><b>${esc(c.place_zh)}</b> <span class="pill red">${esc(c.weekday_closed)}</span><div class="small">${esc(c.note || "")}</div></div></div>`).join("")}</div>`;
    if (id === "sos") return `<div class="rowlist">${(D.emergency || []).map((e) => `<a class="row-item" href="tel:${esc(String(e.number).replace(/[^\d+]/g, ""))}" style="text-decoration:none;color:inherit"><div><b>${esc(e.name_zh)}</b><div class="small">${esc(e.note || "")}</div></div><div class="big disp" style="font-size:18px">${esc(e.number)}</div></a>`).join("")}</div>`;
    if (id === "money") return para(text(D.money)) + para(text(D.connectivity));
    if (id === "weather") return para(text(D.weather));
    return "";
  }
  function menuList(q) {
    q = q.trim().toLowerCase();
    const arr = (D.dishes || []).filter((d) => !q || [d.ru, d.zh, d.translit, d.desc].join(" ").toLowerCase().includes(q));
    const g = {}; arr.forEach((d) => (g[d.category] = g[d.category] || []).push(d));
    return Object.entries(g).map(([k, a]) => `<h4 style="margin:12px 0 6px">${esc(k)}</h4><div class="rowlist">${a.map((d) => `<button class="row-item" data-big="${esc(d.ru)}" data-bigzh="${esc(d.zh)}"><div><div class="r">${esc(d.ru)} ${d.must_try ? "<span class='pill red' style='padding:0 6px;font-size:10px'>必尝</span>" : ""}</div><div class="t">${esc(d.translit)}</div><div class="z"><b>${esc(d.zh)}</b> · ${esc(d.desc || "")}</div></div></button>`).join("")}</div>`).join("") || '<div class="empty">没找到</div>';
  }

  async function offlineStatus(el) {
    const P = window.PRECACHE; if (!P || !("caches" in window)) { el.innerHTML = "此浏览器不支持离线缓存"; return; }
    let n = 0; try { const c = await caches.open(P.v); const keys = await c.keys(); const have = new Set(keys.map((k) => new URL(k.url).pathname)); n = P.files.filter((f) => have.has(new URL(f, location.href).pathname)).length; } catch (e) {}
    const all = P.files.length, ok = n >= all;
    el.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><div style="font-size:22px">${ok ? "✅" : "⏳"}</div><div style="flex:1"><b>${ok ? "离线就绪：全部资源已存在本机" : "离线缓存中…"}</b><div class="small">${n} / ${all} 个文件 · 含两城地图${navigator.serviceWorker && navigator.serviceWorker.controller ? "" : " · 离线服务尚未接管（首次打开请刷新一次）"}</div></div>${ok ? "" : `<button class="btn primary" id="dl-all">立即下载全部</button>`}</div>`;
    const b = el.querySelector("#dl-all");
    if (b) b.onclick = async () => { b.disabled = true; b.textContent = "下载中…"; const c = await caches.open(P.v); let k = 0; for (const f of P.files) { try { await c.add(new Request(f, { cache: "reload" })); } catch (e) {} if (++k % 10 === 0) b.textContent = `下载中 ${k}/${all}`; } offlineStatus(el); };
  }

  V.render = function (root) {
    root.innerHTML = `<div class="section-title" style="margin-top:14px"><h2>口袋书 · Справка</h2><span>离线可用</span></div>
      <div class="card" style="margin:0 16px;padding:12px 14px" id="offline-st">检查离线状态…</div>
      <div class="book-grid">${TILES.map((t) => `<button class="card book-tile" data-sec="${t[0]}"><div class="ic">${t[1]}</div><div><b>${t[2]}</b><br><span>${t[3]}</span></div></button>`).join("")}</div>
      <p class="small wrap">所有俄语文字都可以点一下放大，直接给司机、店员或路人看。</p>`;
    offlineStatus(U.$("#offline-st", root));
    root.onclick = (e) => {
      const b = e.target.closest("[data-sec]"); if (!b) return;
      const t = TILES.find((x) => x[0] === b.dataset.sec);
      const sh = U.openSheet(`<div class="section-title" style="margin-top:6px"><h2>${t[2]} · ${t[3]}</h2></div><div class="wrap">${sec(t[0])}</div>`);
      const dq = U.$("#dq", sh.el); if (dq) dq.oninput = () => (U.$("#dlist", sh.el).innerHTML = menuList(dq.value));
      sh.el.addEventListener("click", (ev) => { const o = ev.target.closest("[data-openp]"); if (o) U.detail(o.dataset.openp); });
    };
  };
})();
