/* 核心：数据索引、时间与营业解析、行程计算、交通描述、本地存储 */
(function () {
  const D = window.DATA;
  const C = (window.Core = {});
  C.D = D;
  C.POI = new Map(D.pois.map((p) => [p.id, p]));
  C.PLACE = new Map(D.places.map((p) => [p.id, p]));
  C.get = (id) => C.POI.get(id) || C.PLACE.get(id);
  C.WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  C.WDZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  C.WDRU = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
  C.MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  C.esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  C.hm = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
  C.fmt = (m) => { if (m == null || isNaN(m)) return "--:--"; const d = Math.floor(m / 1440); m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0") + (d > 0 ? "⁺¹" : ""); };
  C.dur = (n) => (n >= 60 ? Math.floor(n / 60) + " 小时" + (n % 60 ? " " + (n % 60) + " 分" : "") : n + " 分");
  C.dateObj = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  C.wdOf = (s) => C.dateObj(s).getDay();

  /* ---- 营业时间解析 ---- */
  function pickSeg(str, p) {
    const segs = String(str).split(/[；;]/).map((s) => s.trim()).filter(Boolean);
    if (segs.length > 1 && p && p.group === "博物馆") {
      const s = segs.find((x) => /馆|宫|博物馆|画廊|大教堂/.test(x) && /\d{1,2}:\d{2}/.test(x));
      if (s) return s;
    }
    return segs.find((x) => /\d{1,2}:\d{2}/.test(x)) || segs[0] || "";
  }
  C.parseHours = function (str, p) {
    if (str == null) return { kind: "unknown" };
    const s = String(str);
    if (/^\s*closed/i.test(s) || /^(闭馆|休息|不开放)/.test(s)) return { kind: "closed", raw: s };
    if (/全天|24\s*小时|00:00-24:00|24h/i.test(s) && !/\d{1,2}:\d{2}-\d{1,2}:\d{2}/.test(s.replace("00:00-24:00", ""))) return { kind: "open", ranges: [[0, 1440]], raw: s };
    if (/^白天/.test(s)) return { kind: "open", ranges: [[480, 1200]], raw: s, approx: true };
    const seg = pickSeg(s, p);
    const re = /(\d{1,2}):(\d{2})\s*[-–—~]\s*(\d{1,2}):(\d{2})/g; let m; const ranges = [];
    while ((m = re.exec(seg))) { let a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4]; if (b <= a) b += 1440; ranges.push([a, b]); }
    if (!ranges.length) return { kind: "unknown", raw: s };
    return { kind: "open", ranges, raw: s, approx: /约|待核实/.test(s) };
  };
  C.hoursOn = function (p, dateStr) {
    if (!p || !p.hours) return { kind: "unknown" };
    return C.parseHours(p.hours[C.WD[C.wdOf(dateStr)]], p);
  };
  // 返回 {state:'open'|'before'|'after'|'closedDay'|'unknown', open, close}
  C.statusAt = function (p, dateStr, minute) {
    const h = C.hoursOn(p, dateStr);
    if (h.kind === "closed") return { state: "closedDay", raw: h.raw };
    if (h.kind !== "open") return { state: "unknown", raw: h.raw };
    const r = h.ranges.find((x) => minute < x[1]) || h.ranges[h.ranges.length - 1];
    if (minute < r[0]) return { state: "before", open: r[0], close: r[1], raw: h.raw };
    if (minute >= r[1]) return { state: "after", open: r[0], close: r[1], raw: h.raw };
    return { state: "open", open: r[0], close: r[1], raw: h.raw };
  };

  const DEF_DUR = { 景点: [30, 60, 100], 建筑: [20, 40, 70], 公园: [45, 90, 150], 博物馆: [75, 120, 180], 体验: [45, 90, 120], 美食: [40, 60, 80] };
  C.stayMin = function (p, key) {
    if (!p) return 20;
    if (p.kind) return key === "quick" ? 15 : 25;
    const d = p.duration_min || {}, f = DEF_DUR[p.group] || [30, 60, 90];
    return d[key] || { quick: f[0], normal: f[1], relaxed: f[2] }[key] || f[1];
  };

  /* ---- 交通 ---- */
  const cache = new Map();
  C.route = function (city, a, b, opts = {}) {
    const k = [city, a.id || a.lat + "," + a.lon, b.id || b.lat + "," + b.lon, opts.luggage ? 1 : 0, opts.late ? 1 : 0].join("|");
    if (!cache.has(k)) cache.set(k, window.Transit.route(city, a, b, opts));
    return cache.get(k);
  };
  C.stName = function (city, idx) {
    const s = window.TRANSIT[city].stations[idx];
    const zh = D.stationZh[s[0]];
    return { ru: s[0], zh: zh || "", tr: s[4], lat: s[1], lon: s[2] };
  };
  C.line = (city, li) => window.TRANSIT[city].lines[li];
  // 选中方式后的摘要
  C.legSummary = function (city, r, mode) {
    mode = mode || r.best;
    if (mode === "walk") return { mode, icon: "🚶", text: `步行 ${r.walk.min}′`, sub: `${r.walk.km} km`, min: r.walk.min };
    if (mode === "taxi") return { mode, icon: "🚕", text: `打车约 ${r.taxi.min}′`, sub: `₽${r.taxi.rub[0]}–${r.taxi.rub[1]}`, min: r.taxi.min };
    if (mode === "metro" && r.metro) {
      const rides = r.metro.legs.filter((l) => !l.transfer), ln = C.line(city, rides[0].line);
      return { mode, icon: "Ⓜ", text: `地铁 ${r.metro.min}′`, sub: rides.map((l) => C.line(city, l.line).num + "号线").join(" → ") + (r.metro.transfers ? ` · 换乘 ${r.metro.transfers} 次` : ""), color: ln.color, lnum: ln.num, min: r.metro.min };
    }
    if (mode === "aeroexpress") return { mode, icon: "🚆", text: `机场快线 约 ${r.aeroexpress.min}′`, sub: "经白俄罗斯站", min: r.aeroexpress.min, color: "#2e6a6c" };
    if (mode === "car") return { mode, icon: "🚐", text: `包车 约 ${r.car.min}′`, sub: r.car.note, min: r.car.min, color: "#6b3d5c" };
    return { mode: "walk", icon: "🚶", text: "步行", sub: "", min: r.min };
  };
  // 详细步骤（离线兜底）
  C.legSteps = function (city, r, mode) {
    mode = mode || r.best; const out = [];
    if (mode === "metro" && r.metro) {
      const m = r.metro, a = C.stName(city, m.from);
      out.push({ ic: "🚶", t: `步行 ${m.walkIn} 分钟到地铁站 <b class="ru">${C.esc(a.ru)}</b>${a.zh ? " · " + C.esc(a.zh) : ""} <span class="small">${C.esc(a.tr)}</span>` });
      m.legs.forEach((l) => {
        if (l.transfer) { const t = C.stName(city, l.to); out.push({ ic: "⇄", t: `换乘：跟着指示牌 <b class="ru">Переход</b>（换乘）走到 <b class="ru">${C.esc(t.ru)}</b>${t.zh ? " · " + C.esc(t.zh) : ""}` }); return; }
        const ln = C.line(city, l.line), to = C.stName(city, l.to);
        out.push({ ic: `<span class="lnum" style="background:${ln.color}">${ln.num}</span>`, t: `乘 <b>${ln.num} 号线</b> <span class="ru">${C.esc(ln.ru)}</span>（${C.esc(ln.zh)}）<b class="ru">${C.esc(l.dir)}</b>，坐 ${l.stops} 站到 <b class="ru">${C.esc(to.ru)}</b>${to.zh ? " · " + C.esc(to.zh) : ""}` });
      });
      out.push({ ic: "🚶", t: `出站（找 <b class="ru">Выход в город</b>）步行 ${m.walkOut} 分钟` });
    } else if (mode === "taxi") out.push({ ic: "🚕", t: `Yandex Go 打车约 ${r.taxi.min} 分钟（含等车），约 ${r.taxi.km} km，参考价 ₽${r.taxi.rub[0]}–${r.taxi.rub[1]}，备现金` });
    else if (mode === "walk") out.push({ ic: "🚶", t: `步行约 ${r.walk.min} 分钟（${r.walk.km} km，按慢步速估算）` });
    else if (mode === "aeroexpress") { out.push(...C.legSteps(city, r.aeroexpress.cityLeg, r.aeroexpress.cityLeg.best)); out.push({ ic: "🚆", t: "白俄罗斯站 <b class='ru'>Белорусский вокзал</b> 坐机场快线 <b class='ru'>Аэроэкспресс</b> 到谢列梅捷沃，约 40 分钟，约半小时一班" }); }
    else if (mode === "car") out.push({ ic: "🚐", t: r.car.note });
    return out;
  };

  /* ---- 本地存储 ---- */
  const KEY = "plenka:v1";
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { store = {}; }
  C.store = store;
  C.save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  C.dayPlan = function (day) {
    const s = store.plans && store.plans[day.date];
    return (s || day.stops).map((x) => Object.assign({}, x)).filter((x) => C.get(x.id));
  };
  C.setDayPlan = function (day, stops) { store.plans = store.plans || {}; store.plans[day.date] = stops; C.save(); };
  C.resetDayPlan = function (day) { if (store.plans) delete store.plans[day.date]; C.save(); };
  C.isEdited = (day) => !!(store.plans && store.plans[day.date]);
  C.modePref = function (day, i) { return store.modes && store.modes[day.date + ":" + i]; };
  C.setModePref = function (day, i, m) { store.modes = store.modes || {}; store.modes[day.date + ":" + i] = m; C.save(); };

  /* ---- 行程计算 ---- */
  C.compute = function (day) {
    const city = day.city, stops = C.dayPlan(day);
    const startP = C.get(day.start.place);
    let t = C.hm(day.start.time), prev = startP;
    const rows = [], warns = [];
    const opts = (i) => ({ luggage: !!day.luggage && i === 0, late: false });
    stops.forEach((s, i) => {
      const p = C.get(s.id);
      if (!p) return;
      const r = C.route(city, prev, p, { luggage: day.luggage && i === 0 });
      const mode = C.modePref(day, i) && (r[C.modePref(day, i)] || C.modePref(day, i) === "walk") ? C.modePref(day, i) : r.best;
      const sum = C.legSummary(city, r, mode);
      let arrive = t + sum.min, wait = 0;
      const st = p.kind ? { state: "unknown" } : C.statusAt(p, day.date, arrive % 1440);
      const w = [];
      if (st.state === "closedDay") w.push({ lvl: "bad", t: `${C.WDZH[C.wdOf(day.date)]}闭馆` });
      if (st.state === "before" && st.open - (arrive % 1440) <= 180) { wait = st.open - (arrive % 1440); w.push({ lvl: "info", t: `等开门 ${wait} 分（${C.fmt(st.open)} 开）` }); }
      if (st.state === "after") w.push({ lvl: "bad", t: `到达时已关门（${C.fmt(st.close)} 关）` });
      const stay = s.min || C.stayMin(p, s.dur || "normal");
      const start = arrive + wait, end = start + stay;
      if (st.state === "open" && end % 1440 > st.close && st.close < 1440 && end < st.close + 1440) w.push({ lvl: "warn", t: `${C.fmt(st.close)} 关门，停留会被压缩` });
      rows.push({ s, p, i, r, mode, sum, arrive, start, end, stay, warns: w });
      w.forEach((x) => x.lvl !== "info" && warns.push({ lvl: x.lvl, t: `${p.name_zh.split("（")[0]}：${x.t}` }));
      t = end; prev = p;
    });
    let endInfo = null;
    const target = day.deadline || day.end;
    if (target) {
      const tp = C.get(target.place);
      if (tp && tp.id !== (prev && prev.id)) {
        const r = C.route(city, prev, tp, { luggage: !!(day.deadline || day.luggage) });
        const mode = C.modePref(day, "end") && r[C.modePref(day, "end")] ? C.modePref(day, "end") : r.best;
        const sum = C.legSummary(city, r, mode);
        endInfo = { p: tp, r, mode, sum, arrive: t + sum.min };
      } else endInfo = { p: tp, arrive: t, same: true };
      if (day.deadline) {
        const dl = C.hm(day.deadline.time), slack = dl - endInfo.arrive;
        endInfo.deadline = dl; endInfo.slack = slack;
        if (slack < 0) warns.unshift({ lvl: "bad", t: `赶不上：${day.deadline.label}，预计晚到 ${-slack} 分钟，删掉或缩短一两站` });
        else if (slack > 150) warns.push({ lvl: "info", t: `距离「${day.deadline.label}」还有 ${C.dur(slack)} 富余，可以加一站` });
      }
    }
    return { day, city, rows, endInfo, warns, startP, startT: C.hm(day.start.time) };
  };

  /* ---- 智能排序（固定：美食、带 label 的站；其余在空位里重排使总交通最短） ---- */
  C.optimize = function (day) {
    const stops = C.dayPlan(day), city = day.city;
    const fixed = stops.map((s) => { const p = C.get(s.id); return !!(s.label || (p && p.group === "美食") || (p && p.kind)); });
    const movIdx = stops.map((_, i) => i).filter((i) => !fixed[i]);
    if (movIdx.length < 3) return false;
    const pts = stops.map((s) => C.get(s.id)), start = C.get(day.start.place), endP = C.get((day.deadline || day.end || {}).place);
    const cost = (a, b) => (a && b && a !== b ? C.route(city, a, b).min : 0);
    const total = (order) => { let c = 0, prev = start; order.forEach((j) => { c += cost(prev, pts[j]); prev = pts[j]; }); if (endP) c += cost(prev, endP); return c; };
    let best = stops.map((_, i) => i), bestC = total(best);
    const mov = movIdx.slice();
    const place = (perm) => { const o = stops.map((_, i) => i); movIdx.forEach((slot, k) => (o[slot] = perm[k])); return o; };
    if (mov.length <= 7) {
      const permute = (arr, l) => { if (l === arr.length) { const o = place(arr), c = total(o); if (c < bestC) { bestC = c; best = o; } return; } for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; permute(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; } };
      permute(mov, 0);
    } else {
      let perm = mov.slice(), improved = true;
      while (improved) { improved = false; for (let i = 0; i < perm.length - 1; i++) for (let j = i + 1; j < perm.length; j++) { const p2 = perm.slice(); p2.splice(i, j - i + 1, ...perm.slice(i, j + 1).reverse()); const o = place(p2), c = total(o); if (c < bestC) { bestC = c; best = o; perm = p2; improved = true; } } }
    }
    C.setDayPlan(day, best.map((i) => stops[i]));
    return true;
  };

  /* ---- 其它 ---- */
  C.sunFor = (date, city) => (D.sun || []).find((s) => s.date === date && (city === "spb" ? /spb|peter|петер/i.test(s.city) : /mos|msk/i.test(s.city)));
  C.hotelOf = (city) => C.get(city === "spb" ? "hotel-spb" : "hotel-msk");
  C.fromHotel = function (p) {
    if (!p || p.kind) return null;
    const h = C.hotelOf(p.city); if (!h) return null;
    const r = C.route(p.city, h, p);
    return C.legSummary(p.city, r);
  };
  C.stars = (n) => "★".repeat(n || 0) + "<i>" + "★".repeat(5 - (n || 0)) + "</i>";
  C.scoreWord = (n) => ({ 5: "必去", 4: "强推", 3: "值得", 2: "有空", 1: "备选" }[n] || "");
  C.todayStr = () => { const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 180) * 60000); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }; // 莫斯科时间
  C.nowMin = () => { const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 180) * 60000); return d.getHours() * 60 + d.getMinutes(); };
})();
