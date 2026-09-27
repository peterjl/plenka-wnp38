/* 行程视图：胶片日期条 + 当日时间线（可编辑、可智能排序） */
(function () {
  const C = window.Core, U = window.UI, esc = C.esc;
  const V = (window.DaysView = {});
  let editing = false;

  const KIND = { flight: ["FLIGHT · 航班", "flight", "✈"], train: ["ПОЕЗД · 火车", "train", "🚂"], tour: ["TOUR · 包车", "tour", "🚐"], hotel: ["HOTEL · 酒店", "hotel", "🛏"], bridge: ["МОСТ · 开桥", "tour", "🌉"] };

  function frames(cur) {
    const today = C.todayStr();
    return C.D.days.map((d) => {
      const dt = C.dateObj(d.date);
      return `<button class="frame${d.date === cur ? " on" : ""}" data-day="${d.date}">
        ${d.date === today ? '<span class="dot"></span>' : ""}
        <div><div class="m">${C.MON[dt.getMonth()]} · ${C.WDRU[dt.getDay()]}</div><div class="d">${dt.getDate()}</div></div>
        <div class="w">${C.WDZH[dt.getDay()]}</div>
        <div class="c">${d.city === "spb" ? "СПБ" : "МСК"}</div></button>`;
    }).join("");
  }

  function legHTML(city, r, mode, key, day) {
    if (!r) return "";
    const s = C.legSummary(city, r, mode);
    const opts = [];
    if (r.walk && mode !== "walk") opts.push(["walk", `🚶${r.walk.min}′`]);
    if (r.metro && mode !== "metro") opts.push(["metro", `Ⓜ${r.metro.min}′`]);
    if (r.taxi && mode !== "taxi" && !r.special) opts.push(["taxi", `🚕${r.taxi.min}′`]);
    const steps = C.legSteps(city, r, mode).map((x) => `<div class="row"><div>${x.ic}</div><div>${x.t}</div></div>`).join("");
    return `<div class="leg">
      <span class="mode ${s.mode}">${s.lnum ? `<span class="lnum" style="background:${s.color}">${s.lnum}</span>` : s.icon} ${esc(s.text)}</span>
      <span class="alt">${esc(s.sub || "")}</span>
      ${opts.map(([m, t]) => `<button class="pill" data-mode="${m}" data-key="${key}">${t}</button>`).join("")}
      <details><summary>怎么走 ›</summary><div class="legsteps">${steps}</div></details></div>`;
  }

  function stopHTML(row, idx, date) {
    const p = row.p, s = row.s;
    const isFood = p.group === "美食", isHotel = p.kind === "hotel" || p.kind === "station";
    const warn = row.warns.filter((w) => w.lvl !== "info");
    const durLbl = { quick: "精华", normal: "正常", relaxed: "慢拍" }[s.dur || "normal"];
    return `<div class="tl-node${isFood ? " food" : ""}${isHotel ? " hotel" : ""}${warn.length ? " warn" : ""} fade-up">
      <div class="bullet">${isHotel ? "⌂" : idx + 1}</div>
      <div class="card stop" data-open="${p.id}">
        ${p.kind ? `<div class="thumb ph">${p.kind === "hotel" ? "⌂" : "🚉"}</div>` : U.thumb(p, "thumb")}
        <div style="min-width:0">
          <div class="time">${C.fmt(row.start)}–${C.fmt(row.end)}${row.start > row.arrive ? ` <span class="small">(${C.fmt(row.arrive)} 到)</span>` : ""}</div>
          <div class="name">${esc(s.label ? s.label + " · " : "")}${esc(p.name_zh.split("（")[0])}</div>
          <div class="runame">${esc(p.name_ru)}</div>
          <div class="meta">${p.score ? `<span class="pill stars">${C.stars(p.score)}</span>` : ""}<span class="pill">${durLbl} ${row.stay}′</span>${p.food ? `<span class="pill mustard">$${(p.food.price_usd_pp || []).join("–")}</span>` : p.ticket && p.ticket.price_rub ? `<span class="pill">₽${p.ticket.price_rub}</span>` : ""}</div>
          ${row.warns.map((w) => `<div class="warnline" style="${w.lvl === "info" ? "color:var(--teal)" : ""}">${w.lvl === "info" ? "ⓘ" : "⚠︎"} ${esc(w.t)}</div>`).join("")}
        </div>
        ${editing ? `<div class="edit"><button data-ed="up" data-i="${idx}">▲</button><button data-ed="dur" data-i="${idx}">⏱</button><button data-ed="down" data-i="${idx}">▼</button><button data-ed="del" data-i="${idx}">✕</button></div>` : ""}
      </div></div>`;
  }

  V.render = function (root, state) {
    const day = C.D.days.find((d) => d.date === state.day) || C.D.days[0];
    const res = C.compute(day);
    const dt = C.dateObj(day.date), wd = dt.getDay();
    const sun = C.sunFor(day.date, day.city);
    const hotel = C.hotelOf(day.city);
    const ev = (day.events || []).slice().sort((a, b) => (C.hm(a.time) < 300 ? C.hm(a.time) + 1440 : C.hm(a.time)) - (C.hm(b.time) < 300 ? C.hm(b.time) + 1440 : C.hm(b.time)));
    const tickets = ev.map((e) => {
      const k = KIND[e.kind] || KIND.tour;
      return `<div class="ticket ${k[1]}" data-open="${e.place}"><div class="main"><div class="kind">${k[0]}</div><div class="t">${esc(e.title)}</div><div class="s">${esc(e.sub || "")}</div></div>
        <div class="stub"><div class="big">${esc(e.time)}</div><div class="lbl">${k[2]} ${day.date.slice(5).replace("-", "/")}</div></div></div>`;
    }).join("");
    // 同城今日闭馆的高分项目
    const closedToday = C.D.pois.filter((p) => p.city === day.city && p.score >= 4 && C.hoursOn(p, day.date).kind === "closed").map((p) => p.name_zh.split("（")[0]);
    const alerts = [];
    if (day.note) alerts.push(`<div class="alert gold"><span class="ic">✦</span><div>${esc(day.note)}</div></div>`);
    res.warns.forEach((w) => alerts.push(`<div class="alert ${w.lvl === "info" ? "info" : ""}"><span class="ic">${w.lvl === "info" ? "ⓘ" : "⚠︎"}</span><div>${esc(w.t)}</div></div>`));
    if (closedToday.length) alerts.push(`<div class="alert info"><span class="ic">🔒</span><div>今天${C.WDZH[wd]}闭馆：${esc(closedToday.join("、"))}</div></div>`);

    // timeline
    let tl = `<div class="tl-node anchor"><div class="bullet">▶</div><div class="card stop" data-open="${res.startP.id}"><div class="thumb ph">${res.startP.kind === "airport" ? "✈" : res.startP.kind === "station" ? "🚉" : "⌂"}</div>
      <div><div class="time">${C.fmt(res.startT)} 出发</div><div class="name">${esc(day.start.label || res.startP.name_zh)}</div><div class="runame">${esc(res.startP.name_ru)}</div></div><div></div></div></div>`;
    res.rows.forEach((row, i) => {
      tl += legHTML(day.city, row.r, row.mode, i, day);
      tl += stopHTML(row, i, day.date);
      if (row.stay >= 100 && !(res.rows[i + 1] && res.rows[i + 1].p.group === "美食") && row.p.group !== "美食") tl += `<div class="rest-hint">☕ 站了很久，下一站前找个咖啡馆坐 20 分钟吧</div>`;
    });
    if (res.endInfo && !res.endInfo.same) {
      tl += legHTML(day.city, res.endInfo.r, res.endInfo.mode, "end", day);
    }
    if (res.endInfo) {
      const dl = day.deadline;
      tl += `<div class="tl-node anchor"><div class="bullet">■</div><div class="card stop" data-open="${res.endInfo.p.id}"><div class="thumb ph">${res.endInfo.p.kind === "airport" ? "✈" : res.endInfo.p.kind === "station" ? "🚉" : "⌂"}</div>
        <div><div class="time">${C.fmt(res.endInfo.arrive)} 到${dl ? ` · 最晚 ${dl.time}` : ""}</div><div class="name">${esc(dl ? dl.label : res.endInfo.p.name_zh)}</div><div class="runame">${esc(res.endInfo.p.name_ru)}</div>
        ${dl ? `<div class="warnline" style="color:${res.endInfo.slack < 0 ? "var(--red-d)" : "var(--teal)"}">${res.endInfo.slack < 0 ? "⚠︎ 晚了 " + -res.endInfo.slack + " 分钟" : "✓ 富余 " + C.dur(res.endInfo.slack)}</div>` : ""}</div><div></div></div></div>`;
    }
    if (day.after) {
      const p = C.get(day.after.id);
      if (p) tl += `<div class="tl-node anchor"><div class="bullet">★</div><div class="card stop" data-open="${p.id}">${U.thumb(p, "thumb")}<div><div class="time">${day.after.time}–${day.after.end}</div><div class="name">${esc(p.name_zh.split("（")[0])}</div><div class="runame">${esc(p.name_ru)}</div><div class="meta"><span class="pill dark">已预订包车</span></div></div><div></div></div></div>`;
    }

    // 备选：同城未排入任何一天的高分项目
    const used = new Set(); C.D.days.forEach((d) => C.dayPlan(d).forEach((s) => used.add(s.id)));
    const pool = C.D.pois.filter((p) => p.city === day.city && !used.has(p.id) && !p.region).sort((a, b) => b.score - a.score).slice(0, 8);
    const sugg = pool.map((p) => `<button class="picker-item" data-open="${p.id}">${p.img ? `<img loading="lazy" src="${p.img.thumb}" alt="">` : `<div class="ph0"></div>`}
      <div style="min-width:0"><div style="font-weight:700">${esc(p.name_zh.split("（")[0])}</div><div class="d">${C.stars(p.score)} · ${esc(p.group)} ${C.hoursOn(p, day.date).kind === "closed" ? "· <b style='color:var(--red)'>今日闭馆</b>" : ""}</div></div>
      <span class="add" data-add="${p.id}">＋</span></button>`).join("");

    root.innerHTML = `
      <div class="filmstrip" id="film">${frames(day.date)}</div>
      <div class="card day-hero fade-up">
        <div class="kicker">${esc(day.kicker || "")}</div>
        <h1>${esc(day.title)}</h1>
        <div class="sub">${dt.getMonth() + 1}月${dt.getDate()}日 · ${C.WDZH[wd]} · ${day.city === "spb" ? "圣彼得堡 САНКТ-ПЕТЕРБУРГ" : "莫斯科 МОСКВА"}</div>
        <div class="facts">
          ${sun ? `<span class="pill">☀ ${esc(sun.sunrise)} – ${esc(sun.sunset)}</span><span class="pill mustard">✦ 黄金时刻 ${esc((sun.golden_hour_pm || "").replace("约 ", ""))}</span>` : ""}
          ${hotel ? `<button class="pill teal" data-open="${hotel.id}">🛏 ${esc(hotel.name_zh)}</button>` : ""}
          ${C.isEdited(day) ? `<span class="pill red">已自定义</span>` : ""}
        </div>
      </div>
      ${tickets ? `<div class="tickets">${tickets}</div>` : ""}
      <div class="alerts">${alerts.join("")}</div>
      <div class="section-title"><h2>路线 · Маршрут</h2><span>${res.rows.length} 站</span></div>
      <div class="plan-tools">
        <button class="btn primary" data-tool="map">🗺 地图看路线</button>
        <button class="btn ${editing ? "red" : ""}" data-tool="edit">${editing ? "✓ 完成" : "✎ 编辑"}</button>
        <button class="btn" data-tool="add">＋ 加一站</button>
        <button class="btn" data-tool="opt">⚡ 智能排序</button>
        ${C.isEdited(day) ? `<button class="btn ghost" data-tool="reset">↺ 恢复推荐</button>` : ""}
      </div>
      <div class="timeline">${tl}</div>
      ${pool.length ? `<div class="section-title"><h2>备选 · Ещё</h2><span>还没排进任何一天</span></div><div class="plist" style="gap:8px">${sugg}</div>` : ""}
      <div style="height:20px"></div>`;

    const film = U.$("#film", root), on = U.$(".frame.on", film);
    if (on) film.scrollLeft = on.offsetLeft - film.clientWidth / 2 + on.clientWidth / 2;

    root.onclick = (e) => {
      const f = e.target.closest("[data-day]"); if (f) { App.setDay(f.getAttribute("data-day")); return; }
      const add = e.target.closest("[data-add]"); if (add) { e.stopPropagation(); App.addToDay(add.getAttribute("data-add"), day.date); return; }
      const md = e.target.closest("[data-mode]"); if (md) { C.setModePref(day, md.getAttribute("data-key"), md.getAttribute("data-mode")); V.render(root, state); return; }
      const ed = e.target.closest("[data-ed]"); if (ed) { e.stopPropagation(); edit(day, ed.getAttribute("data-ed"), +ed.getAttribute("data-i")); V.render(root, state); return; }
      const tool = e.target.closest("[data-tool]");
      if (tool) {
        const t = tool.getAttribute("data-tool");
        if (t === "map") App.showDayOnMap(day.date);
        if (t === "edit") { editing = !editing; V.render(root, state); }
        if (t === "add") App.openPicker(day.date);
        if (t === "opt") { const ok = C.optimize(day); U.toast(ok ? "已按交通时间重新排序（餐厅和取行李位置不动）" : "可重排的站太少"); V.render(root, state); }
        if (t === "reset") { C.resetDayPlan(day); V.render(root, state); U.toast("已恢复推荐路线"); }
        return;
      }
      const o = e.target.closest("[data-open]"); if (o && !e.target.closest("details")) U.detail(o.getAttribute("data-open"), { date: day.date });
    };
  };

  function edit(day, act, i) {
    const st = C.dayPlan(day);
    if (act === "up" && i > 0) [st[i - 1], st[i]] = [st[i], st[i - 1]];
    if (act === "down" && i < st.length - 1) [st[i + 1], st[i]] = [st[i], st[i + 1]];
    if (act === "del") st.splice(i, 1);
    if (act === "dur") { const order = ["quick", "normal", "relaxed"]; st[i].dur = order[(order.indexOf(st[i].dur || "normal") + 1) % 3]; delete st[i].min; }
    C.setDayPlan(day, st);
  }
  V.stopEditing = () => (editing = false);
})();
