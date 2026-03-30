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
    basemap: document.getElementById("basemap"),
    resetView: document.getElementById("resetView"),
    clearFilters: document.getElementById("clearFilters"),
    toggleBrush: document.getElementById("toggleBrush"),
    legendTitle: document.getElementById("legendTitle"),
    legendBody: document.getElementById("legendBody"),
    activeFilters: document.getElementById("activeFilters"),

    mapBrushOverlay: document.getElementById("mapBrushOverlay"),

    timeline: document.getElementById("timeline"),
    chartNeighborhood: document.getElementById("chartNeighborhood"),
    chartMethod: document.getElementById("chartMethod"),
    chartDept: document.getElementById("chartDept"),
    chartPriority: document.getElementById("chartPriority")
  };

  const tooltip = d3.select("#tooltip");

  const parseISO = d3.timeParse("%Y-%m-%dT%H:%M:%S");
  const parseISODate = d3.timeParse("%Y-%m-%d");

  const state = {
    meta: null,
    rows: [],
    mapRows: [],

    // Color mode
    colorMode: "delay",
    basemap: "dark",

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

    // computed
    scales: {
      delay: null,
      neighborhood: null,
      priority: null,
      dept: null
    }
  };

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

  // Leaflet SVG overlay for D3 points
  L.svg().addTo(map);
  const overlaySvg = d3.select(map.getPanes().overlayPane).select("svg");
  const gPoints = overlaySvg.append("g").attr("class", "leaflet-zoom-hide");

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

  // -----------------------------
  // Data parsing
  // -----------------------------
  function rowParser(d) {
    const lat = +d.LATITUDE;
    const lon = +d.LONGITUDE;

    return {
      sr_number: d.SR_NUMBER,
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
    if (state.colorMode === "delay") return setLegendDelay();
    if (state.colorMode === "neighborhood") return setLegendCategorical("Neighborhood (top)", state.scales.neighborhood);
    if (state.colorMode === "priority") return setLegendCategorical("Priority", state.scales.priority);
    if (state.colorMode === "dept") return setLegendCategorical("Public agency (department)", state.scales.dept, 10);
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
  // Filtering
  // -----------------------------
  function filterBaseRows() {
    let rows = state.rows;

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

    els.activeFilters.textContent = chips.length ? chips.join(" • ") : "No active filters";
  }

  // -----------------------------
  // Map points
  // -----------------------------
  function colorForPoint(d) {
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

  function renderMapPoints() {
    const { filteredMapRows } = getFilteredSets();

    const sel = gPoints.selectAll("circle.point")
      .data(filteredMapRows, d => d.sr_number);

    sel.join(
      enter => enter.append("circle")
        .attr("class", "point")
        .attr("r", 4.8)
        .attr("stroke", "rgba(232,245,255,0.18)")
        .attr("stroke-width", 1)
        .attr("opacity", 0.85)
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
    .attr("fill", d => colorForPoint(d))
    .attr("class", d => {
      let cls = "point";
      // hoverWeek highlight (soft)
      if (state.hoverWeek && d.week_start === state.hoverWeek) cls += " selected";
      return cls;
    })
    .attr("cx", d => projectPoint(d.lat, d.lon)[0])
    .attr("cy", d => projectPoint(d.lat, d.lon)[1]);
  }

  function resetOverlay() {
    // Leaflet manages the overlay svg transform, we only recompute point positions.
    renderMapPoints();
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
      renderMapPoints();
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

    const margin = { top: 10, right: 10, bottom: 18, left: 128 };
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
      .call(d3.axisLeft(y).tickSize(0))
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
    renderMapPoints();
    renderTimeline();
    renderAttributes();

    const { filteredRows } = getFilteredSets();
    const baseRows = filterBaseRows();

    setStatus(
      `Showing ${filteredRows.length.toLocaleString()} of ${state.rows.length.toLocaleString()} requests`,
      `Filters apply across map, timeline, and attributes. Base set: ${baseRows.length.toLocaleString()}`
    );
  }

  // -----------------------------
  // UI wiring
  // -----------------------------
  els.colorBy.addEventListener("change", (e) => {
    state.colorMode = e.target.value;
    updateLegend();
    renderMapPoints();
    setStatus(els.statusLine.textContent, `Color by: ${els.colorBy.options[els.colorBy.selectedIndex].text}`);
  });

  els.basemap.addEventListener("change", (e) => {
    const next = e.target.value;
    if (next === state.basemap) return;

    map.removeLayer(baseLayers[state.basemap]);
    state.basemap = next;
    baseLayers[state.basemap].addTo(map);
  });

  els.resetView.addEventListener("click", () => {
    state.hoverWeek = null;
    map.setView(CINCY_CENTER, 12);
    renderMapPoints();
  });

  els.clearFilters.addEventListener("click", () => {
    state.timeRange = null;
    state.selectedNeighborhood = null;
    state.selectedMethod = null;
    state.selectedDept = null;
    state.selectedPriority = null;
    state.mapSelection = null;
    state.hoverWeek = null;

    // clear brush visuals if present
    if (brushG && mapBrush) brushG.call(mapBrush.move, null);

    updateAll();
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
      d3.csv("./data/pothole_2025.csv", rowParser)
    ]);

    state.meta = meta;
    state.rows = rows;
    state.mapRows = rows.filter(d => d.has_coords);

    els.yearLabel.textContent = meta.year ? String(meta.year) : "—";
    els.mappedCount.textContent = meta.mappable_requests.toLocaleString();
    els.missingCount.textContent = meta.missing_coords.toLocaleString();

    buildScales();
    updateLegend();

    setStatus(
      `Loaded ${meta.total_requests.toLocaleString()} requests`,
      `${meta.service_type_desc} • ${meta.date_range[0]} to ${meta.date_range[1]}`
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
