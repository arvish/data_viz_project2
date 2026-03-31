"""
Preprocess Cincinnati 311 data for Project 2 (Level 6–7).

This script:
- Reads the full Cincinnati 311 CSV (or ZIP containing it)
- Selects the top N service types (SR_TYPE_DESC) by frequency for a chosen year
- Keeps rows even if GPS coords are missing (needed for non-map charts)
- Writes a smaller CSV for the web app + an expanded meta.json

Usage examples:
  python scripts/preprocess_multi.py --zip "Cincinnati_311_(Non-Emergency)_Service_Requests_20260227.zip"
  python scripts/preprocess_multi.py --csv "Cincinnati_311_(Non-Emergency)_Service_Requests_20260227.csv"
  python scripts/preprocess_multi.py --csv "data/Cincinnati_311.csv" --top_n 16 --out_csv "data/311_multi_2025_top16.csv"

Notes:
- DATE_CREATED is parsed using the city export format: "YYYY Mon DD HH:MM:SS AM/PM"
- Derived fields:
  update_delay_days = DATE_LAST_UPDATE - DATE_CREATED (days)
  week_start = Monday of DATE_CREATED week
  month = YYYY-MM
"""

import argparse
import json
import zipfile
from pathlib import Path

import pandas as pd

DATE_FMT = "%Y %b %d %I:%M:%S %p"

USECOLS = [
  "SR_NUMBER","SR_TYPE","SR_TYPE_DESC","PRIORITY","DEPT_NAME","METHOD_RECEIVED","NEIGHBORHOOD",
  "ADDRESS","LOCATION","DATE_CREATED","TIME_RECEIVED","DATE_LAST_UPDATE","DATE_CLOSED",
  "SR_STATUS","PLANNED_COMPLETION_DAYS","LATITUDE","LONGITUDE"
]

def parse_dt(s):
  if pd.isna(s) or s == "":
    return pd.NaT
  return pd.to_datetime(s, format=DATE_FMT, errors="coerce")

def load_df(args):
  if args.csv:
    return pd.read_csv(args.csv, usecols=USECOLS, low_memory=False)
  zf = zipfile.ZipFile(args.zip)
  names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
  if not names:
    raise RuntimeError("No CSV found in zip")
  with zf.open(names[0]) as f:
    return pd.read_csv(f, usecols=USECOLS, low_memory=False)

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--zip", type=str, default=None, help="ZIP containing the full CSV")
  ap.add_argument("--csv", type=str, default=None, help="Path to the full CSV")
  ap.add_argument("--year", type=int, default=2025, help="Year to filter using DATE_CREATED")
  ap.add_argument("--top_n", type=int, default=16, help="Top N SR_TYPE_DESC to keep")
  ap.add_argument("--out_csv", type=str, default="data/311_multi_2025_top16.csv", help="Output CSV path")
  ap.add_argument("--out_meta", type=str, default="data/meta.json", help="Output meta.json path")
  args = ap.parse_args()

  if not args.zip and not args.csv:
    raise SystemExit("Provide --zip or --csv")

  df = load_df(args)

  # parse dates
  for c in ["DATE_CREATED","DATE_LAST_UPDATE","DATE_CLOSED"]:
    df[c] = df[c].apply(parse_dt)

  df = df[df["DATE_CREATED"].dt.year == args.year].copy()

  # choose top N types
  counts = df["SR_TYPE_DESC"].value_counts(dropna=True)
  top_types = list(counts.head(args.top_n).index)
  df = df[df["SR_TYPE_DESC"].isin(top_types)].copy()

  # derived fields
  df["update_delay_days"] = (df["DATE_LAST_UPDATE"] - df["DATE_CREATED"]).dt.total_seconds() / 86400
  df["update_delay_days"] = df["update_delay_days"].round(2)

  df["created_date"] = df["DATE_CREATED"].dt.date.astype(str)
  df["week_start"] = (df["DATE_CREATED"] - pd.to_timedelta(df["DATE_CREATED"].dt.weekday, unit="D")).dt.date.astype(str)
  df["month"] = df["DATE_CREATED"].dt.to_period("M").astype(str)

  df["PLANNED_COMPLETION_DAYS"] = pd.to_numeric(df["PLANNED_COMPLETION_DAYS"], errors="coerce")

  out_cols = [
    "SR_NUMBER","SR_TYPE","SR_TYPE_DESC","PRIORITY","DEPT_NAME","METHOD_RECEIVED","NEIGHBORHOOD",
    "ADDRESS","LOCATION","DATE_CREATED","TIME_RECEIVED","DATE_LAST_UPDATE","DATE_CLOSED",
    "SR_STATUS","PLANNED_COMPLETION_DAYS","update_delay_days","LATITUDE","LONGITUDE",
    "created_date","week_start","month"
  ]
  out = df[out_cols].copy()

  for c in ["DATE_CREATED","DATE_LAST_UPDATE","DATE_CLOSED"]:
    out[c] = out[c].dt.strftime("%Y-%m-%dT%H:%M:%S")

  out_path = Path(args.out_csv)
  out_path.parent.mkdir(parents=True, exist_ok=True)
  out.to_csv(out_path, index=False)

  has_coords = out["LATITUDE"].notna() & out["LONGITUDE"].notna()
  type_counts = out["SR_TYPE_DESC"].value_counts().to_dict()

  meta = {
    "year": args.year,
    "total_requests": int(len(out)),
    "mappable_requests": int(has_coords.sum()),
    "missing_coords": int((~has_coords).sum()),
    "date_range": [str(out["created_date"].min()), str(out["created_date"].max())],
    "service_types_included": list(type_counts.keys()),
    "service_type_counts": {k:int(v) for k,v in type_counts.items()},
    "note": f"Subset: top {args.top_n} SR_TYPE_DESC by count in {args.year}. Derived fields: update_delay_days (days), week_start Monday."
  }

  meta_path = Path(args.out_meta)
  meta_path.parent.mkdir(parents=True, exist_ok=True)
  meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

  print(f"Wrote {out_path} and {meta_path}")

if __name__ == "__main__":
  main()
