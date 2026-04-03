# Cincinnati 3-1-1 Visual Explorer (Project 2)

**Creator:** Arvish Pandey  
**Course:** Data Visualization  
**Stack:** D3.js + JavaScript + HTML + CSS, Leaflet  
**Status:** Solo project, publicly hosted, tested in Chrome

---

## Links
**Live application:** [Live Netlify](https://cincy311.netlify.app/)  
**GitHub repository:** [GitHub Repo](https://github.com/arvish/data_viz_project2)  
**Demo video:** [YouTube](https://youtu.be/CawzMJdiuD4)

**Screenshots:**  
[PLACEHOLDER: Insert 3 to 6 screenshots showing the map, timeline, attribute charts, brushing, service type toggles, and heatmap]

**Sketches:**  
[PLACEHOLDER: Insert a photo or scan of your dashboard layout sketch and interaction sketch]

---

## 1) Motivation
Cincinnati 3-1-1 service requests are a practical window into how a city experiences problems, reports them, and gets them resolved. The goal of this application is to help a general audience explore 3-1-1 requests through multiple coordinated views so they can answer questions like:

- Where are requests concentrated, and how does that pattern change by category or priority?
- When do requests spike, and are those spikes seasonal or event-driven?
- Which neighborhoods, departments, and intake methods dominate the workload?
- What changes when you focus on a specific subset, such as one service type, one neighborhood, or one time window?

This is an exploratory tool. It is designed to surface patterns and outliers and support follow-up questions, rather than claiming causal explanations.

---

## 2) Data
This project uses the City of Cincinnati open dataset:

**Cincinnati 311 Non-Emergency Service Requests:**  
[PLACEHOLDER: Link the dataset page]  
Suggested link: https://data.cincinnati-oh.gov/efficient-service-delivery/Cincinnati-311-Non-Emergency-Service-Requests/gcej-gmiw/about_data

The full dataset includes service request records with attributes such as service type, department, priority, neighborhood, request method, and timestamps. Some requests include GPS coordinates (latitude and longitude). Some requests do not include coordinates. Those records are still retained for non-map views where location is not required.

### Preprocessing and why it exists
The raw dataset is large. Loading and parsing it directly in the browser can slow development and can introduce inconsistent performance. To keep the interactive experience stable, the project uses reproducible preprocessing scripts to generate smaller, analysis-ready CSV files:

- A focused single service type extract for early levels (Level 1 and Level 2)
- A multi-type extract for later levels (Level 6 and Level 7), typically using the top N most frequent service types

These extracts are derived from the raw file and can be regenerated at any time.

---

## 3) Sketches
Sketching was used to plan a one-page dashboard layout that keeps related views visible together for linked interactions. The sketches show:

- A left anchor view for the Leaflet map and its legend and controls
- A timeline view that supports brushing a time window
- A grid of attribute charts to filter and compare categories
- A details and status area to explain selection state and summarize counts

[PLACEHOLDER: Insert sketch image and add a one-sentence caption describing the layout intent]

---

## 4) Visualization components and interactions

### 4.1 Overview
The application is a single-page dashboard. It includes a map, a timeline, and multiple attribute charts. All views are coordinated so that selection in one view updates the others.

[PLACEHOLDER: Screenshot of full dashboard layout]

### 4.2 Map view (Leaflet + D3 points)
The map shows service request locations as points, positioned by latitude and longitude. A default center and zoom are set so Cincinnati is visible immediately. Zoom out is limited so the user stays in a meaningful geographic context.

**Details on demand:** Hovering a point reveals request details including request date, last update date, department, and descriptive information.

**Color by options:** The point colors can encode different attributes:
- Time between created date and last update date (quantitative, sequential scale)
- Neighborhood (nominal, categorical scale with a top-k plus “Other” approach)
- Priority (ordinal, ordered categorical palette)
- Department responsible (nominal, categorical scale)
- Service type (nominal, categorical scale, used in Level 6)

**Map backgrounds:** Users can toggle map tiles between multiple base layers (for example dark, light, and streets).

[PLACEHOLDER: Screenshot of map with tooltip visible]  
[PLACEHOLDER: Screenshot showing color-by changes]

### 4.3 Timeline (calls over the year)
The timeline shows the number of requests for the selected subset across the year. The implementation uses a time binning choice (for example weekly) so trends and variation are visible without clutter.

**Details on demand:** Hovering on a bin shows the time window and the number of requests.

**Linked interaction:** Brushing a time window filters the map points and all attribute charts to the selected time range.

[PLACEHOLDER: Screenshot of timeline with tooltip]  
[PLACEHOLDER: Screenshot of timeline brushing selecting a window]

### 4.4 Attribute views (Level 3)
Dedicated charts show category distributions, not just map encoding. These views support both understanding and filtering:

- Neighborhoods with the most requests
- Most common request intake methods (method received)
- Departments responsible for the most requests
- Requests by priority level
- Service type volume chart (added in Level 6)

Each attribute chart supports selection, for example clicking a bar filters the dataset to that category. Active filters are summarized in the UI and can be cleared.

[PLACEHOLDER: Screenshot of attribute chart grid]  
[PLACEHOLDER: Screenshot showing a category filter applied]

### 4.5 Linked interactions (Level 4)
Selections are linked across all views:
- Timeline brushing filters map points and attribute charts
- Clicking an attribute category filters timeline, map, and the other attribute charts
- Service type toggles update all views
- A clear filters action returns the dashboard to the full current dataset scope

This supports questions like, “Where are high priority requests clustered during late-year spikes?”

[PLACEHOLDER: Screenshot showing linked filtering across multiple views]

### 4.6 Map brushing (Level 5)
The map includes a brush interaction to select a spatial subset of points. Once selected, all other views update to show only the requests within the selected area, including the timeline and attribute distributions.

[PLACEHOLDER: Screenshot of map brush selection box and updated charts]

### 4.7 More service types with toggles and color picker (Level 6)
The dashboard supports multiple service types at once. Points can be colored by service type. Users can turn service types on or off, and can customize colors with a web color picker. The service type selection updates all views and is saved for convenience.

[PLACEHOLDER: Screenshot of service type toggles and color picker]

### 4.8 Heatmap layer (Level 7)
A heatmap layer aggregates point density across the map. It can be displayed as heatmap only or combined with points. Heatmap behavior respects all linked interactions, including timeline brushing, attribute selection, service type toggles, and map brushing.

[PLACEHOLDER: Screenshot of heatmap mode]

---

## 5) What the application enables you to discover (example findings)
Replace these with findings you actually observe and support each with a screenshot.

**Finding 1:** [PLACEHOLDER: Describe a clear seasonal or monthly spike pattern in requests, and mention the service type context]  
[PLACEHOLDER: Screenshot supporting Finding 1]

**Finding 2:** [PLACEHOLDER: Describe which neighborhoods dominate the selected service type, and how that changes when you brush a time window]  
[PLACEHOLDER: Screenshot supporting Finding 2]

**Finding 3:** [PLACEHOLDER: Describe how high priority requests differ spatially or temporally from all requests]  
[PLACEHOLDER: Screenshot supporting Finding 3]

**Finding 4 (optional):** [PLACEHOLDER: Describe a heatmap-only insight, for example a hotspot that is less obvious with points]  
[PLACEHOLDER: Screenshot supporting Finding 4]

---

## 6) Process, code structure, and how to run

### Libraries and tools
- Leaflet for the base map and tile layers
- D3.js for SVG rendering, scales, axes, tooltips, brushing, and linked interactions
- Python (pandas) for preprocessing the CSV data into analysis-ready extracts

### Code structure (high level)
- `index.html` defines the layout and containers
- `style.css` defines the dashboard visual style and spacing
- `js/main.js` manages shared state, data loading, filtering, and rendering
- `scripts/` contains preprocessing scripts that generate the `data/` extracts used by the app

### Running locally
From the project root, start a local server:

```bash
python -m http.server 8000
```

Then open in Chrome:
`http://localhost:8000`

### Preprocessing workflows
Raw dataset location in this repository:
`data/Cincinnati_311.csv`

Focused single-type output (used early):
`data/pothole_2025.csv` and `data/meta.json`  
Generated by: `scripts/preprocess_pothole.py`

Multi-type output (used for Level 6 and Level 7):
`data/311_multi_2025_topN.csv` and `data/meta.json`  
Generated by: `scripts/preprocess_multi.py`

[PLACEHOLDER: Add the exact commands you used to run preprocessing]

---

## 7) Challenges and future work

### Challenges
Handling a large civic dataset required careful decisions about performance, usability, and correctness. Some records do not have coordinates, which required separating the mappable subset from the full dataset while keeping the full dataset available for non-map charts. Another challenge was building linked interactions across multiple views in a way that remains predictable and understandable for a first-time user.

### Future work
A next step would be richer time exploration, such as a year slider or animated playback, and additional aggregation options such as per-day versus per-week binning. Another improvement would be more advanced clustering for extremely dense point sets and additional map-based selection tools.

---

## 8) Use of AI and collaboration, who did what

### Use of AI
AI tools were used to accelerate development and reduce iteration time. This included brainstorming chart choices aligned to the rubric, designing interaction logic for brushing and linking, debugging Leaflet and D3 integration issues, and refining UI layout choices to keep the dashboard readable on one page. All final integration, testing in Chrome, and dataset selection decisions were verified in the working application.

### Collaboration, solo context
This project was completed individually. No direct peer collaboration was used beyond general course discussion and publicly available reference materials.

### Who did what
All planning, preprocessing, implementation, debugging, and deployment steps were completed by Arvish Pandey as a solo project.

---

## Demo video checklist (2 to 3 minutes)
[PLACEHOLDER: Insert your demo video link above]

Suggested demo flow:
1. Open the app and state the goal in one sentence
2. Show the map tooltip and color-by options
3. Brush the timeline and show linked filtering
4. Click an attribute bar and show coordinated updates
5. Toggle service types and show custom color picker
6. Switch to heatmap mode and summarize one insight
