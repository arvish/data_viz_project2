/* global L, d3 */
(function () {
  const CINCY_CENTER = [39.1031, -84.5120];

  const els = {
    yearLabel: document.getElementById("yearLabel"),
    statusLine: document.getElementById("statusLine"),
    statusSub: document.getElementById("statusSub"),
    mappedCount: document.getElementById("mappedCount"),
    missingCount: document.getElementById("missingCount"),
    colorBy: document.getElementById("colorBy"),
    mapLayer: document.getElementById("mapLayer"),
    heatControls: document.getElementById("heatControls"),
    heatRadius: document.getElementById("heatRadius"),
    basemap: document.getElementById("basemap"),
    resetView: document.getElementById("resetView"),
    clearFilters: document.getElementById("clearFilters"),
    toggleBrush: document.getElementById("toggleBrush"),
    serviceTypesBtn: document.getElementById("serviceTypesBtn"),

    legendTitle: document.getElementById("legendTitle"),
    legendBody: document.getElementById("legendBody"),
    activeFilters: document.getElementById("activeFilters"),

    mapBrushOverlay: document.getElementById("mapBrushOverlay"),

    timeline: document.getElementById("timeline"),
    chartService: document.getElementById("chartService"),
    chartNeighborhood: document.getElementById("chartNeighborhood"),
    chartMethod: document.getElementById("chartMethod"),
    chartDept: document.getElementById("chartDept"),
    chartPriority: document.getElementById("chartPriority"),
    attrPrev: document.getElementById("attrPrev"),
    attrNext: document.getElementById("attrNext"),
    attrSlideLabel: document.getElementById("attrSlideLabel"),

    // Modal
    serviceModal: document.getElementById("serviceModal"),
    closeServiceModal: document.getElementById("closeServiceModal"),
    typeSearch: document.getElementById("typeSearch"),
    typeList: document.getElementById("typeList"),
    typesAll: document.getElementById("typesAll"),
    typesNone: document.getElementById("typesNone"),
    typesResetColors: document.getElementById("typesResetColors")
  };

  const tooltip = d3.select("#tooltip");

  const parseISO = d3.timeParse("%Y-%m-%dT%H:%M:%S");
  const parseISODate = d3.timeParse("%Y-%m-%d");

  const state = {
    meta: null,
    rows: [],
    mapRows: [],

    // UI modes
    colorMode: "service",
    mapLayerMode: "heat", // heat | points | both
    heatRadius: 24,
    basemap: "dark",

    // Service type controls (Level 6)
    typeOrder: [],
    typeCounts: new Map(),
    activeTypes: new Set(),
    typeColors: new Map(),

    // Linked interaction state
    hoverWeek: null,
    timeRange: null, // [Date, Date] inclusive
    selectedNeighborhood: null,
    selectedMethod: null,
    selectedDept: null,
    selectedPriority: null,
    mapSelection: null, // Set of sr_number strings, or null

    // map brush
    brushMode: false,

    attrSlide: 0,
    attrSlideLabels: ["Service types", "Neighborhoods + Method", "Department + Priority"],

    // computed
    scales: {
      delay: null,
      neighborhood: null,
      priority: null,
      dept: null
    }
  };

  const POINT_RENDER_LIMIT = 12000;
  let pointRenderFrame = null;

  function getPointRadius() {
    const z = map.getZoom();
    if (z <= 11) return 2.7;
    if (z === 12) return 3.3;
    if (z === 13) return 4.0;
    return 4.9;
  }

  function schedulePointRender() {
    if (pointRenderFrame) cancelAnimationFrame(pointRenderFrame);
    pointRenderFrame = requestAnimationFrame(() => {
      pointRenderFrame = null;
      renderMapPoints();
    });
  }

  function applyBasemapTheme() {
    const mapEl = document.getElementById("map");
    if (!mapEl) return;
    mapEl.dataset.basemap = state.basemap;
  }

  // -----------------------------
  // Leaflet map + base layers
  // -----------------------------
  const baseLayers = {
    dark: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 20, attribution: '&copy; OpenStreetMap &copy; CARTO' }
    ),
    light: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 20, attribution: '&copy; OpenStreetMap &copy; CARTO' }
    ),
    aerial: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, attribution: "Tiles &copy; Esri" }
    )
  };

  const map = L.map("map", {
    zoomControl: true
  }).setView(CINCY_CENTER, 12);

  // Zoom limits: user does not need the whole world
  map.setMinZoom(10);
  map.setMaxZoom(18);

  baseLayers[state.basemap].addTo(map);
  applyBasemapTheme();

  // Leaflet SVG overlay for D3 points
  L.svg().addTo(map);
  const overlaySvg = d3.select(map.getPanes().overlayPane).select("svg");
  const gPoints = overlaySvg.append("g").attr("class", "leaflet-zoom-hide");

  // Leaflet heat layer (Level 7)
  let heatLayer = null;

  function ensureHeatLayer() {
    if (heatLayer) return;
    heatLayer = L.heatLayer([], {
      radius: state.heatRadius,
      blur: Math.round(state.heatRadius * 0.85),
      maxZoom: 17,
      minOpacity: 0.18
    });
    heatLayer.addTo(map);
  }

  function removeHeatLayer() {
    if (!heatLayer) return;
    map.removeLayer(heatLayer);
    heatLayer = null;
  }

  function renderHeatmap() {
    const { filteredMapRows } = getFilteredSets();
    const wantHeat = (state.mapLayerMode === "heat" || state.mapLayerMode === "both");
    if (!wantHeat) {
      removeHeatLayer();
      return;
    }
    ensureHeatLayer();

    if (heatLayer.setOptions) {
      heatLayer.setOptions({ radius: state.heatRadius, blur: Math.round(state.heatRadius * 0.85) });
    }

    const pts = filteredMapRows.map(d => [d.lat, d.lon, 1]);
    heatLayer.setLatLngs(pts);
  }

  function syncHeatControls() {
    const show = (state.mapLayerMode === "heat" || state.mapLayerMode === "both");
    if (els.heatControls) els.heatControls.classList.toggle("hidden", !show);
  }


  // -----------------------------
  // Helpers
  // -----------------------------
  function setStatus(line, sub = "") {
    els.statusLine.textContent = line;
    els.statusSub.textContent = sub;
  }

  function showTooltip(evt, html) {
    tooltip.classed("hidden", false).html(html);
    moveTooltip(evt);
  }
  function moveTooltip(evt) {
    tooltip.style("left", `${evt.clientX + 14}px`).style("top", `${evt.clientY + 14}px`);
  }
  function hideTooltip() {
    tooltip.classed("hidden", true);
  }

  function fmtDate(d) {
    if (!d) return "—";
    return d3.timeFormat("%Y-%m-%d")(d);
  }

  function truncateLabel(text, maxChars) {
    const s = String(text ?? "");
    if (s.length <= maxChars) return s;
    return `${s.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
  }

  // -----------------------------
  // Data parsing
  // -----------------------------
  function rowParser(d) {
    const lat = +d.LATITUDE;
    const lon = +d.LONGITUDE;

    return {
      sr_number: d.SR_NUMBER,
      sr_type: d.SR_TYPE,
      sr_type_desc: d.SR_TYPE_DESC,
      priority: d.PRIORITY,
      dept_name: d.DEPT_NAME,
      method_received: d.METHOD_RECEIVED,
      neighborhood: d.NEIGHBORHOOD,
      address: d.ADDRESS,
      location: d.LOCATION,
      time_received: d.TIME_RECEIVED,

      date_created: parseISO(d.DATE_CREATED),
      date_last_update: parseISO(d.DATE_LAST_UPDATE),
      date_closed: parseISO(d.DATE_CLOSED),

      planned_completion_days: d.PLANNED_COMPLETION_DAYS ? +d.PLANNED_COMPLETION_DAYS : null,
      update_delay_days: d.update_delay_days ? +d.update_delay_days : null,

      week_start: d.week_start,
      week_date: parseISODate(d.week_start),
      month: d.month,

      lat,
      lon,
      has_coords: Number.isFinite(lat) && Number.isFinite(lon)
    };
  }

  // -----------------------------
  // Scales and legends
  // -----------------------------
  function buildScales() {
    const delays = state.rows
      .map(d => d.update_delay_days)
      .filter(v => Number.isFinite(v))
      .sort(d3.ascending);

    const q98 = d3.quantileSorted(delays, 0.98) || 14;
    const q02 = d3.quantileSorted(delays, 0.02) || 0;

    state.scales.delay = d3.scaleSequential(d3.interpolateCividis)
      .domain([q02, Math.max(1, q98)])
      .clamp(true);

    // Neighborhood: top 12 + Other
    const nCounts = d3.rollups(
      state.rows.filter(d => d.neighborhood),
      v => v.length,
      d => d.neighborhood
    ).sort((a,b) => d3.descending(a[1], b[1]));

    const top = nCounts.slice(0, 12).map(d => d[0]);
    state.rows.forEach(d => {
      d.neighborhood_top = top.includes(d.neighborhood) ? d.neighborhood : "Other";
    });

    const palette = [...d3.schemeTableau10, ...d3.schemeSet3];
    const nDomain = [...top, "Other"];
    state.scales.neighborhood = d3.scaleOrdinal()
      .domain(nDomain)
      .range(nDomain.map((_, i) => i < nDomain.length - 1 ? palette[i % palette.length] : "rgba(232,245,255,0.22)"));

    // Priority (ordinal-ish)
    const order = ["STANDARD", "PRIORITY", "HAZARDOUS", "EMERGENCY"];
    const pDomain = order.filter(x => state.rows.some(d => d.priority === x));
    state.scales.priority = d3.scaleOrdinal()
      .domain(pDomain)
      .range(["rgba(232,245,255,0.35)", "rgba(96,165,250,0.90)", "rgba(251,191,36,0.90)", "rgba(251,113,133,0.92)"].slice(0, pDomain.length));

    // Department (nominal)
    const depts = Array.from(new Set(state.rows.map(d => d.dept_name).filter(Boolean))).sort(d3.ascending);
    const dRange = d3.quantize(t => d3.interpolateCool(0.15 + 0.75 * t), Math.max(3, depts.length));
    state.scales.dept = d3.scaleOrdinal().domain(depts).range(dRange);
  }

  function updateLegend() {
    if (state.colorMode === "service") return setLegendServiceTypes();
    if (state.colorMode === "delay") return setLegendDelay();
    if (state.colorMode === "neighborhood") return setLegendCategorical("Neighborhood (top)", state.scales.neighborhood);
    if (state.colorMode === "priority") return setLegendCategorical("Priority", state.scales.priority);
    if (state.colorMode === "dept") return setLegendCategorical("Public agency (department)", state.scales.dept, 10);
  }

  function getTypeColor(type) {
    return state.typeColors.get(type) || "rgba(232,245,255,0.28)";
  }

  function setLegendServiceTypes() {
    els.legendTitle.textContent = "Service type";

    const active = state.typeOrder.filter(t => state.activeTypes.has(t));
    const shown = active.slice(0, 10);
    const extra = active.length - shown.length;

    const rows = shown.map(t => `
      <div class="legendRow">
        <div class="legendSwatch" style="background:${getTypeColor(t)}"></div>
        <div class="legendKey">${t}</div>
      </div>
    `).join("");

    els.legendBody.innerHTML = `
      <div class="legendList">${rows}</div>
      ${extra > 0 ? `<div style="margin-top:6px; color:rgba(232,245,255,0.62); font-size:0.80rem;">+${extra} more active</div>` : ""}
      <div style="margin-top:6px; color:rgba(232,245,255,0.62); font-size:0.80rem;">
        Categorical colors for nominal groups. Use Service types to toggle or customize.
      </div>
    `;
  }

  function setLegendDelay() {
    els.legendTitle.textContent = "Time to last update (days)";
    const s = state.scales.delay;
    const dom = s.domain();
    const minV = dom[0];
    const maxV = dom[1];
    const grad = `linear-gradient(90deg, ${d3.interpolateCividis(0)}, ${d3.interpolateCividis(1)})`;

    els.legendBody.innerHTML = `
      <div class="legendGradient" style="background:${grad};"></div>
      <div class="legendMinMax">
        <div>${minV.toFixed(1)}</div>
        <div>${maxV.toFixed(1)}</div>
      </div>
      <div style="margin-top:6px; color:rgba(232,245,255,0.62); font-size:0.80rem;">
        Sequential scale for a quantitative measure.
      </div>
    `;
  }

  function setLegendCategorical(title, scale, maxRows = 8) {
    els.legendTitle.textContent = title;
    const dom = scale.domain();
    const shown = dom.slice(0, maxRows);
    const extra = dom.length - shown.length;

    const rows = shown.map(k => `
      <div class="legendRow">
        <div class="legendSwatch" style="background:${scale(k)}"></div>
        <div class="legendKey">${k}</div>
      </div>
    `).join("");

    els.legendBody.innerHTML = `
      <div class="legendList">${rows}</div>
      ${extra > 0 ? `<div style="margin-top:6px; color:rgba(232,245,255,0.62); font-size:0.80rem;">+${extra} more</div>` : ""}
      <div style="margin-top:6px; color:rgba(232,245,255,0.62); font-size:0.80rem;">
        Categorical colors for nominal groups.
      </div>
    `;
  }

  
  // -----------------------------
  // Service types UI (Level 6)
  // -----------------------------
  const LS_COLORS = "p2_type_colors_v1";
  const LS_ACTIVE = "p2_active_types_v1";

  function persistTypeState() {
    try {
      const colorsObj = {};
      for (const t of state.typeOrder) colorsObj[t] = getTypeColor(t);
      localStorage.setItem(LS_COLORS, JSON.stringify(colorsObj));
      localStorage.setItem(LS_ACTIVE, JSON.stringify([...state.activeTypes]));
    } catch (e) {
      // ignore storage errors
    }
  }

  function loadTypeStateFromStorage() {
    try {
      const colors = JSON.parse(localStorage.getItem(LS_COLORS) || "null");
      if (colors) {
        for (const t of state.typeOrder) {
          if (colors[t]) state.typeColors.set(t, colors[t]);
        }
      }
      const act = JSON.parse(localStorage.getItem(LS_ACTIVE) || "null");
      if (Array.isArray(act)) {
        state.activeTypes = new Set(act.filter(t => state.typeOrder.includes(t)));
      }
    } catch (e) {
      // ignore
    }
  }

  function initTypesFromData() {
    const counts = d3.rollups(state.rows, v => v.length, d => d.sr_type_desc)
      .sort((a,b) => d3.descending(a[1], b[1]));
    state.typeOrder = counts.map(d => d[0]);
    state.typeCounts = new Map(counts);

    // default colors
    const palette = [...d3.schemeTableau10, ...d3.schemeSet3, ...d3.schemePaired];
    state.typeColors.clear();
    state.typeOrder.forEach((t, i) => state.typeColors.set(t, palette[i % palette.length]));

    // default to all active
    state.activeTypes = new Set(state.typeOrder);

    // apply saved overrides
    loadTypeStateFromStorage();
  }

  function resetTypeColors() {
    const palette = [...d3.schemeTableau10, ...d3.schemeSet3, ...d3.schemePaired];
    state.typeColors.clear();
    state.typeOrder.forEach((t, i) => state.typeColors.set(t, palette[i % palette.length]));
    persistTypeState();
    updateLegend();
    updateAll();
    renderTypeModalList();
  }

  function toggleType(type) {
    if (state.activeTypes.has(type)) state.activeTypes.delete(type);
    else state.activeTypes.add(type);
    persistTypeState();
    updateLegend();
    updateAll();
  }

  function openServiceModal() {
    els.serviceModal.classList.remove("hidden");
    els.serviceModal.setAttribute("aria-hidden", "false");
    renderTypeModalList();
    if (els.typeSearch) els.typeSearch.focus();
  }

  function closeServiceModal() {
    els.serviceModal.classList.add("hidden");
    els.serviceModal.setAttribute("aria-hidden", "true");
  }

  function renderTypeModalList() {
    if (!els.typeList) return;
    const q = (els.typeSearch?.value || "").trim().toLowerCase();
    const types = state.typeOrder.filter(t => !q || t.toLowerCase().includes(q));

    const rows = types.map(t => {
      const count = state.typeCounts.get(t) || 0;
      const checked = state.activeTypes.has(t) ? "checked" : "";
      const color = getTypeColor(t);
      return `
        <div class="typeRow" data-type="${t}">
          <div class="typeLeft">
            <input class="typeCheck" type="checkbox" ${checked} />
            <div>
              <div class="typeName" title="${t}">${t}</div>
              <div class="typeCount">${count.toLocaleString()} calls</div>
            </div>
          </div>
          <div class="typeRight">
            <input class="colorPick" type="color" value="${color}" />
          </div>
        </div>
      `;
    }).join("");

    els.typeList.innerHTML = rows || `<div style="padding:14px; color:rgba(232,245,255,0.62);">No matches</div>`;
  }


// -----------------------------
  // Filtering
  // -----------------------------
  function filterBaseRows() {
    let rows = state.rows;

    // Service type toggles (Level 6)
    if (state.activeTypes && state.activeTypes.size) {
      rows = rows.filter(d => state.activeTypes.has(d.sr_type_desc));
    } else {
      rows = [];
    }

    if (state.selectedNeighborhood) rows = rows.filter(d => d.neighborhood_top === state.selectedNeighborhood);
    if (state.selectedMethod) rows = rows.filter(d => d.method_received === state.selectedMethod);
    if (state.selectedDept) rows = rows.filter(d => d.dept_name === state.selectedDept);
    if (state.selectedPriority) rows = rows.filter(d => d.priority === state.selectedPriority);

    if (state.mapSelection && state.mapSelection.size) {
      rows = rows.filter(d => state.mapSelection.has(d.sr_number));
    }

    return rows;
  }

  function filterWithTime(rows) {
    if (!state.timeRange) return rows;
    const [a, b] = state.timeRange;
    const aT = +a;
    const bT = +b;
    return rows.filter(d => d.date_created && (+d.date_created >= aT) && (+d.date_created <= bT));
  }

  function getFilteredSets() {
    const baseRows = filterBaseRows();
    const filteredRows = filterWithTime(baseRows);
    const filteredMapRows = filteredRows.filter(d => d.has_coords);

    return { baseRows, filteredRows, filteredMapRows };
  }

  function updateActiveFiltersLabel() {
    const chips = [];
    if (state.timeRange) chips.push(`Time: ${fmtDate(state.timeRange[0])} → ${fmtDate(state.timeRange[1])}`);
    if (state.selectedNeighborhood) chips.push(`Neighborhood: ${state.selectedNeighborhood}`);
    if (state.selectedMethod) chips.push(`Method: ${state.selectedMethod}`);
    if (state.selectedDept) chips.push(`Dept: ${state.selectedDept}`);
    if (state.selectedPriority) chips.push(`Priority: ${state.selectedPriority}`);
    if (state.mapSelection && state.mapSelection.size) chips.push(`Map selection: ${state.mapSelection.size}`);

    const totalTypes = state.typeOrder ? state.typeOrder.length : 0;
    const activeTypes = state.activeTypes ? state.activeTypes.size : 0;
    if (totalTypes && activeTypes !== totalTypes) {
      if (activeTypes === 0) chips.push('Service types: none');
      else chips.push(`Service types: ${activeTypes}/${totalTypes}`);
    }

    els.activeFilters.textContent = chips.length ? chips.join(" • ") : "No active filters";
  }

  // -----------------------------
  // Map points
  // -----------------------------
  function colorForPoint(d) {
    if (state.colorMode === "service") return getTypeColor(d.sr_type_desc);
    if (state.colorMode === "neighborhood") return state.scales.neighborhood(d.neighborhood_top);
    if (state.colorMode === "priority") return state.scales.priority(d.priority);
    if (state.colorMode === "dept") return state.scales.dept(d.dept_name);

    // default: delay
    if (Number.isFinite(d.update_delay_days)) return state.scales.delay(d.update_delay_days);
    return "rgba(232,245,255,0.25)";
  }

  function projectPoint(lat, lon) {
    const pt = map.latLngToLayerPoint([lat, lon]);
    return [pt.x, pt.y];
  }

  function getRenderedPointRows(filteredMapRows) {
    const wantPoints = (state.mapLayerMode === "points" || state.mapLayerMode === "both");
    if (!wantPoints) {
      return { drawRows: [], visibleRows: 0, sampled: false };
    }

    const bounds = map.getBounds().pad(0.08);
    const inView = filteredMapRows.filter(d => bounds.contains([d.lat, d.lon]));

    if (!inView.length) {
      return { drawRows: [], visibleRows: 0, sampled: false };
    }

    const zoom = map.getZoom();
    const cellSize = zoom <= 11 ? 8 : zoom === 12 ? 6 : zoom === 13 ? 5 : 4;
    const seenCells = new Set();
    const drawRows = [];

    for (const d of inView) {
      const layerPt = map.latLngToLayerPoint([d.lat, d.lon]);
      d.__layerX = layerPt.x;
      d.__layerY = layerPt.y;

      const cellX = Math.floor(layerPt.x / cellSize);
      const cellY = Math.floor(layerPt.y / cellSize);
      const key = `${cellX},${cellY}`;
      if (seenCells.has(key)) continue;
      seenCells.add(key);
      drawRows.push(d);

      if (drawRows.length >= POINT_RENDER_LIMIT) break;
    }

    return {
      drawRows,
      visibleRows: inView.length,
      sampled: drawRows.length < inView.length
    };
  }

  function renderMapPoints() {
    const { filteredMapRows } = getFilteredSets();
    const { drawRows, visibleRows, sampled } = getRenderedPointRows(filteredMapRows);
    state.pointPerf = {
      renderedCount: drawRows.length,
      visibleRows,
      sampled
    };

    const r = getPointRadius();

    const sel = gPoints.selectAll("circle.point")
      .data(drawRows, d => d.sr_number);

    sel.join(
      enter => enter.append("circle")
        .attr("class", "point")
        .attr("r", r)
        .attr("stroke", "rgba(232,245,255,0.42)")
        .attr("stroke-width", 1.1)
        .attr("opacity", 0.94)
        .on("mousemove", (evt, d) => {
          showTooltip(evt, `
            <div class="ttTitle">${d.sr_type_desc}</div>
            <div class="ttRow"><span class="ttKey">Created:</span> ${fmtDate(d.date_created)} ${d.time_received || ""}</div>
            <div class="ttRow"><span class="ttKey">Last update:</span> ${fmtDate(d.date_last_update)}</div>
            <div class="ttRow"><span class="ttKey">Agency:</span> ${d.dept_name || "—"}</div>
            <div class="ttRow"><span class="ttKey">Priority:</span> ${d.priority || "—"}</div>
            <div class="ttRow"><span class="ttKey">Neighborhood:</span> ${d.neighborhood || "—"}</div>
            <div class="ttRow"><span class="ttKey">Method:</span> ${d.method_received || "—"}</div>
            <div class="ttRow"><span class="ttKey">Address:</span> ${d.address || "—"}</div>
          `);
        })
        .on("mouseleave", hideTooltip),
      update => update,
      exit => exit.remove()
    )
    .attr("r", r)
    .attr("fill", d => colorForPoint(d))
    .attr("stroke", "rgba(232,245,255,0.42)")
    .attr("stroke-width", 1.1)
    .attr("opacity", 0.94)
    .attr("class", d => {
      let cls = "point";
      if (state.hoverWeek && d.week_start === state.hoverWeek) cls += " selected";
      return cls;
    })
    .attr("cx", d => d.__layerX ?? projectPoint(d.lat, d.lon)[0])
    .attr("cy", d => d.__layerY ?? projectPoint(d.lat, d.lon)[1]);
  }

  function resetOverlay() {
    schedulePointRender();
  }

  map.on("moveend zoomend", resetOverlay);

  // -----------------------------
  // Timeline (Level 2) with brush (Level 4)
  // -----------------------------
  function renderTimeline() {
    const root = d3.select("#timeline");
    root.selectAll("*").remove();

    const box = root.node().getBoundingClientRect();
    const width = Math.max(520, box.width);
    const height = Math.max(320, box.height);

    const margin = { top: 18, right: 16, bottom: 34, left: 46 };
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;

    const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const gg = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const { baseRows } = getFilteredSets();

    const byWeek = d3.rollups(
      baseRows,
      v => v.length,
      d => d.week_start
    ).sort((a,b) => d3.ascending(a[0], b[0]));

    const data = byWeek.map(([week, count]) => ({
      week_start: week,
      week_date: parseISODate(week),
      count
    })).filter(d => d.week_date);

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.week_date))
      .range([0, iw]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) || 1])
      .nice()
      .range([ih, 0]);

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%b"));
    const yAxis = d3.axisLeft(y).ticks(5);

    gg.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(xAxis)
      .call(s => s.selectAll("text").attr("fill", "rgba(232,245,255,0.70)"))
      .call(s => s.selectAll("path,line").attr("stroke", "rgba(232,245,255,0.16)"));

    gg.append("g")
      .call(yAxis)
      .call(s => s.selectAll("text").attr("fill", "rgba(232,245,255,0.70)"))
      .call(s => s.selectAll("path,line").attr("stroke", "rgba(232,245,255,0.16)"));

    gg.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""))
      .call(s => s.selectAll("line").attr("stroke", "rgba(232,245,255,0.08)"))
      .call(s => s.selectAll("path").attr("stroke", "none"));

    const barW = Math.max(2.0, iw / Math.max(1, data.length) * 0.85);

    const bars = gg.append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", d => x(d.week_date) - barW / 2)
      .attr("y", d => y(d.count))
      .attr("width", barW)
      .attr("height", d => ih - y(d.count))
      .attr("rx", 5)
      .attr("fill", "rgba(96,165,250,0.72)")
      .attr("stroke", "rgba(232,245,255,0.10)")
      .attr("stroke-width", 1);

    const line = d3.line()
      .x(d => x(d.week_date))
      .y(d => y(d.count));

    gg.append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "rgba(103,232,249,0.92)")
      .attr("stroke-width", 2.2)
      .attr("opacity", 0.9);

    function setHoverWeek(weekStr) {
      state.hoverWeek = weekStr;
      schedulePointRender();
    }

    bars
      .on("mousemove", (evt, d) => {
        showTooltip(evt, `
          <div class="ttTitle">Week of ${d3.timeFormat("%b %d")(d.week_date)}</div>
          <div class="ttRow"><span class="ttKey">Calls:</span> ${d.count.toLocaleString()}</div>
          <div class="ttRow"><span class="ttKey">Action:</span> Drag to brush a time range</div>
        `);
        // hover highlight is helpful even when a brush exists
        setHoverWeek(d.week_start);
      })
      .on("mouseleave", () => {
        hideTooltip();
        setHoverWeek(null);
      });

    // Brush to select a time range
    const brush = d3.brushX()
      .extent([[0, 0], [iw, ih]])
      .on("end", (evt) => {
        if (!evt.sourceEvent) return;
        if (!evt.selection) {
          state.timeRange = null;
          updateAll();
          return;
        }
        const [x0, x1] = evt.selection;
        const d0 = x.invert(x0);
        const d1 = x.invert(x1);
        // normalize order and expand to full days
        const a = new Date(Math.min(+d0, +d1));
        const b = new Date(Math.max(+d0, +d1));
        // inclusive end-of-day
        b.setHours(23,59,59,999);

        state.timeRange = [a, b];
        updateAll();
      });

    const gBrush = gg.append("g").attr("class", "brush").call(brush);

    // If timeRange already exists, show it
    if (state.timeRange) {
      gBrush.call(brush.move, state.timeRange.map(x));
    }

    gg.append("text")
      .attr("x", 0)
      .attr("y", -6)
      .attr("fill", "rgba(232,245,255,0.70)")
      .attr("font-size", 12)
      .attr("font-weight", 800)
      .text("Requests per week");

    gg.append("text")
      .attr("x", iw)
      .attr("y", ih + 30)
      .attr("text-anchor", "end")
      .attr("fill", "rgba(232,245,255,0.62)")
      .attr("font-size", 11)
      .text("Drag to brush, hover to preview");
  }

  // -----------------------------
  // Attribute charts (Level 3) with selection (Level 4)
  // -----------------------------
  function topNWithOther(pairs, n, otherLabel = "Other") {
    const sorted = pairs.slice().sort((a,b) => d3.descending(a.value, b.value));
    const head = sorted.slice(0, n);
    const tail = sorted.slice(n);
    if (!tail.length) return head;
    return head.concat([{ key: otherLabel, value: d3.sum(tail, d => d.value) }]);
  }

  function renderHBarChart(rootEl, data, opts) {
    const root = d3.select(rootEl);
    root.selectAll("*").remove();

    const box = rootEl.getBoundingClientRect();
    const width = Math.max(240, box.width);
    const height = Math.max(160, box.height);

    const margin = { top: 10, right: 18, bottom: 18, left: width < 360 ? 118 : 132 };
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;

    const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 1])
      .nice()
      .range([0, iw]);

    const y = d3.scaleBand()
      .domain(data.map(d => d.key))
      .range([0, ih])
      .padding(0.18);

    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(4))
      .call(s => s.selectAll("text").attr("fill", "rgba(232,245,255,0.65)"))
      .call(s => s.selectAll("path,line").attr("stroke", "rgba(232,245,255,0.14)"));

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0).tickFormat(d => truncateLabel(d, width < 360 ? 14 : 18)))
      .call(s => s.selectAll("text").attr("fill", "rgba(232,245,255,0.82)").attr("font-size", 11))
      .call(s => s.selectAll("path,line").attr("stroke", "none"));

    const bars = g.append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", 0)
      .attr("y", d => y(d.key))
      .attr("width", d => x(d.value))
      .attr("height", y.bandwidth())
      .attr("rx", 8)
      .attr("fill", opts.barFill || "rgba(103,232,249,0.35)")
      .attr("stroke", "rgba(232,245,255,0.10)")
      .attr("stroke-width", 1)
      .attr("opacity", 0.92)
      .style("cursor", "pointer");

    // selection highlighting
    bars.attr("fill", d => {
      if (!opts.selectedKey) return (opts.barFill || "rgba(103,232,249,0.35)");
      return d.key === opts.selectedKey ? "rgba(103,232,249,0.92)" : "rgba(232,245,255,0.16)";
    });

    bars
      .on("mousemove", (evt, d) => {
        showTooltip(evt, `
          <div class="ttTitle">${opts.title}</div>
          <div class="ttRow"><span class="ttKey">${d.key}</span></div>
          <div class="ttRow"><span class="ttKey">Count:</span> ${d.value.toLocaleString()}</div>
          <div class="ttRow"><span class="ttKey">Action:</span> Click to filter</div>
        `);
      })
      .on("mouseleave", hideTooltip)
      .on("click", (_, d) => {
        opts.onSelect(d.key);
      });

    // value labels (right aligned)
    g.append("g")
      .selectAll("text.value")
      .data(data)
      .join("text")
      .attr("class", "value")
      .attr("x", d => x(d.value) + 6)
      .attr("y", d => (y(d.key) || 0) + y.bandwidth()/2 + 4)
      .attr("fill", "rgba(232,245,255,0.62)")
      .attr("font-size", 11)
      .text(d => d.value >= 1 ? d.value.toLocaleString() : "");
  }

  
  // -----------------------------
  // Service types chart (Level 6)
  // -----------------------------
  function renderServiceTypesChart() {
    if (!els.chartService) return;
    const root = d3.select(els.chartService);
    root.selectAll("*").remove();

    const { filteredRows } = getFilteredSets();

    const counts = d3.rollups(
      filteredRows,
      v => v.length,
      d => d.sr_type_desc
    ).sort((a,b) => d3.descending(a[1], b[1]));

    const dataPairs = counts.map(([k,v]) => ({ key: k, value: v }));
    const data = topNWithOther(dataPairs, 10, "Other (grouped)");

    const box = els.chartService.getBoundingClientRect();
    const width = Math.max(360, box.width);
    const height = Math.max(190, box.height);

    const margin = { top: 10, right: 16, bottom: 22, left: 220 };
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;

    const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 1])
      .nice()
      .range([0, iw]);

    const y = d3.scaleBand()
      .domain(data.map(d => d.key))
      .range([0, ih])
      .padding(0.18);

    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(4))
      .call(s => s.selectAll("text").attr("fill", "rgba(232,245,255,0.65)"))
      .call(s => s.selectAll("path,line").attr("stroke", "rgba(232,245,255,0.14)"));

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0).tickFormat(d => truncateLabel(d, 26)))
      .call(s => s.selectAll("text").attr("fill", "rgba(232,245,255,0.82)").attr("font-size", 11))
      .call(s => s.selectAll("path,line").attr("stroke", "none"));

    const bars = g.append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", 0)
      .attr("y", d => y(d.key))
      .attr("width", d => x(d.value))
      .attr("height", y.bandwidth())
      .attr("rx", 8)
      .attr("stroke", "rgba(232,245,255,0.10)")
      .attr("stroke-width", 1)
      .style("cursor", d => d.key.startsWith("Other") ? "default" : "pointer")
      .attr("fill", d => {
        if (d.key.startsWith("Other")) return "rgba(232,245,255,0.12)";
        return getTypeColor(d.key);
      })
      .attr("opacity", d => {
        if (d.key.startsWith("Other")) return 0.8;
        return state.activeTypes.has(d.key) ? 0.92 : 0.18;
      });

    bars
      .on("mousemove", (evt, d) => {
        showTooltip(evt, `
          <div class="ttTitle">Service type</div>
          <div class="ttRow"><span class="ttKey">${d.key}</span> <span style="opacity:0.75">(${d.value.toLocaleString()})</span></div>
          <div class="ttRow"><span class="ttKey">Active:</span> ${d.key.startsWith("Other") ? "Grouped" : (state.activeTypes.has(d.key) ? "Yes" : "No")}</div>
        `);
      })
      .on("mouseleave", hideTooltip)
      .on("click", (evt, d) => {
        if (d.key.startsWith("Other")) return;
        toggleType(d.key);
        renderTypeModalList();
      });
  }



  function renderAttrCarousel() {
    const slides = document.querySelectorAll('.attrSlide');
    slides.forEach((slide, idx) => {
      slide.classList.toggle('active', idx === state.attrSlide);
    });
    if (els.attrSlideLabel) {
      els.attrSlideLabel.textContent = state.attrSlideLabels[state.attrSlide] || 'Attributes';
    }
  }

  function shiftAttrSlide(dir) {
    const total = state.attrSlideLabels.length;
    state.attrSlide = (state.attrSlide + dir + total) % total;
    renderAttrCarousel();
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 0);
  }

function renderAttributes() {
    const { filteredRows } = getFilteredSets();

    const nPairs = d3.rollups(
      filteredRows.filter(d => d.neighborhood_top),
      v => v.length,
      d => d.neighborhood_top
    ).map(([k,v]) => ({ key: k, value: v }));
    const nData = topNWithOther(nPairs, 8, "Other");

    renderHBarChart(els.chartNeighborhood, nData, {
      title: "Neighborhood",
      selectedKey: state.selectedNeighborhood,
      onSelect: (k) => {
        state.selectedNeighborhood = (state.selectedNeighborhood === k) ? null : k;
        updateAll();
      },
      barFill: "rgba(96,165,250,0.34)"
    });

    const mPairs = d3.rollups(
      filteredRows.filter(d => d.method_received),
      v => v.length,
      d => d.method_received
    ).map(([k,v]) => ({ key: k, value: v }));
    const mData = topNWithOther(mPairs, 6, "Other");

    renderHBarChart(els.chartMethod, mData, {
      title: "Method received",
      selectedKey: state.selectedMethod,
      onSelect: (k) => {
        state.selectedMethod = (state.selectedMethod === k) ? null : k;
        updateAll();
      },
      barFill: "rgba(103,232,249,0.30)"
    });

    const dPairs = d3.rollups(
      filteredRows.filter(d => d.dept_name),
      v => v.length,
      d => d.dept_name
    ).map(([k,v]) => ({ key: k, value: v }));
    const dData = topNWithOther(dPairs, 6, "Other");

    renderHBarChart(els.chartDept, dData, {
      title: "Responsible department",
      selectedKey: state.selectedDept,
      onSelect: (k) => {
        state.selectedDept = (state.selectedDept === k) ? null : k;
        updateAll();
      },
      barFill: "rgba(167,139,250,0.30)"
    });

    const pPairs = d3.rollups(
      filteredRows.filter(d => d.priority),
      v => v.length,
      d => d.priority
    ).map(([k,v]) => ({ key: k, value: v }));
    const pData = pPairs.sort((a,b) => d3.descending(a.value, b.value));

    renderHBarChart(els.chartPriority, pData, {
      title: "Priority",
      selectedKey: state.selectedPriority,
      onSelect: (k) => {
        state.selectedPriority = (state.selectedPriority === k) ? null : k;
        updateAll();
      },
      barFill: "rgba(251,191,36,0.22)"
    });
  }

  // -----------------------------
  // Map brushing (Level 5)
  // -----------------------------
  let brushSvg = null;
  let brushG = null;
  let mapBrush = null;

  function setBrushMode(on) {
    state.brushMode = on;
    els.toggleBrush.textContent = `Map brush: ${on ? "On" : "Off"}`;
    els.mapBrushOverlay.classList.toggle("hidden", !on);

    if (on) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();

      ensureMapBrushOverlay();
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();

      clearMapBrushOverlay();
    }
  }

  function ensureMapBrushOverlay() {
    // Create overlay svg once
    if (!brushSvg) {
      brushSvg = d3.select(els.mapBrushOverlay).append("svg");
      brushG = brushSvg.append("g").attr("class", "brushLayer");
      mapBrush = d3.brush()
        .on("end", (evt) => {
          if (!evt.selection) {
            state.mapSelection = null;
            updateAll();
            return;
          }
          const [[x0,y0],[x1,y1]] = evt.selection;
          const minX = Math.min(x0,x1), maxX = Math.max(x0,x1);
          const minY = Math.min(y0,y1), maxY = Math.max(y0,y1);

          const { filteredRows } = getFilteredSets(); // includes time + attribute filters
          const selected = new Set();

          // Use container coordinates
          for (const d of filteredRows) {
            if (!d.has_coords) continue;
            const p = map.latLngToContainerPoint([d.lat, d.lon]);
            if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
              selected.add(d.sr_number);
            }
          }

          state.mapSelection = selected.size ? selected : null;
          updateAll();
        });

      brushG.attr("class", "brush").call(mapBrush);
    }

    resizeBrushOverlay();
  }

  function resizeBrushOverlay() {
    if (!brushSvg) return;
    const box = els.mapBrushOverlay.getBoundingClientRect();
    const w = Math.max(10, box.width);
    const h = Math.max(10, box.height);

    brushSvg.attr("width", w).attr("height", h);
    brushG.call(mapBrush.extent([[0,0],[w,h]]));

    // If selection exists, leave it; user can reselect
  }

  function clearMapBrushOverlay() {
    if (!brushG) return;
    // Clear visible brush selection
    brushG.call(mapBrush.move, null);
  }

  // keep overlay sized
  window.addEventListener("resize", () => {
    resizeBrushOverlay();
    renderTimeline();
    renderAttributes();
    resetOverlay();
  });

  // -----------------------------
  // Master update
  // -----------------------------
  function updateAll() {
    updateActiveFiltersLabel();
    syncHeatControls();
    renderHeatmap();
    renderMapPoints();
    renderTimeline();
    renderServiceTypesChart();
    renderAttributes();
    renderAttrCarousel();

    const { filteredRows } = getFilteredSets();
    const baseRows = filterBaseRows();

    const wantPoints = (state.mapLayerMode === "points" || state.mapLayerMode === "both");
    const pointNote = wantPoints && state.pointPerf && state.pointPerf.sampled
      ? ` • Rendering ${state.pointPerf.renderedCount.toLocaleString()} representative points from ${state.pointPerf.visibleRows.toLocaleString()} visible for performance`
      : "";

    setStatus(
      `Showing ${filteredRows.length.toLocaleString()} of ${state.rows.length.toLocaleString()} requests`,
      `Filters apply across map, timeline, and attributes. Base set: ${baseRows.length.toLocaleString()}${pointNote}`
    );
  }
// -----------------------------
  // UI wiring
  // -----------------------------
  els.colorBy.addEventListener("change", (e) => {
    state.colorMode = e.target.value;
    updateLegend();
    schedulePointRender();
    setStatus(els.statusLine.textContent, `Color by: ${els.colorBy.options[els.colorBy.selectedIndex].text}`);
  });

  els.basemap.addEventListener("change", (e) => {
    const next = e.target.value;
    if (next === state.basemap) return;

    map.removeLayer(baseLayers[state.basemap]);
    state.basemap = next;
    baseLayers[state.basemap].addTo(map);
    applyBasemapTheme();
    schedulePointRender();
  });

  els.mapLayer.addEventListener("change", (e) => {
    state.mapLayerMode = e.target.value;
    updateAll();
  });

  els.heatRadius.addEventListener("input", (e) => {
    state.heatRadius = +e.target.value;
    renderHeatmap();
  });

  els.serviceTypesBtn.addEventListener("click", () => openServiceModal());
  els.closeServiceModal.addEventListener("click", () => closeServiceModal());

  // close modal on backdrop click
  els.serviceModal.addEventListener("click", (e) => {
    if (e.target === els.serviceModal) closeServiceModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.serviceModal.classList.contains("hidden")) closeServiceModal();
  });

  els.typeSearch.addEventListener("input", () => renderTypeModalList());

  els.typesAll.addEventListener("click", () => {
    state.activeTypes = new Set(state.typeOrder);
    persistTypeState();
    updateLegend();
    updateAll();
    renderTypeModalList();
  });

  els.typesNone.addEventListener("click", () => {
    state.activeTypes = new Set();
    persistTypeState();
    updateLegend();
    updateAll();
    renderTypeModalList();
  });

  els.typesResetColors.addEventListener("click", () => resetTypeColors());

  // delegate checkbox + color pick events
  els.typeList.addEventListener("change", (e) => {
    const row = e.target.closest(".typeRow");
    if (!row) return;
    const type = row.getAttribute("data-type");

    if (e.target.classList.contains("typeCheck")) {
      toggleType(type);
      renderTypeModalList();
    }

    if (e.target.classList.contains("colorPick")) {
      state.typeColors.set(type, e.target.value);
      persistTypeState();
      updateLegend();
      updateAll();
    }
  });


  els.attrPrev.addEventListener("click", () => shiftAttrSlide(-1));
  els.attrNext.addEventListener("click", () => shiftAttrSlide(1));

  els.resetView.addEventListener("click", () => {
    state.hoverWeek = null;
    map.setView(CINCY_CENTER, 12);
    resizeBrushOverlay();
    updateAll();
  });

  els.clearFilters.addEventListener("click", () => {
    state.timeRange = null;
    state.selectedNeighborhood = null;
    state.selectedMethod = null;
    state.selectedDept = null;
    state.selectedPriority = null;
    state.mapSelection = null;
    state.hoverWeek = null;
    state.activeTypes = new Set(state.typeOrder);
    persistTypeState();

    if (els.typeSearch) els.typeSearch.value = "";

    // clear brush visuals if present
    if (brushG && mapBrush) brushG.call(mapBrush.move, null);

    updateLegend();
    updateAll();
    renderTypeModalList();
  });

  els.toggleBrush.addEventListener("click", () => {
    setBrushMode(!state.brushMode);
  });

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    setStatus("Loading data…");

    const [meta, rows] = await Promise.all([
      d3.json("./data/meta.json"),
      d3.csv("./data/311_multi_2025_top16.csv", rowParser)
    ]);

    state.meta = meta;
    state.rows = rows;
    state.mapRows = rows.filter(d => d.has_coords);

    els.yearLabel.textContent = meta.year ? String(meta.year) : "—";
    els.mappedCount.textContent = meta.mappable_requests.toLocaleString();
    els.missingCount.textContent = meta.missing_coords.toLocaleString();

    buildScales();
    initTypesFromData();

    // sync defaults from UI
    state.colorMode = els.colorBy.value || state.colorMode;
    state.mapLayerMode = els.mapLayer.value || state.mapLayerMode;
    state.heatRadius = +els.heatRadius.value || state.heatRadius;

    updateLegend();
    syncHeatControls();
    renderTypeModalList();

    setStatus(
      `Loaded ${meta.total_requests.toLocaleString()} requests`,
      `${(meta.service_types_included ? meta.service_types_included.length : state.typeOrder.length)} service types • ${meta.date_range[0]} to ${meta.date_range[1]}`
    );

    updateAll();
    // ensure points positioned correctly after initial render
    resetOverlay();
  }

  init().catch((err) => {
    console.error(err);
    setStatus("Failed to load data", String(err));
  });
})();
