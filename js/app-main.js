/* 主控：标签切换、全局动作 */
(function () {
  const C = window.Core, U = window.UI;
  const days = C.D.days.map((d) => d.date), today = C.todayStr();
  const App = (window.App = { state: { tab: "days", day: days.includes(today) ? today : (C.store.lastDay && days.includes(C.store.lastDay) ? C.store.lastDay : days[0]) } });
  const views = { days: "#view-days", map: "#view-map", places: "#view-places", book: "#view-book" };
  const rendered = {};

  App.go = function (tab) {
    App.state.tab = tab;
    Object.entries(views).forEach(([k, sel]) => U.$(sel).classList.toggle("active", k === tab));
    U.$$("#tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    const el = U.$(views[tab]);
    if (tab === "days") DaysView.render(el, App.state);
    if (tab === "places") { if (!rendered.places) PlacesView.setCity(dayObj().city); PlacesView.render(el, App.state); }
    if (tab === "book" && !rendered.book) BookView.render(el);
    if (tab === "map") MapUI.mount(el).then(() => MapUI.refresh());
    rendered[tab] = true;
  };
  const dayObj = () => C.D.days.find((d) => d.date === App.state.day);
  App.setDay = function (date, silent) {
    App.state.day = date; C.store.lastDay = date; C.save();
    if (!silent && App.state.tab === "days") DaysView.render(U.$("#view-days"), App.state);
    updateClock();
  };
  App.showOnMap = function (id) { App.go("map"); MapUI.show({ mode: "all", focus: id }); };
  App.showDayOnMap = function (date) { App.setDay(date, true); App.go("map"); MapUI.show({ mode: "day" }); };
  App.addCustom = function (id) { MapUI.addCustom(id); U.toast("已加入自选路线（地图页 → 自选）"); };
  App.addToDay = function (id, date) {
    const day = C.D.days.find((d) => d.date === date), p = C.get(id);
    if (p.city !== day.city) return U.toast(`${date.slice(5)} 在${day.city === "spb" ? "圣彼得堡" : "莫斯科"}，这个项目不在同一城市`);
    const st = C.dayPlan(day);
    if (st.find((s) => s.id === id)) return U.toast("这天已经有它了");
    let at = st.length; while (at > 0 && st[at - 1].label) at--; // 放在"取行李"等固定站之前
    st.splice(at, 0, { id, dur: "normal" });
    C.setDayPlan(day, st); U.toast(`已加入 ${date.slice(5).replace("-", "/")} 路线`);
    if (App.state.tab === "days") DaysView.render(U.$("#view-days"), App.state);
    MapUI.refresh();
  };
  App.chooseDayToAdd = function (id) {
    const p = C.get(id);
    const opts = C.D.days.filter((d) => d.city === p.city);
    const sh = U.openSheet(`<div class="section-title" style="margin-top:6px"><h2>加入哪一天？</h2></div><div class="plist" style="gap:8px">${opts.map((d) => {
      const st = C.hoursOn(p, d.date).kind === "closed";
      return `<button class="picker-item" data-d="${d.date}" style="grid-template-columns:1fr auto"><div><b>${d.date.slice(5).replace("-", "/")} ${C.WDZH[C.wdOf(d.date)]}</b> · ${C.esc(d.title)}<div class="d">${st ? "<b style='color:var(--red)'>这天闭馆</b>" : `已有 ${C.dayPlan(d).length} 站`}</div></div><span class="add">＋</span></button>`;
    }).join("")}</div>`);
    sh.el.addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (b) { App.addToDay(id, b.dataset.d); sh.close(); } });
  };
  App.openPicker = function (date) {
    const day = C.D.days.find((d) => d.date === date), st = C.dayPlan(day);
    const last = st.length ? C.get(st[st.length - 1].id) : C.get(day.start.place);
    PlacesView.picker(day.city, last, (id) => App.addToDay(id, date), `给 ${date.slice(5).replace("-", "/")} 加一站`, st.map((x) => x.id));
  };
  App.saveCustomAsDay = function (city, ids) {
    const opts = C.D.days.filter((d) => d.city === city);
    const sh = U.openSheet(`<div class="section-title" style="margin-top:6px"><h2>用自选路线替换哪一天？</h2></div><p class="small wrap">会替换当天的景点列表（车站/酒店等固定安排保留），随时可以"恢复推荐"。</p><div class="plist" style="gap:8px">${opts.map((d) => `<button class="picker-item" data-d="${d.date}" style="grid-template-columns:1fr auto"><div><b>${d.date.slice(5).replace("-", "/")} ${C.WDZH[C.wdOf(d.date)]}</b> · ${C.esc(d.title)}</div><span class="add">⤓</span></button>`).join("")}</div>`);
    sh.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-d]"); if (!b) return;
      const day = C.D.days.find((d) => d.date === b.dataset.d);
      const keep = C.dayPlan(day).filter((s) => s.label);
      C.setDayPlan(day, ids.map((id) => ({ id, dur: "normal" })).concat(keep));
      sh.close(); U.toast("已保存"); App.setDay(day.date, true); App.go("days");
    });
  };

  function updateClock() {
    const m = C.nowMin(), d = dayObj();
    U.$("#clock").innerHTML = `МСК ${C.fmt(m)}<br>${d.date.slice(5).replace("-", "/")} ${C.WDZH[C.wdOf(d.date)]}`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    U.$("#tabbar").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) App.go(b.dataset.tab); });
    updateClock(); setInterval(updateClock, 30000);
    App.go("days");
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
  });
})();
