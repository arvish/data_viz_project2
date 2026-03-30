/* global L, d3 */

(function () {
  const tooltip = d3.select("#tooltip");
  const statusLine = document.getElementById("statusLine");
  const yearLabel = document.getElementById("yearLabel");

  // ---- Basic state (placeholder for now) ----
  const state = {
    year: "TBD",
    serviceType: "ALL",
    colorBy: "time_to_update",
    basemap: "dark",
    points: [] // placeholder points
  };

  // Cincinnati center
  const CINCY = [39.1031, -84.5120];

  // ---- Leaflet basemaps (simple, reliable URLs) ----
  const baseLayers = {
    dark: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 20, attribution: '&copy; OpenStreetMap &copy; CARTO' }
    ),
    light: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 20, attribution: '&copy; OpenStreetMap &copy; CARTO' }
    ),
    streets: L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' }
    )
  };

  // ---- Initialize Leaflet map ----
  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: false
  }).setView(CINCY, 12);

  baseLayers[state.basemap].addTo(map);

  // Use Leaflet's SVG overlay so D3 can draw on top
  L.svg().addTo(map);
  const overlay = d3.select(map.getPanes().overlayPane).select("svg");
  const g = overlay.append("g").attr("class", "leaflet-zoom-hide");

  // ---- Placeholder data generator (so page looks alive immediately) ----
  function makeFakePoints(n = 160) {
    // rough bounding box around Cincinnati
    const lat0 = 39.03, lat1 = 39.17;
    const lon0 = -84.62, lon1 = -84.40;

    return d3.range(n).map((i) => {
      const lat = lat0 + Math.random() * (lat1 - lat0);
      const lon = lon0 + Math.random() * (lon1 - lon0);
      const priority = ["LOW", "MED", "HIGH"][Math.floor(Math.random() * 3)];
      const agency = ["DOTE", "Parks", "Public Services", "Buildings"][Math.floor(Math.random() * 4)];
      const neighborhood = ["CBD", "OTR", "Clifton", "Hyde Park", "West End"][Math.floor(Math.random() * 5)];
      const time_to_update = Math.round(1 + Math.random() * 30);

      return {
        id: `stub-${i}`,
        lat,
        lon,
        date_created: "2022-01-01",
        date_updated: "2022-01-10",
        service_name: "Placeholder service type",
        description: "Replace with 311 description",
        agency,
        priority,
        neighborhood,
        time_to_update
      };
    });
  }

  state.points = makeFakePoints();

  // ---- Color scales (placeholder; you’ll swap with real encodings) ----
  function colorForPoint(d) {
    if (state.colorBy === "priority") {
      return d.priority === "HIGH" ? "#fb7185" : d.priority === "MED" ? "#60a5fa" : "#67e8f9";
    }
    if (state.colorBy === "agency") {
      const scale = d3.scaleOrdinal()
        .domain(["DOTE", "Parks", "Public Services", "Buildings"])
        .range(["#67e8f9", "#60a5fa", "#a78bfa", "#fbbf24"]);
      return scale(d.agency);
    }
    if (state.colorBy === "neighborhood") {
      const scale = d3.scaleOrdinal()
        .domain(["CBD", "OTR", "Clifton", "Hyde Park", "West End"])
        .range(["#67e8f9", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa"]);
      return scale(d.neighborhood);
    }
    // default: time_to_update (sequential)
    const t = d.time_to_update;
    const seq = d3.scaleSequential(d3.interpolateCividis).domain([1, 30]);
    return seq(t);
  }

  // ---- Project lat/lon into SVG pixel coordinates ----
  function projectPoint(lat, lon) {
    const pt = map.latLngToLayerPoint([lat, lon]);
    return [pt.x, pt.y];
  }

  // ---- Tooltip helpers ----
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

  // ---- Render points (D3 on Leaflet overlay) ----
  function renderMapPoints() {
    const sel = g.selectAll("circle.point")
      .data(state.points, (d) => d.id);

    sel.join(
      (enter) => enter.append("circle")
        .attr("class", "point")
        .attr("r", 4.6)
        .attr("stroke", "rgba(255,255,255,0.25)")
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.85)
        .on("mousemove", (evt, d) => {
          showTooltip(evt,
            `<strong>${d.service_name}</strong><br/>
             <span class="muted">Agency:</span> ${d.agency}<br/>
             <span class="muted">Priority:</span> ${d.priority}<br/>
             <span class="muted">Neighborhood:</span> ${d.neighborhood}<br/>
             <span class="muted">Time-to-update:</span> ${d.time_to_update} days`
          );
        })
        .on("mouseleave", hideTooltip),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr("fill", (d) => colorForPoint(d))
    .attr("cx", (d) => projectPoint(d.lat, d.lon)[0])
    .attr("cy", (d) => projectPoint(d.lat, d.lon)[1]);
  }

  // Keep SVG overlay sized correctly
  function resetOverlay() {
    const bounds = map.getBounds();
    const topLeft = map.latLngToLayerPoint(bounds.getNorthWest());
    const bottomRight = map.latLngToLayerPoint(bounds.getSouthEast());

    overlay
      .attr("width", bottomRight.x - topLeft.x)
      .attr("height", bottomRight.y - topLeft.y)
      .style("left", `${topLeft.x}px`)
      .style("top", `${topLeft.y}px`);

    g.attr("transform", `translate(${-topLeft.x},${-topLeft.y})`);
    renderMapPoints();
  }

  map.on("moveend zoomend", resetOverlay);
  resetOverlay();

  // ---- Timeline placeholder (D3 SVG) ----
  function renderTimeline() {
    const root = d3.select("#timeline");
    root.selectAll("*").remove();

    const { width, height } = root.node().getBoundingClientRect();
    const w = Math.max(320, width);
    const h = Math.max(220, height);

    const margin = { top: 14, right: 14, bottom: 34, left: 44 };
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    const svg = root.append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const g2 = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // fake daily counts
    const n = 30;
    const data = d3.range(n).map((i) => ({ day: i + 1, count: Math.round(10 + Math.random() * 90) }));

    const x = d3.scaleLinear().domain([1, n]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).nice().range([ih, 0]);

    g2.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(6))
      .call(s => s.selectAll("text").attr("fill", "#98a6bd"))
      .call(s => s.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.15)"));

    g2.append("g")
      .call(d3.axisLeft(y).ticks(4))
      .call(s => s.selectAll("text").attr("fill", "#98a6bd"))
      .call(s => s.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.15)"));

    const line = d3.line()
      .x(d => x(d.day))
      .y(d => y(d.count));

    g2.append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "#67e8f9")
      .attr("stroke-width", 2.2)
      .attr("opacity", 0.9);

    g2.append("text")
      .attr("x", 0)
      .attr("y", -2)
      .attr("fill", "#98a6bd")
      .attr("font-size", 11)
      .text("Placeholder: daily request volume (wire to real DATE_CREATED later)");
  }

  // ---- Attribute chart placeholder (bar chart) ----
  function renderChart() {
    const root = d3.select("#chart");
    root.selectAll("*").remove();

    const { width, height } = root.node().getBoundingClientRect();
    const w = Math.max(320, width);
    const h = Math.max(220, height);

    const margin = { top: 14, right: 14, bottom: 34, left: 44 };
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    const svg = root.append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const g2 = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const cats = ["DOTE", "Parks", "Public Services", "Buildings"];
    const data = cats.map(c => ({ cat: c, value: Math.round(20 + Math.random() * 60) }));

    const x = d3.scaleBand().domain(cats).range([0, iw]).padding(0.18);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value)]).nice().range([ih, 0]);

    g2.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x))
      .call(s => s.selectAll("text").attr("fill", "#98a6bd"))
      .call(s => s.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.15)"));

    g2.append("g")
      .call(d3.axisLeft(y).ticks(4))
      .call(s => s.selectAll("text").attr("fill", "#98a6bd"))
      .call(s => s.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.15)"));

    g2.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", d => x(d.cat))
      .attr("y", d => y(d.value))
      .attr("width", x.bandwidth())
      .attr("height", d => ih - y(d.value))
      .attr("rx", 6)
      .attr("fill", "#60a5fa")
      .attr("opacity", 0.85);

    g2.append("text")
      .attr("x", 0)
      .attr("y", -2)
      .attr("fill", "#98a6bd")
      .attr("font-size", 11)
      .text("Placeholder: breakdown by agency (wire to AGENCY later)");
  }

  function setStatus(msg) {
    statusLine.textContent = msg;
  }

  // ---- Controls wiring ----
  document.getElementById("serviceType").addEventListener("change", (e) => {
    state.serviceType = e.target.value;
    setStatus(`Service Type set to: ${state.serviceType} (placeholder).`);
    // later: filter dataset and rerender
  });

  document.getElementById("colorBy").addEventListener("change", (e) => {
    state.colorBy = e.target.value;
    setStatus(`Color By set to: ${state.colorBy}.`);
    renderMapPoints();
  });

  document.getElementById("basemap").addEventListener("change", (e) => {
    const next = e.target.value;
    if (next === state.basemap) return;

    map.removeLayer(baseLayers[state.basemap]);
    state.basemap = next;
    baseLayers[state.basemap].addTo(map);

    setStatus(`Basemap switched to: ${state.basemap}.`);
  });

  document.getElementById("reset").addEventListener("click", () => {
    map.setView(CINCY, 12);
    setStatus("Reset view: map recentered to Cincinnati.");
  });

  // ---- Initial render of non-map panels ----
  yearLabel.textContent = state.year;
  renderTimeline();
  renderChart();

  // Resize redraw
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      renderTimeline();
      renderChart();
      resetOverlay();
    }, 120);
  });

  setStatus("Scaffold running. Next: load CSV, pick one service type, plot real points, add hover details.");
})();