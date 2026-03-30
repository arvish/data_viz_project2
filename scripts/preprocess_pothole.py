"""
Preprocess Cincinnati 311 data for Project 2 (Level 1–2).

This script:
- Reads the full Cincinnati 311 CSV (or the ZIP containing it)
- Filters to one service type (default: 'POTHOLE, REPAIR')
- Keeps rows even if they are missing GPS coords (required by the assignment)
- Writes a smaller CSV for the web app + a meta.json summary

Usage examples:
  python scripts/preprocess_pothole.py --zip "Cincinnati_311_(Non-Emergency)_Service_Requests_20260227.zip"
  python scripts/preprocess_pothole.py --csv "Cincinnati_311_(Non-Emergency)_Service_Requests_20260227.csv"
"""

import argparse
import json
import zipfile
from pathlib import Path

import pandas as pd

DEFAULT_SERVICE_TYPE = 'POTHOLE, REPAIR'

DATE_FMT = "%Y %b %d %I:%M:%S %p"

USECOLS = [
  "SR_NUMBER","SR_TYPE_DESC","PRIORITY","DEPT_NAME","METHOD_RECEIVED","NEIGHBORHOOD",
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
  ap.add_argument("--service", type=str, default=DEFAULT_SERVICE_TYPE, help="SR_TYPE_DESC to filter")
  ap.add_argument("--outdir", type=str, default="data", help="Output directory")
  args = ap.parse_args()

  if not args.zip and not args.csv:
    raise SystemExit("Provide --zip or --csv")

  outdir = Path(args.outdir)
  outdir.mkdir(parents=True, exist_ok=True)

  df = load_df(args)
  df = df[df["SR_TYPE_DESC"] == args.service].copy()

  for c in ["DATE_CREATED","DATE_LAST_UPDATE","DATE_CLOSED"]:
    df[c] = df[c].apply(parse_dt)

  df["update_delay_days"] = (df["DATE_LAST_UPDATE"] - df["DATE_CREATED"]).dt.total_seconds() / 86400
  df["update_delay_days"] = df["update_delay_days"].round(2)

  df["created_date"] = df["DATE_CREATED"].dt.date.astype(str)
  df["week_start"] = (df["DATE_CREATED"] - pd.to_timedelta(df["DATE_CREATED"].dt.weekday, unit="D")).dt.date.astype(str)
  df["month"] = df["DATE_CREATED"].dt.to_period("M").astype(str)

  df["PLANNED_COMPLETION_DAYS"] = pd.to_numeric(df["PLANNED_COMPLETION_DAYS"], errors="coerce")

  out_csv = outdir / "pothole_2025.csv"
  df_out_cols = [
    "SR_NUMBER","SR_TYPE_DESC","PRIORITY","DEPT_NAME","METHOD_RECEIVED","NEIGHBORHOOD",
    "ADDRESS","LOCATION","DATE_CREATED","TIME_RECEIVED","DATE_LAST_UPDATE","DATE_CLOSED",
    "SR_STATUS","PLANNED_COMPLETION_DAYS","update_delay_days","LATITUDE","LONGITUDE",
    "created_date","week_start","month"
  ]
  out = df[df_out_cols].copy()
  for c in ["DATE_CREATED","DATE_LAST_UPDATE","DATE_CLOSED"]:
    out[c] = out[c].dt.strftime("%Y-%m-%dT%H:%M:%S")

  out.to_csv(out_csv, index=False)

  has_coords = out["LATITUDE"].notna() & out["LONGITUDE"].notna()
  meta = {
    "service_type_desc": args.service,
    "year": int(pd.to_datetime(out["created_date"]).dt.year.mode()[0]) if len(out) else None,
    "total_requests": int(len(out)),
    "mappable_requests": int(has_coords.sum()),
    "missing_coords": int((~has_coords).sum()),
    "date_range": [str(out["created_date"].min()), str(out["created_date"].max())],
    "note": "Derived fields: update_delay_days = DATE_LAST_UPDATE - DATE_CREATED in days; week_start is Monday."
  }

  with open(outdir / "meta.json", "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)

  print(f"Wrote {out_csv} and meta.json")

if __name__ == "__main__":
  main()
