/* 离线交通引擎：任意两点之间的 步行 / 地铁 / 打车 方案（数据来自 js/transit-data.js）
   时间模型按"体力一般、慢慢走"的两人设定；全部为估算，给出行兜底用。 */
(function () {
  const T = window.TRANSIT;
  const CFG = {
    msk: { wait: 2.5, entry: 3, transfer: 4, mccWait: 5, taxiWait: 6, taxiV: 22, taxiVfar: 32, rub: [120, 22, 9] },
    spb: { wait: 3, entry: 4, transfer: 4, mccWait: 5, taxiWait: 6, taxiV: 22, taxiVfar: 32, rub: [110, 20, 8] },
  };
  const WALK_KMH = 4.2, DETOUR = 1.3;

  function hav(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  const walkMin = (km) => (km * DETOUR) / WALK_KMH * 60;

  // ---- graph (lazy per city) ----
  const graphs = {};
  function graph(city) {
    if (graphs[city]) return graphs[city];
    const d = T[city], c = CFG[city];
    const adj = d.stations.map(() => []);
    d.lines.forEach((ln, li) => {
      const st = ln.st, v = ln.mcc ? 38 : 45;
      const link = (a, b) => {
        const km = hav([d.stations[a][1], d.stations[a][2]], [d.stations[b][1], d.stations[b][2]]);
        const t = 0.6 + (km / v) * 60;
        adj[a].push({ to: b, t, line: li }); adj[b].push({ to: a, t, line: li });
      };
      for (let i = 0; i + 1 < st.length; i++) link(st[i], st[i + 1]);
      if (ln.loop) link(st[st.length - 1], st[0]);
    });
    d.transfers.forEach(([a, b, m]) => {
      const t = c.transfer + m / 70;
      adj[a].push({ to: b, t, line: -1 }); adj[b].push({ to: a, t, line: -1 });
    });
    return (graphs[city] = { adj, d });
  }

  function nearStations(city, p, maxKm, k) {
    const d = T[city];
    return d.stations
      .map((s, i) => ({ i, km: hav(p, [s[1], s[2]]) }))
      .filter((x) => x.km <= maxKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, k);
  }

  // tiny binary heap
  function Heap() { this.a = []; }
  Heap.prototype.push = function (n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
  Heap.prototype.pop = function () { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; };

  function metro(city, A, B) {
    const { adj, d } = graph(city), c = CFG[city];
    const src = nearStations(city, A, 1.8, 6), dst = nearStations(city, B, 1.8, 6);
    if (!src.length || !dst.length) return null;
    const N = d.stations.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), prevLine = new Int32Array(N).fill(-2), onLine = new Int32Array(N).fill(-2);
    const h = new Heap();
    src.forEach((s) => {
      const ln = d.lines[d.stations[s.i][3]];
      const cost = walkMin(s.km) + c.entry / 2 + (ln.mcc ? c.mccWait : c.wait);
      if (cost < dist[s.i]) { dist[s.i] = cost; h.push([cost, s.i]); onLine[s.i] = d.stations[s.i][3]; }
    });
    const dstSet = new Map(dst.map((x) => [x.i, x.km]));
    while (h.a.length) {
      const [du, u] = h.pop();
      if (du > dist[u]) continue;
      for (const e of adj[u]) {
        let t = e.t;
        // boarding a line different from the one we're riding = changing trains (only via transfer edges)
        const nd = du + t;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; prevLine[e.to] = e.line; onLine[e.to] = e.line === -1 ? d.stations[e.to][3] : e.line; h.push([nd, e.to]); }
      }
    }
    let best = null;
    dstSet.forEach((km, i) => {
      const tot = dist[i] + walkMin(km) + c.entry / 2;
      if (!best || tot < best.tot) best = { i, tot, km };
    });
    if (!best || !isFinite(best.tot)) return null;
    // reconstruct
    const path = []; let v = best.i;
    while (v !== -1) { path.push({ s: v, via: prevLine[v] }); v = prev[v]; }
    path.reverse();
    const first = path[0].s;
    const srcKm = src.find((x) => x.i === first).km;
    const legs = []; let cur = null;
    for (let k = 1; k < path.length; k++) {
      const { s, via } = path[k], from = path[k - 1].s;
      if (via === -1) { cur = null; legs.push({ transfer: true, from, to: s }); continue; }
      if (!cur || cur.line !== via) { cur = { line: via, from, to: s, stops: 1, seq: [from, s] }; legs.push(cur); }
      else { cur.to = s; cur.stops++; cur.seq.push(s); }
    }
    const rides = legs.filter((l) => !l.transfer);
    if (!rides.length) return null; // walking between two stations only
    rides.forEach((l) => {
      const ln = d.lines[l.line], st = ln.st, ia = st.indexOf(l.from), ib = st.indexOf(l.to);
      if (ln.loop) {
        const n = st.length, fwd = (ib - ia + n) % n <= n / 2;
        const next = st[(ia + (fwd ? 1 : -1) + n) % n];
        l.dir = '往 ' + d.stations[next][0] + ' 方向';
      } else {
        l.dir = '往 ' + d.stations[ib > ia ? st[st.length - 1] : st[0]][0] + ' 方向（终点）';
      }
    });
    return {
      min: Math.round(best.tot), walkIn: Math.round(walkMin(srcKm)), walkOut: Math.round(walkMin(best.km)),
      from: first, to: best.i, legs, transfers: rides.length - 1,
    };
  }

  function taxi(city, km) {
    const c = CFG[city], rk = Math.max(1, km * 1.35), v = rk > 8 ? c.taxiVfar : c.taxiV;
    const min = c.taxiWait + (rk / v) * 60, ride = (rk / v) * 60;
    const p = c.rub[0] + c.rub[1] * rk + c.rub[2] * ride;
    return { min: Math.round(min), km: +rk.toFixed(1), rub: [Math.round((p * 0.85) / 10) * 10, Math.round((p * 1.35) / 10) * 10] };
  }

  /* 主入口：a/b 可以是 {lat,lon,id?}。opts: {luggage, late} */
  function route(city, a, b, opts = {}) {
    const A = [a.lat, a.lon], B = [b.lat, b.lon];
    const km = hav(A, B);
    const special = specialRoute(city, a, b, km, opts);
    if (special) return special;
    const w = { min: Math.round(walkMin(km)), km: +(km * DETOUR).toFixed(2) };
    const m = km > 0.6 ? metro(city, A, B) : null;
    const tx = taxi(city, km);
    let best = 'walk';
    if (w.min > 18) best = m ? 'metro' : 'taxi';
    if (m && w.min <= m.min + 4 && w.min <= 30) best = 'walk';
    if (best === 'metro' && tx.min + 12 < m.min) best = 'taxi';
    if (opts.luggage && w.min > 12) best = 'taxi';
    if (opts.late && best === 'metro') best = 'taxi';
    return { km: +km.toFixed(2), walk: w, metro: m, taxi: tx, best, min: best === 'walk' ? w.min : best === 'metro' ? m.min : tx.min };
  }

  // 机场、郊外包车等特殊节点
  const BELORUSSKY = { lat: 55.7766, lon: 37.5820 };
  function specialRoute(city, a, b, km, opts) {
    const isAir = (p) => p.id === 'svo';
    if (isAir(a) || isAir(b)) {
      const cityPt = isAir(a) ? b : a;
      const toBel = route(city, isAir(a) ? BELORUSSKY : cityPt, isAir(a) ? cityPt : BELORUSSKY, opts);
      const ae = 40 + 12; // 机场快线 ~40 分钟 + 平均候车
      const tx = taxi(city, km); tx.min = Math.max(tx.min, 55); tx.rub = [2200, 3800];
      return {
        km: +km.toFixed(1), special: 'airport', best: opts.luggage ? 'taxi' : 'aeroexpress',
        aeroexpress: { min: toBel.min + ae, cityLeg: toBel, note: '白俄罗斯站 ⇄ 谢列梅捷沃，约 40 分钟，约每 30 分钟一班' },
        taxi: tx, walk: null, metro: null, min: opts.luggage ? tx.min : toBel.min + ae,
      };
    }
    if (a.id === 'msk-armed-forces-cathedral' || b.id === 'msk-armed-forces-cathedral') {
      return { km: +km.toFixed(1), special: 'tour', best: 'car', car: { min: 75, note: '已预订包车（约 60 km，单程约 1–1.5 小时）' }, walk: null, metro: null, taxi: taxi(city, km), min: 75 };
    }
    return null;
  }

  window.Transit = { route, hav, graph, walkMin, T };
})();
