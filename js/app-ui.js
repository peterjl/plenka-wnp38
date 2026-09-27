/* 通用 UI：浮层、提示、出示大字、景点详情 */
(function () {
  const C = window.Core, esc = C.esc;
  const U = (window.UI = {});
  U.$ = (s, el = document) => el.querySelector(s);
  U.$$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  let toastT;
  U.toast = function (msg) {
    let el = U.$(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2200);
  };

  // ---- 通用底部浮层 ----
  const stack = [];
  U.openSheet = function (html, opts = {}) {
    const ov = document.createElement("div"); ov.className = "overlay";
    const sh = document.createElement("div"); sh.className = "sheet";
    sh.innerHTML = `<div class="grab"></div><button class="close" aria-label="关闭">✕</button><div class="scroll">${html}</div>`;
    document.body.append(ov, sh);
    requestAnimationFrame(() => { ov.classList.add("show"); sh.classList.add("show"); });
    const close = () => { ov.classList.remove("show"); sh.classList.remove("show"); setTimeout(() => { ov.remove(); sh.remove(); }, 380); const k = stack.indexOf(close); if (k >= 0) stack.splice(k, 1); opts.onClose && opts.onClose(); };
    ov.onclick = close; U.$(".close", sh).onclick = close;
    // 下拉关闭
    let y0 = null, dy = 0; const sc = U.$(".scroll", sh);
    sh.addEventListener("touchstart", (e) => { if (sc.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
    sh.addEventListener("touchmove", (e) => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0 && sc.scrollTop <= 0) { sh.style.transition = "none"; sh.style.transform = `translateY(${dy}px)`; } }, { passive: true });
    sh.addEventListener("touchend", () => { if (y0 == null) return; sh.style.transition = ""; sh.style.transform = ""; if (dy > 110) close(); y0 = null; });
    stack.push(close);
    return { el: sh, close };
  };
  U.closeTop = () => stack.length && stack[stack.length - 1]();

  // ---- 出示大字（给司机/店员看） ----
  U.big = function (ru, zh) {
    const el = document.createElement("div"); el.className = "bigtext";
    el.innerHTML = `<div class="r">${esc(ru)}</div>${zh ? `<div class="z">${esc(zh)}</div>` : ""}<div class="hint">轻触任意处关闭 · 可横屏</div>`;
    el.onclick = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 200); };
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("show"));
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-big]"); if (!b) return;
    U.big(b.getAttribute("data-big"), b.getAttribute("data-bigzh"));
  });

  U.thumb = function (p, cls = "") {
    if (p.img) return `<img class="${cls}" loading="lazy" decoding="async" src="${p.img.thumb}" alt="">`;
    const w = (p.name_ru || "").split(/[\s(«]/)[0].slice(0, 10);
    return `<div class="${cls} placeholder-art"><div class="big">${esc(w)}</div><div class="sm2">${p.group === "美食" ? "МЕНЮ · 餐" : "ПЛЁНКА"}</div></div>`;
  };
  U.openBadge = function (p, date, minute) {
    if (!p || p.kind) return "";
    const st = minute == null ? (C.hoursOn(p, date).kind === "closed" ? { state: "closedDay" } : { state: "?" }) : C.statusAt(p, date, minute);
    if (st.state === "closedDay") return `<span class="pill red">当日闭馆</span>`;
    if (st.state === "open") return `<span class="pill teal">营业中 · ${C.fmt(st.close)} 关</span>`;
    if (st.state === "before") return `<span class="pill mustard">${C.fmt(st.open)} 开门</span>`;
    if (st.state === "after") return `<span class="pill">已关门</span>`;
    return "";
  };

  // ---- 景点详情 ----
  U.detail = function (id, ctx = {}) {
    const p = C.get(id); if (!p) return;
    if (p.kind) return U.placeDetail(p);
    const date = ctx.date || (window.App && App.state.day) || C.D.days[0].date;
    const wd = C.wdOf(date);
    const hotel = C.fromHotel(p);
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], dz = ["一", "二", "三", "四", "五", "六", "日"];
    const week = days.map((k, i) => {
      const h = C.parseHours(p.hours && p.hours[k], p), today = C.WD[wd] === k;
      const txt = h.kind === "closed" ? "闭馆" : h.kind === "open" ? (h.ranges[0][1] - h.ranges[0][0] >= 1440 ? "全天" : C.fmt(h.ranges[0][0]) + "<br>" + C.fmt(h.ranges[0][1])) : "—";
      return `<div class="${h.kind === "closed" ? "x " : ""}${today ? "today" : ""}"><b>${dz[i]}</b><br>${txt}</div>`;
    }).join("");
    const t = p.ticket || {}, q = p.queue || {}, dm = p.duration_min || {};
    const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    const sec = (title, body, cls = "") => (body ? `<div class="dsec ${cls}"><h3>${title}</h3>${body}</div>` : "");
    const metro = (p.metro || []).map((m) => `<button class="row-item" data-big="${esc(m.name_ru)}" data-bigzh="${esc(m.name_zh || "")}"><div><div class="r">Ⓜ ${esc(m.name_ru)}</div><div class="z">${esc(m.name_zh || "")} · ${esc(m.line || "")}</div></div><div class="tag">步行 ${esc(m.walk_min || "?")}′</div></button>`).join("");
    const vocab = (p.vocab || []).map((v) => `<button class="vcard" data-big="${esc(v.ru)}" data-bigzh="${esc(v.zh)}"><div class="r">${esc(v.ru)}</div><div class="t">${esc(v.translit || "")}</div><div class="z">${esc(v.zh)}${v.where ? ` · <span class="small">${esc(v.where)}</span>` : ""}</div></button>`).join("");
    const food = p.food ? `<div class="facts-grid" style="padding-top:0">
        <div class="fact"><div class="k">人均</div><div class="v">$${(p.food.price_usd_pp || []).join("–")}</div></div>
        <div class="fact"><div class="k">菜系</div><div class="v">${esc(p.food.cuisine || "")}</div></div>
        <div class="fact wide"><div class="k">预订 / 排队</div><div class="v" style="font-weight:500">${esc(p.food.booking || "")}${p.food.queue_note ? "；" + esc(p.food.queue_note) : ""}</div></div></div>
        ${(p.food.must_order || []).length ? `<div class="dsec"><h3>必点 · Заказать</h3><div class="vocab">${p.food.must_order.map((m) => `<button class="vcard" data-big="${esc(m.ru)}" data-bigzh="${esc(m.zh)}"><div class="r">${esc(m.ru)}</div><div class="z">${esc(m.zh)}</div>${m.note ? `<div class="small">${esc(m.note)}</div>` : ""}</button>`).join("")}</div></div>` : ""}` : "";
    const img = p.img ? `<div class="hero"><div class="perf t"></div><img src="${p.img.src}" alt="" decoding="async"><div class="perf b"></div><div class="cap">📷 ${esc(p.img.author || "Wikimedia Commons")} · ${esc(p.img.license || "")} · via Wikipedia</div></div>` : `<div class="hero" style="height:140px">${U.thumb(p)}</div>`;
    const html = `${img}
      <div class="dhead"><div><h1>${esc(p.name_zh)}</h1><div class="ru" data-big="${esc(p.name_ru)}" data-bigzh="${esc(p.name_zh)}">${esc(p.name_ru)}</div><div class="tr">${esc(p.name_translit || "")} · ${esc(p.name_en || "")}</div></div>
        <div class="stamp"><div><b>${p.score}</b>${C.scoreWord(p.score)}</div></div></div>
      <div class="dsum">${esc(p.summary || "")}</div>
      <div class="facts-grid">
        <div class="fact"><div class="k">推荐时长</div><div class="v">${dm.quick ? `${dm.quick}′ 精华` : ""}<br><span style="font-weight:500">${dm.normal ? `正常 ${dm.normal}′ · 慢拍 ${dm.relaxed || "?"}′` : ""}</span></div></div>
        <div class="fact"><div class="k">费用</div><div class="v">${t.price_rub != null ? (t.price_rub ? "₽" + t.price_rub : "免费") : p.food ? "$" + (p.food.price_usd_pp || []).join("–") + "/人" : "—"}</div><div class="small">${esc(t.booking || "")}</div></div>
        <div class="fact"><div class="k">排队</div><div class="v">${{ low: "少", mid: "中等", high: "多" }[q.level] || "—"}</div><div class="small">${esc(q.note || "")}</div></div>
        <div class="fact"><div class="k">离酒店</div><div class="v">${hotel ? `${hotel.icon} ${esc(hotel.text)}` : p.region ? "郊外 · 包车" : "—"}</div><div class="small">${hotel ? esc(hotel.sub) : ""}</div></div>
        <div class="fact wide"><div class="k">开放时间 · ${esc(date.slice(5).replace("-", "/"))} ${C.WDZH[wd]} ${U.openBadge(p, date)}</div><div class="hours-week">${week}</div>${p.hours_note ? `<div class="small" style="margin-top:6px">${esc(p.hours_note)}</div>` : ""}</div>
        ${p.best_time ? `<div class="fact wide"><div class="k">最佳时段</div><div class="v" style="font-weight:500">${esc(p.best_time)}</div></div>` : ""}
      </div>
      ${food}
      ${sec("亮点 · Главное", list(p.highlights))}
      ${sec(p.food ? "招牌 · Фирменное" : "镇馆之宝 · Шедевры", list(p.treasures))}
      ${sec("拍照 · Фото", list(p.photo_tips))}
      ${sec("历史 · История", p.history ? `<p>${esc(p.history)}</p>` : "")}
      ${sec("冷知识 · Факты", list(p.fun_facts), "fun")}
      ${sec("注意 · Внимание", list(p.tips), "tips")}
      ${sec("俄语词汇 · Слова <span class='small' style='letter-spacing:0'>点一下放大给人看</span>", vocab ? `<div class="vocab">${vocab}</div>` : "")}
      ${sec("交通 · Как добраться", `<div class="rowlist">${metro}</div>${p.address_ru ? `<button class="row-item" style="margin-top:8px" data-big="${esc(p.address_ru)}" data-bigzh="${esc(p.name_zh)}"><div><div class="z">地址（给司机看）</div><div class="r" style="font-size:14px">${esc(p.address_ru)}</div></div><div class="tag">放大</div></button>` : ""}`)}
      ${p.score_reason ? sec("为什么是 " + p.score + " 分", `<p>${esc(p.score_reason)}</p>`) : ""}
      ${(p.sources || []).length ? `<div class="dsec"><h3>资料来源</h3><p class="small" style="word-break:break-all">${p.sources.slice(0, 6).map((s) => esc(s)).join("<br>")}</p></div>` : ""}
      <div class="dactions"><button class="btn" data-act="map">🗺 地图</button><button class="btn" data-act="custom">＋ 自选路线</button><button class="btn primary" data-act="day">＋ 加入某天</button></div>`;
    const sh = U.openSheet(html);
    sh.el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]"); if (!a) return;
      const act = a.getAttribute("data-act");
      if (act === "map") { sh.close(); App.showOnMap(id); }
      if (act === "custom") { App.addCustom(id); }
      if (act === "day") { App.chooseDayToAdd(id); }
    });
  };

  U.placeDetail = function (p) {
    const kv = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "");
    const metro = (p.metro || []).map((m) => `<button class="row-item" data-big="${esc(m.name_ru)}" data-bigzh="${esc(m.name_zh || "")}"><div><div class="r">Ⓜ ${esc(m.name_ru)}</div><div class="z">${esc(m.name_zh || "")} · ${esc(m.line || "")}</div></div><div class="tag">${m.walk_min ? "步行 " + m.walk_min + "′" : ""}</div></button>`).join("");
    const html = `<div class="dhead"><div><div class="small disp">${{ hotel: "HOTEL · 酒店", station: "ВОКЗАЛ · 车站", airport: "АЭРОПОРТ · 机场" }[p.kind]}</div><h1>${esc(p.name_zh)}</h1><div class="ru" data-big="${esc(p.name_ru)}" data-bigzh="${esc(p.name_zh)}">${esc(p.name_ru)}</div></div></div>
      ${p.address_ru ? `<div class="wrap"><button class="row-item" style="width:100%" data-big="${esc(p.address_ru)}" data-bigzh="${esc(p.address_zh || p.name_zh)}"><div><div class="z">地址（点一下放大给司机看）</div><div class="r" style="font-size:15px">${esc(p.address_ru)}</div>${p.address_zh ? `<div class="z">${esc(p.address_zh)}</div>` : ""}</div><div class="tag">放大</div></button></div>` : ""}
      <div class="dsec"><dl class="kv">${kv("电话", p.phone)}${kv("入住", p.checkin)}${kv("退房", p.checkout)}${kv("行李寄存", p.luggage)}</dl></div>
      ${p.notes ? `<div class="dsec"><h3>说明</h3><p>${esc(p.notes)}</p></div>` : ""}
      ${p.arrival_tips ? `<div class="dsec"><h3>9/29 抵达夜</h3><p style="white-space:pre-line">${esc(p.arrival_tips)}</p></div>` : ""}
      ${p.departure_tips ? `<div class="dsec"><h3>10/06 离境</h3><p style="white-space:pre-line">${esc(p.departure_tips)}</p></div>` : ""}
      ${p.aeroexpress ? `<div class="dsec"><h3>机场快线 Аэроэкспресс</h3><dl class="kv">${Object.entries(p.aeroexpress).map(([k, v]) => kv({ from: "起点", duration_min: "时长(分)", frequency: "班次", price_rub: "票价(₽)", first_last: "首末班", how_to_buy: "购票", notes: "备注" }[k] || k, typeof v === "object" ? JSON.stringify(v) : v)).join("")}</dl></div>` : ""}
      ${metro ? `<div class="dsec"><h3>附近地铁</h3><div class="rowlist">${metro}</div></div>` : ""}
      <div class="dactions"><button class="btn primary" data-act="map">🗺 在地图上看</button></div>`;
    const sh = U.openSheet(html);
    sh.el.addEventListener("click", (e) => { if (e.target.closest("[data-act=map]")) { sh.close(); App.showOnMap(p.id); } });
  };
})();
