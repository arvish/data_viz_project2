# Project 2 — “Who you gonna call? 3-1-1!” (Cincinnati Service Requests)

**Author:** Arvish Pandey  
**Course:** Data Visualization  
**Stack:** D3.js + JavaScript + HTML + CSS, Leaflet (map)  
**Data:** Cincinnati 3-1-1 Service Requests (CSV)

## Links
**Live App:** [PLACEHOLDER — Netlify URL]  
**Checkpoint Plan / Notes:** `docs/` (sketches + planning)  

---

## Project Goal
Build an interactive visual analytics tool to explore Cincinnati 3-1-1 service requests. The focus is on spatial patterns, time trends, and how request attributes (agency, priority, neighborhood, update time) relate to each other through coordinated views and interaction.

---

## Development Workflow (Solo)
`main` is always kept stable and deployable. New features are built on feature branches and merged into `main` only when working.

Current branches:
- `feature/leaflet-map-base`

Future probable branches:
- `feature/color-by-modes`
- `feature/timeline-view`
- `feature/attribute-charts`
- `feature/linked-brushing`

---

## Repo Structure (Planned)
- `index.html` — layout + containers  
- `style.css` — layout + typography  
- `js/` — app code (state, map view, timeline view, charts, interactions)  
- `data/` — dataset notes + (optional) small sample CSV  
- `docs/` — sketches + planning artifacts

---

## Data Notes
The raw dataset is currently **not committed** by default.  
Place the raw CSV locally in `data/raw/` and follow `data/README_DATA.md` for expected columns and preprocessing notes.

**Data file (local):** `data/raw/311_service_requests.csv`  

---

## How to Run Locally
[UPDATING SOON]

### Option A: Python
```bash
python -m http.server 8000
