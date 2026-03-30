# Cincinnati 3-1-1 (Project 2) — Level 1–2 Implementation

This is a framework-free Leaflet + D3 web app that implements:

- **Level 1:** Interactive map of **POTHOLE, REPAIR** requests (2025), with details-on-demand tooltips and multiple “color by” modes.
- **Level 2:** Weekly timeline of requests across the year, with hover tooltips and linked highlighting back to the map.

## Run locally

From the project root:

```bash
python -m http.server 8000
```

Then open:

- http://localhost:8000

## Data

This project ships with a preprocessed dataset:

- `data/pothole_2025.csv`
- `data/meta.json`

If you want to regenerate from the full city CSV/ZIP, run:

```bash
python scripts/preprocess_pothole.py --zip "Cincinnati_311_(Non-Emergency)_Service_Requests_20260227.zip"
```

(Or use `--csv` if you have the CSV extracted.)

## Notes on “color by”

- **Time between created and last update:** quantitative, sequential scale (`d3.interpolateCividis`)
- **Neighborhood:** nominal, categorical palette for top neighborhoods plus an “Other” bucket
- **Priority:** ordinal-ish, ordered palette by severity
- **Public agency:** nominal, categorical scale
