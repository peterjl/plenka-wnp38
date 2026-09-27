/* 地图模块：MapLibre + 本地 PMTiles（整文件读入内存，无需 Range 请求，离线稳定） */
(function () {
  const M = {};
  let map = null, readyP = null, is3D = false, meMarker = null, watchId = null;
  const markers = new Map();      // id -> {marker, el, item}
  let overlayMarkers = [];         // leg tags + key markers
  let handlers = { onSelect: () => {}, onBackground: () => {} };

  const RETRO = {
    background: "#e6dcc4", earth: "#efe6d2", park_a: "#dbe0bf", park_b: "#c9d2a4", hospital: "#ecdcd2", industrial: "#e3dcc9", school: "#ece2cf",
    wood_a: "#d6dcb6", wood_b: "#c2cc9a", pedestrian: "#e9e0cb", scrub_a: "#d9dcbd", scrub_b: "#c7cea3", glacier: "#f2ede2", sand: "#ebe0c4", beach: "#ede2c3",
    aerodrome: "#e3dccb", runway: "#d6cdb8", water: "#a9c4c6", zoo: "#d6dcc0", military: "#e2d8c4",
    tunnel_other_casing: "#e0d6c2", tunnel_minor_casing: "#e0d6c2", tunnel_link_casing: "#e0d6c2", tunnel_major_casing: "#e0d6c2", tunnel_highway_casing: "#e0d6c2",
    tunnel_other: "#ece4d3", tunnel_minor: "#ece4d3", tunnel_link: "#ece4d3", tunnel_major: "#ece4d3", tunnel_highway: "#ece4d3",
    pier: "#e3d9c4", buildings: "#e2d4b8",
    minor_service_casing: "#dccfb6", minor_casing: "#dccfb6", link_casing: "#d7c8aa", major_casing_late: "#d2c19f", highway_casing_late: "#caa972",
    other: "#f4eee1", minor_service: "#f6f0e3", minor_a: "#f8f3e7", minor_b: "#fbf7ee", link: "#fbf6ea", major_casing_early: "#d2c19f", major: "#fcf7ec",
    highway_casing_early: "#caa972", highway: "#f1d7a0", railway: "#a0927c", boundaries: "#b9a98c",
    bridges_other_casing: "#d7c9ae", bridges_minor_casing: "#d7c9ae", bridges_link_casing: "#d7c9ae", bridges_major_casing: "#cdbb98", bridges_highway_casing: "#c4a26a",
    bridges_other: "#f6f0e3", bridges_minor: "#fbf7ee", bridges_link: "#fbf6ea", bridges_major: "#fcf7ec", bridges_highway: "#f1d7a0",
    roads_label_minor: "#7d6e5c", roads_label_minor_halo: "#f4ecdb", roads_label_major: "#5e5041", roads_label_major_halo: "#f4ecdb",
    ocean_label: "#5f7f82", subplace_label: "#7a6a58", subplace_label_halo: "#f1e9d8", city_label: "#3a2f26", city_label_halo: "#f1e9d8",
    state_label: "#9a8a75", state_label_halo: "#f1e9d8", country_label: "#8a7a66", address_label: "#8a7a66", address_label_halo: "#f1e9d8",
  };
  const CITY_VIEW = { msk: { center: [37.617, 55.754], zoom: 12.6 }, spb: { center: [30.33, 59.935], zoom: 13 } };

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  const abs = (p) => new URL(p, location.href).href;

  // ---- PMTiles from in-memory buffers ----
  class BufSource {
    constructor(key, buf) { this.key = key; this.buf = buf; }
    getKey() { return this.key; }
    async getBytes(offset, length) { return { data: this.buf.slice(offset, offset + length) }; }
  }
  const archives = {};
  function archive(key) {
    if (!archives[key]) archives[key] = fetch(abs(`data/geo/${key}.pmtiles`)).then((r) => r.arrayBuffer()).then((b) => new pmtiles.PMTiles(new BufSource(key, b)));
    return archives[key];
  }
  const tileLon = (z, x) => ((x + 0.5) / Math.pow(2, z)) * 360 - 180;

  function buildStyle() {
    const B = window.basemaps, fl = Object.assign({}, B.namedFlavor("light"), RETRO);
    const drop = new Set(["pois", "roads_shields", "roads_oneway", "address_label"]);
    const mk = (tier) => B.layers(tier, fl, { lang: "ru" }).filter((l) => !drop.has(l.id)).map((l) => {
      const o = JSON.parse(JSON.stringify(l)); o.id = tier + "_" + l.id;
      if (tier === "base") o.maxzoom = Math.min(o.maxzoom == null ? 24 : o.maxzoom, 12);
      else { o.minzoom = Math.max(o.minzoom == null ? 0 : o.minzoom, 12); if (l.id === "background") return null; }
      return o;
    }).filter(Boolean);
    const layers = [...mk("base"), ...mk("det")];
    // 3D buildings (hidden by default)
    layers.push({ id: "bld3d", type: "fill-extrusion", source: "det", "source-layer": "buildings", minzoom: 14, layout: { visibility: "none" },
      paint: { "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "height"], 12], 0, "#e6d8bd", 40, "#dac6a2", 120, "#c9ae84"],
               "fill-extrusion-height": ["coalesce", ["get", "height"], 12], "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0], "fill-extrusion-opacity": 0.88 } });
    return {
      version: 8, glyphs: abs("vendor/glyphs/") + "{fontstack}/{range}.pbf",
      sources: {
        base: { type: "vector", tiles: ["trip://base/{z}/{x}/{y}"], minzoom: 0, maxzoom: 11, attribution: "© OpenStreetMap contributors · Protomaps" },
        det: { type: "vector", tiles: ["trip://det/{z}/{x}/{y}"], minzoom: 12, maxzoom: 14 },
      },
      layers,
    };
  }

  function metroGeo() {
    const feats = [], sts = [];
    ["msk", "spb"].forEach((city) => {
      const d = window.TRANSIT[city];
      d.lines.forEach((ln) => {
        const coords = ln.st.map((i) => [d.stations[i][2], d.stations[i][1]]);
        if (ln.loop) coords.push(coords[0]);
        feats.push({ type: "Feature", properties: { color: ln.color, num: ln.num }, geometry: { type: "LineString", coordinates: coords } });
      });
      d.stations.forEach((s) => sts.push({ type: "Feature", properties: { name: s[0], color: d.lines[s[3]].color }, geometry: { type: "Point", coordinates: [s[2], s[1]] } }));
    });
    return { lines: { type: "FeatureCollection", features: feats }, stations: { type: "FeatureCollection", features: sts } };
  }

  function addOverlays() {
    const g = metroGeo();
    map.addSource("metro", { type: "geojson", data: g.lines });
    map.addSource("metro-st", { type: "geojson", data: g.stations });
    map.addLayer({ id: "metro-casing", type: "line", source: "metro", paint: { "line-color": "#fbf6ec", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 6], "line-opacity": 0.7 } });
    map.addLayer({ id: "metro-line", type: "line", source: "metro", paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 3], "line-opacity": 0.55 } });
    map.addLayer({ id: "metro-st", type: "circle", source: "metro-st", minzoom: 11.5, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11.5, 2, 15, 5], "circle-color": "#fbf6ec", "circle-stroke-color": ["get", "color"], "circle-stroke-width": 2 } });
    map.addLayer({ id: "metro-st-lbl", type: "symbol", source: "metro-st", minzoom: 13.3,
      layout: { "text-field": ["concat", "М · ", ["get", "name"]], "text-font": ["Noto Sans Medium"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true },
      paint: { "text-color": "#3a2f26", "text-halo-color": "#f4ecdb", "text-halo-width": 1.4 } });
    map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fbf6ec", "line-width": ["match", ["get", "mode"], "metro", 8, 6], "line-opacity": 0.9 } });
    map.addLayer({ id: "route-walk", type: "line", source: "route", filter: ["==", ["get", "mode"], "walk"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#221c18", "line-width": 3.2, "line-dasharray": [0.1, 1.6] } });
    map.addLayer({ id: "route-metro", type: "line", source: "route", filter: ["==", ["get", "mode"], "metro"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5 } });
    map.addLayer({ id: "route-taxi", type: "line", source: "route", filter: ["in", ["get", "mode"], ["literal", ["taxi", "car", "air"]]], layout: { "line-cap": "round" }, paint: { "line-color": ["match", ["get", "mode"], "car", "#6b3d5c", "air", "#2e6a6c", "#c7322a"], "line-width": 3.5, "line-dasharray": [2, 1.4] } });
  }

  M.init = function (container, h) {
    handlers = Object.assign(handlers, h || {});
    if (readyP) return readyP;
    readyP = (async () => {
      await loadScript("vendor/maplibre-gl.js"); await loadScript("vendor/pmtiles.js"); await loadScript("vendor/basemaps.js");
      maplibregl.addProtocol("trip", async (params) => {
        const m = params.url.match(/trip:\/\/(base|det)\/(\d+)\/(\d+)\/(\d+)/);
        const z = +m[2], x = +m[3], y = +m[4];
        const city = tileLon(z, x) > 34 ? "msk" : "spb";
        try { const a = await archive(`${city}_${m[1]}`); const t = await a.getZxy(z, x, y); return { data: t ? new Uint8Array(t.data) : new Uint8Array() }; }
        catch (e) { return { data: new Uint8Array() }; }
      });
      map = new maplibregl.Map({
        container, style: buildStyle(), center: CITY_VIEW.msk.center, zoom: CITY_VIEW.msk.zoom, minZoom: 8, maxZoom: 18.5,
        attributionControl: { compact: true }, localIdeographFontFamily: "'PingFang SC','Hiragino Sans GB',sans-serif",
        dragRotate: true, pitchWithRotate: true, fadeDuration: 150,
      });
      map.touchZoomRotate.enableRotation();
      await new Promise((res) => map.on("load", res));
      addOverlays();
      map.on("zoom", updateLabelVisibility);
      map.on("click", (e) => { if (!e.originalEvent.__mk) handlers.onBackground(); });
      return map;
    })();
    return readyP;
  };

  function updateLabelVisibility() {
    const z = map.getZoom();
    markers.forEach(({ el, item }) => {
      const s = item.score || 3;
      el.classList.toggle("hide-lbl", !(z >= 14 || (z >= 12.8 && s >= 5) || el.classList.contains("inroute")));
    });
  }

  // ---- POI markers ----
  M.setMarkers = function (items) {
    // items: [{id, lat, lon, label, score, food, num, dim}]
    const keep = new Set(items.map((i) => i.id));
    markers.forEach((v, id) => { if (!keep.has(id)) { v.marker.remove(); markers.delete(id); } });
    items.forEach((it) => {
      let v = markers.get(it.id);
      if (!v) {
        const outer = document.createElement("div");
        outer.innerHTML = '<div class="mk"><div class="pin"><span></span></div><div class="lbl"></div></div>';
        const el = outer.firstChild;
        outer.addEventListener("click", (e) => { e.stopPropagation(); handlers.onSelect(it.id); });
        const marker = new maplibregl.Marker({ element: outer, anchor: "bottom" }).setLngLat([it.lon, it.lat]).addTo(map);
        v = { marker, el, outer, item: it }; markers.set(it.id, v);
      }
      v.item = it;
      v.marker.setLngLat([it.lon, it.lat]);
      v.el.className = "mk " + (it.food ? "food " : "") + "s" + (it.score || 3) + (it.dim ? " dim" : "") + (it.inroute ? " inroute" : "") + (it.sel ? " sel" : "");
      v.el.querySelector("span").textContent = it.num != null ? it.num : it.food ? "食" : it.score >= 5 ? "★" : "·";
      v.el.querySelector(".lbl").textContent = it.label;
      v.outer.style.zIndex = it.inroute ? 5 : it.score >= 5 ? 3 : 1;
    });
    if (map) updateLabelVisibility();
  };
  M.select = function (id) {
    markers.forEach((v, k) => v.el.classList.toggle("sel", k === id));
  };

  // ---- route + key places ----
  M.showRoute = function (route) {
    // route: {legs:[{mode, color, coords:[[lon,lat],...], tag, tagAt:[lon,lat], tagColor}], keys:[{lat,lon,tag,hotel}], fit:bool}
    overlayMarkers.forEach((m) => m.remove()); overlayMarkers = [];
    const feats = (route.legs || []).filter((l) => l.coords && l.coords.length > 1)
      .map((l) => ({ type: "Feature", properties: { mode: l.mode, color: l.color || "#221c18" }, geometry: { type: "LineString", coordinates: l.coords } }));
    map.getSource("route").setData({ type: "FeatureCollection", features: feats });
    (route.legs || []).forEach((l) => {
      if (!l.tag || !l.tagAt) return;
      const el = document.createElement("div");
      el.className = "mk-legtag" + (l.mode === "metro" ? " metro" : "");
      if (l.mode === "metro") el.style.background = l.color;
      el.textContent = l.tag;
      overlayMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(l.tagAt).addTo(map));
    });
    (route.keys || []).forEach((k) => {
      const el = document.createElement("div");
      el.className = "mk-key" + (k.hotel ? " mk-hotel" : "");
      el.innerHTML = '<div class="ring"></div><div class="ring r2"></div><div class="core"></div>' + (k.tag ? `<div class="tag">${k.tag}</div>` : "");
      overlayMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([k.lon, k.lat]).addTo(map));
    });
    if (route.fit) {
      const pts = []; feats.forEach((f) => pts.push(...f.geometry.coordinates)); (route.keys || []).forEach((k) => pts.push([k.lon, k.lat]));
      (route.extra || []).forEach((p) => pts.push(p));
      M.fit(pts);
    }
  };
  M.fit = function (pts, maxZoom = 15.5) {
    if (!pts.length) return;
    const b = new maplibregl.LngLatBounds(pts[0], pts[0]); pts.forEach((p) => b.extend(p));
    map.fitBounds(b, { padding: { top: 150, bottom: 250, left: 40, right: 60 }, maxZoom, duration: 700 });
  };
  M.flyCity = function (city) { const v = CITY_VIEW[city]; map.flyTo({ center: v.center, zoom: v.zoom, pitch: is3D ? 55 : 0, bearing: 0, duration: 900 }); };
  M.focus = function (lat, lon, zoom = 15.2) { map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), zoom), duration: 700, offset: [0, -90] }); };
  M.toggle3D = function () {
    is3D = !is3D;
    map.setLayoutProperty("bld3d", "visibility", is3D ? "visible" : "none");
    ["det_buildings"].forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", is3D ? "none" : "visible"));
    map.easeTo({ pitch: is3D ? 58 : 0, bearing: is3D ? -17 : 0, zoom: is3D ? Math.max(map.getZoom(), 15) : map.getZoom(), duration: 800 });
    return is3D;
  };
  M.locate = function (onFix) {
    if (!navigator.geolocation) return onFix && onFix(null, "设备不支持定位");
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    watchId = navigator.geolocation.watchPosition((pos) => {
      const ll = [pos.coords.longitude, pos.coords.latitude];
      if (!meMarker) { const el = document.createElement("div"); el.className = "mk-me"; meMarker = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map); map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 15) }); }
      else meMarker.setLngLat(ll);
      onFix && onFix(pos);
    }, (err) => onFix && onFix(null, err.message), { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  };
  M.resize = function () { map && map.resize(); };
  M.get = () => map;
  window.MapView = M;
})();
