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
    legendTitle: document.getElementById("legendTitle"),
    legendBody: document.getElementById("legendBody")
  };

  const tooltip = d3.select("#tooltip");

  const state = {
    rows: [],
    mapRows: [],
    hoverWeek: null,
    colorMode: "delay",
    basemap: "dark",
    meta: null,
    scales: {}
  };

  function setStatus(line, sub = "") {
    els.statusLine.textContent = line;
    els.statusSub.textContent = sub || "";
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

  // -----------------------------
  // Leaflet basemaps
  // -----------------------------
  const baseLayers = {
    dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }),
    light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }),
    aerial: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    })
  };

  const map = L.map("map", {
    minZoom: 11,
    maxZoom: 19,
    zoomControl: true
  }).setView(CINCY_CENTER, 12);

  baseLayers[state.basemap].addTo(map);

  // D3 overlay on Leaflet
  L.svg().addTo(map);
  const overlay = d3.select(map.getPanes().overlayPane).select("svg");
  const g = overlay.append("g").attr("class", "leaflet-zoom-hide");

  function project(lat, lon) {
    const pt = map.latLngToLayerPoint([lat, lon]);
    return [pt.x, pt.y];
  }

  function circleRadius() {
    // Slightly scale with zoom for legibility
    const z = map.getZoom();
    return Math.max(2.4, Math.min(6.2, 1.2 + z * 0.25));
  }

  function colorFor(d) {
    const mode = state.colorMode;
    const s = state.scales;

    if (mode === "delay") {
      return s.delay(d.update_delay_days);
    }
    if (mode === "neighborhood") {
      const key = d.neighborhood_top || "Other";
      return s.neighborhood(key);
    }
    if (mode === "priority") {
      return s.priority(d.priority || "STANDARD");
    }
    if (mode === "dept") {
      return s.dept(d.dept_name || "Unknown");
    }
    return "rgba(103,232,249,0.85)";
  }

  function renderMapPoints() {
    const r = circleRadius();

    const sel = g.selectAll("circle.point")
      .data(state.mapRows, d => d.sr_number);

    sel.join(
      enter => enter.append("circle")
        .attr("class", "point")
        .attr("r", r)
        .attr("stroke", "rgba(255,255,255,0.18)")
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.82)
        .on("mousemove", (evt, d) => {
          const fmt = d3.timeFormat("%Y-%m-%d");
          const created = d.date_created ? fmt(d.date_created) : "—";
          const updated = d.date_last_update ? fmt(d.date_last_update) : "—";
          const delay = (d.update_delay_days != null && Number.isFinite(d.update_delay_days)) ? `${d.update_delay_days.toFixed(1)} days` : "—";

          showTooltip(evt, `
            <div class="ttTitle">${d.sr_type_desc || "Service request"}</div>
            <div class="ttRow"><span class="ttKey">Created:</span> ${created}</div>
            <div class="ttRow"><span class="ttKey">Last update:</span> ${updated}</div>
            <div class="ttRow"><span class="ttKey">Time to update:</span> ${delay}</div>
            <div class="ttRow"><span class="ttKey">Dept:</span> ${d.dept_name || "—"}</div>
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
      .attr("fill", d => colorFor(d))
      .attr("r", r)
      .attr("cx", d => project(d.lat, d.lon)[0])
      .attr("cy", d => project(d.lat, d.lon)[1])
      .classed("dim", d => state.hoverWeek && d.week_start !== state.hoverWeek);

    // Apply dim style via inline to avoid extra CSS complexity
    g.selectAll("circle.point")
      .attr("opacity", d => (state.hoverWeek && d.week_start !== state.hoverWeek) ? 0.12 : 0.82);
  }

  function resetOverlay() {
    // Leaflet manages the SVG overlay size/transform.
    // We only need to recompute projected positions on pan/zoom.
    renderMapPoints();
  }

  map.on("zoomend moveend", resetOverlay);

  // -----------------------------
  // Timeline (weekly bins)
  // -----------------------------
  function renderTimeline() {
    const root = d3.select("#timeline");
    root.selectAll("*").remove();

    const box = root.node().getBoundingClientRect();
    const width = Math.max(520, box.width);
    const height = Math.max(420, box.height);

    const margin = { top: 18, right: 16, bottom: 34, left: 46 };
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;

    const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const gg = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Aggregate weekly counts from ALL rows (even if not mapped)
    const byWeek = d3.rollups(
      state.rows,
      v => v.length,
      d => d.week_start
    ).sort((a,b) => d3.ascending(a[0], b[0]));

    const parseISO = d3.timeParse("%Y-%m-%d");
    const data = byWeek.map(([week, count]) => ({
      week_start: week,
      week_date: parseISO(week),
      count
    })).filter(d => d.week_date);

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.week_date))
      .range([0, iw]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) || 1])
      .nice()
      .range([ih, 0]);

    // Axes
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

    // Subtle horizontal gridlines
    gg.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""))
      .call(s => s.selectAll("line").attr("stroke", "rgba(232,245,255,0.08)"))
      .call(s => s.selectAll("path").attr("stroke", "none"));

    const barW = Math.max(2.0, iw / data.length * 0.85);

    const bars = gg.append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", d => x(d.week_date) - barW / 2)
      .attr("y", d => y(d.count))
      .attr("width", barW)
      .attr("height", d => ih - y(d.count))
      .attr("rx", 5)
      .attr("fill", "rgba(96,165,250,0.75)")
      .attr("stroke", "rgba(232,245,255,0.10)")
      .attr("stroke-width", 1);

    // Overlay line for trend, purely for readability
    const line = d3.line()
      .x(d => x(d.week_date))
      .y(d => y(d.count));

    gg.append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "rgba(103,232,249,0.95)")
      .attr("stroke-width", 2.2)
      .attr("opacity", 0.9);

    const fmt = d3.timeFormat("%Y-%m-%d");
    const fmtShort = d3.timeFormat("%b %d");
    const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

    function setHoverWeek(weekStr) {
      state.hoverWeek = weekStr;
      renderMapPoints();
    }

    bars
      .on("mousemove", (evt, d) => {
        const end = addDays(d.week_date, 6);
        showTooltip(evt, `
          <div class="ttTitle">Week</div>
          <div class="ttRow"><span class="ttKey">From:</span> ${fmtShort(d.week_date)}</div>
          <div class="ttRow"><span class="ttKey">To:</span> ${fmtShort(end)}</div>
          <div class="ttRow"><span class="ttKey">Calls:</span> ${d.count.toLocaleString()}</div>
        `);
        setHoverWeek(d.week_start);
      })
      .on("mouseleave", () => {
        hideTooltip();
        setHoverWeek(null);
      });

    // Axis labels
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
      .text("Hover a bar to highlight that week on the map");
  }

  // -----------------------------
  // Legends
  // -----------------------------
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
        <div class="legendLeft">
          <div class="swatch" style="background:${scale(k)};"></div>
          <div class="legendLabel">${k}</div>
        </div>
      </div>
    `).join("");

    const more = extra > 0 ? `<div style="margin-top:6px; color:rgba(232,245,255,0.62); font-size:0.80rem;">+ ${extra} more</div>` : "";

    els.legendBody.innerHTML = rows + more;
  }

  function updateLegend() {
    if (state.colorMode === "delay") return setLegendDelay();
    if (state.colorMode === "neighborhood") return setLegendCategorical("Neighborhood (top)", state.scales.neighborhood, 10);
    if (state.colorMode === "priority") return setLegendCategorical("Priority", state.scales.priority, 10);
    if (state.colorMode === "dept") return setLegendCategorical("Public agency", state.scales.dept, 10);
    setLegendDelay();
  }

  // -----------------------------
  // Load data
  // -----------------------------
  const parseISO = d3.timeParse("%Y-%m-%dT%H:%M:%S");

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
      month: d.month,

      lat,
      lon,
      has_coords: Number.isFinite(lat) && Number.isFinite(lon)
    };
  }

  function buildScales() {
    // Delay scale (quantitative)
    const delays = state.rows
      .map(d => d.update_delay_days)
      .filter(v => Number.isFinite(v));

    const q = d3.quantileSorted(delays.slice().sort(d3.ascending), 0.98) || 14;
    const maxV = Math.max(1, q);
    const minV = d3.quantileSorted(delays.slice().sort(d3.ascending), 0.02) || 0;

    state.scales.delay = d3.scaleSequential(d3.interpolateCividis)
      .domain([minV, maxV])
      .clamp(true);

    // Neighborhood (nominal): top 12 + Other
    const nCounts = d3.rollups(
      state.rows.filter(d => d.neighborhood),
      v => v.length,
      d => d.neighborhood
    ).sort((a,b) => d3.descending(a[1], b[1]));

    const top = nCounts.slice(0, 12).map(d => d[0]);
    state.rows.forEach(d => { d.neighborhood_top = top.includes(d.neighborhood) ? d.neighborhood : "Other"; });

    const palette = [...d3.schemeTableau10, ...d3.schemeSet3];
    const nDomain = [...top, "Other"];
    state.scales.neighborhood = d3.scaleOrdinal()
      .domain(nDomain)
      .range(nDomain.map((_, i) => i < nDomain.length - 1 ? palette[i % palette.length] : "rgba(232,245,255,0.20)"));

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

    // Render
    resetOverlay();
    renderTimeline();
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
    hideTooltip();
    renderMapPoints();
  });

  // Resize redraw
  let t = null;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      renderTimeline();
      resetOverlay();
    }, 120);
  });

  init().catch(err => {
    console.error(err);
    setStatus("Failed to load data", "Check console and ensure you run a local server.");
  });
})();
