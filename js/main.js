/* global L, d3 */

(function () {
  const tooltip = d3.select("#tooltip");
  const statusLine = document.getElementById("statusLine");
  const yearLabel = document.getElementById("yearLabel");

  // ----placeholder for now----
  const state = {
    year: "TBD",
    serviceType: "ALL",
    colorBy: "time_to_update",
    basemap: "dark",
    points: [] // placeholder points
  };

  // Cincinnati center
  const CINCY = [39.1031, -84.5120];
})();