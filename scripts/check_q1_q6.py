"""Independent check of the Q1 to Q6 answers on the report page (index.html).

The page computes these numbers in the browser from data/college_town_home_sales.csv.
This script recomputes them with pandas, so the two can be compared.

Run from the repository root:

    python3 scripts/check_q1_q6.py

It only reads the CSV and prints results. It does not write any file.

Rules (from AGENTS.md and the report):
- Valid price: 10,000 <= sale_price <= 5,000,000. Q2 and Q3 also use all rows.
- City = city + ", " + state (18 values). Campus area = university (11 values).
- Days on market = contract_date - list_date, in days, only rows with both dates.
- Year comes from sale_date. Median unless the question asks for a mean.
- Dollars are rounded to whole dollars. Days, miles and percents to one decimal.
"""

import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pandas as pd

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "college_town_home_sales.csv"
PRICE_MIN = 10_000
PRICE_MAX = 5_000_000


def half_up(value, places):
    """Round like the page does (half away from zero), not Python's banker's rounding."""
    quantum = Decimal(1).scaleb(-places)
    return float(Decimal(repr(float(value))).quantize(quantum, rounding=ROUND_HALF_UP))


def money(value):
    return f"${half_up(value, 0):,.0f}"


def one(value):
    return f"{half_up(value, 1):,.1f}"


def ties_top(series, largest=True):
    """Return every label that ties for the highest (or lowest) value."""
    best = series.max() if largest else series.min()
    return [label for label, value in series.items() if value == best]


def main():
    df = pd.read_csv(
        CSV_PATH,
        dtype={"zipcode": str, "county_fips": str, "parcel_number": str},
        keep_default_na=True,
    )
    df["city_label"] = df["city"].str.strip() + ", " + df["state"].str.strip()
    df["campus"] = df["university"]
    df["valid"] = df["sale_price"].between(PRICE_MIN, PRICE_MAX, inclusive="both")
    df["sale_dt"] = pd.to_datetime(df["sale_date"], format="%Y-%m-%d", errors="coerce")
    df["list_dt"] = pd.to_datetime(df["list_date"], format="%Y-%m-%d", errors="coerce")
    df["contract_dt"] = pd.to_datetime(df["contract_date"], format="%Y-%m-%d", errors="coerce")
    df["sale_year"] = df["sale_dt"].dt.year

    valid = df[df["valid"]]
    print(f"Rows: {len(df):,}. Valid-price rows: {len(valid):,}.")
    print(f"Cities: {df['city_label'].nunique()}. Campus areas: {df['campus'].nunique()}.")
    print()

    # Q1: median sale price by city, valid prices
    q1 = valid.groupby("city_label")["sale_price"].median().sort_values(ascending=False)
    top_cities = ties_top(q1, largest=True)
    print("Q1. Highest median sale price (valid prices):")
    print("   Top city(ies):", ", ".join(top_cities), "at", money(q1.max()))
    print("   All cities:")
    for label, value in q1.items():
        print(f"     {label:<22} {money(value):>12}  n={int((valid['city_label'] == label).sum()):,}")
    print()

    # Q2: all rows, mean vs median by city
    all_stats = df.groupby("city_label")["sale_price"].agg(["mean", "median", "count"])
    all_stats["gap_pct"] = (all_stats["mean"] - all_stats["median"]) / all_stats["median"] * 100
    top_gap = ties_top(all_stats["gap_pct"], largest=True)
    print("Q2. Mean furthest above median, all rows (gap as % of median):")
    print("   Top city(ies):", ", ".join(top_gap), "gap", one(all_stats.loc[top_gap[0], "gap_pct"]) + "%")
    print("   All cities (mean, median, gap %, n):")
    for label, row in all_stats.sort_values("gap_pct", ascending=False).iterrows():
        print(
            f"     {label:<22} mean {money(row['mean']):>12}  median {money(row['median']):>10}"
            f"  gap {one(row['gap_pct']):>6}%  n={int(row['count']):,}"
        )
    for label in top_gap:
        city_rows = df[df["city_label"] == label]
        above = city_rows[city_rows["sale_price"] > PRICE_MAX]
        below = city_rows[city_rows["sale_price"] < PRICE_MIN]
        print(
            f"   {label}: {len(above)} sales above $5,000,000 (max {money(city_rows['sale_price'].max())}),"
            f" {len(below)} sales below $10,000 (min {money(city_rows['sale_price'].min())})."
        )
    print()

    # Q3: rank by mean, all rows vs valid only (rank 1 = highest mean)
    mean_all = df.groupby("city_label")["sale_price"].mean()
    mean_valid = valid.groupby("city_label")["sale_price"].mean()
    rank_all = mean_all.rank(ascending=False, method="min").astype(int)
    rank_valid = mean_valid.rank(ascending=False, method="min").astype(int)
    print("Q3. Rank by mean sale price (1 = highest):")
    changed = []
    for label in rank_valid.sort_values().index:
        move = rank_all[label] - rank_valid[label]
        if move != 0:
            changed.append((label, rank_all[label], rank_valid[label], move))
        print(
            f"     {label:<22} all rows #{rank_all[label]:<3} ({money(mean_all[label]):>12})"
            f"  valid #{rank_valid[label]:<3} ({money(mean_valid[label]):>12})  change {move:+d}"
        )
    print(f"   Cities that change rank: {len(changed)}")
    for label, ra, rv, move in changed:
        print(f"     {label}: #{ra} -> #{rv}  ({abs(move)} position{'s' if abs(move) != 1 else ''})")
    print()

    # Q4: median sale price by campus, 2024 vs 2025, valid prices
    by_year = (
        valid[valid["sale_year"].isin([2024, 2025])]
        .groupby(["campus", "sale_year"])["sale_price"]
        .median()
        .unstack()
    )
    by_year["pct_change"] = (by_year[2025] - by_year[2024]) / by_year[2024] * 100
    print("Q4. Median sale price, 2024 to 2025, valid prices:")
    for campus, row in by_year.sort_values("pct_change", ascending=False).iterrows():
        print(
            f"     {campus:<50} 2024 {money(row[2024]):>10}  2025 {money(row[2025]):>10}"
            f"  change {one(row['pct_change']):>6}%"
        )
    up = ties_top(by_year["pct_change"], largest=True)
    down = by_year[by_year["pct_change"] < 0].index.tolist()
    print("   Largest increase:", ", ".join(up), f"({one(by_year.loc[up[0], 'pct_change'])}%)")
    print("   Decreases:", ", ".join(down) if down else "none")
    print()

    # Q5: median days on market by campus, valid prices, both dates present
    dom_rows = valid[valid["list_dt"].notna() & valid["contract_dt"].notna()].copy()
    dom_rows["dom"] = (dom_rows["contract_dt"] - dom_rows["list_dt"]).dt.days
    q5 = dom_rows.groupby("campus")["dom"].agg(["median", "count"]).sort_values("median")
    slowest = ties_top(q5["median"], largest=True)
    fastest = ties_top(q5["median"], largest=False)
    print("Q5. Median days on market by campus (valid prices, both dates):")
    for campus, row in q5.sort_values("median", ascending=False).iterrows():
        print(f"     {campus:<50} median {one(row['median']):>6} days  n={int(row['count']):,}")
    print("   Slowest:", ", ".join(slowest), f"({one(q5.loc[slowest[0], 'median'])} days)")
    print("   Fastest:", ", ".join(fastest), f"({one(q5.loc[fastest[0], 'median'])} days)")
    print()

    # Q6: median annual tax as % of sale price, valid prices, 0 < tax < sale price
    tax_rows = valid[(valid["tax_annual_amount"] > 0) & (valid["tax_annual_amount"] < valid["sale_price"])].copy()
    tax_rows["tax_pct"] = tax_rows["tax_annual_amount"] / tax_rows["sale_price"] * 100
    q6 = tax_rows.groupby("campus")["tax_pct"].agg(["median", "count"]).sort_values("median")
    highest = ties_top(q6["median"], largest=True)
    lowest = ties_top(q6["median"], largest=False)
    print("Q6. Median annual tax as % of sale price by campus:")
    for campus, row in q6.sort_values("median", ascending=False).iterrows():
        print(f"     {campus:<50} median {one(row['median']):>5}%  n={int(row['count']):,}")
    print("   Highest tax burden:", ", ".join(highest), f"({one(q6.loc[highest[0], 'median'])}%)")
    print("   Lowest tax burden:", ", ".join(lowest), f"({one(q6.loc[lowest[0], 'median'])}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
