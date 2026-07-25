"""Replicates the xlsx formula logic in plain Python to cross-check correctness
without LibreOffice (not installed on this machine)."""
import csv
import sys
from datetime import date, timedelta

CSV_PATH = sys.argv[1]
TARGET = 3125608605
P_FROM, P_TO, P_MULT = date(2026, 8, 10), date(2026, 8, 23), 1.8
US_USD = 1285765.44
TOTAL_USD = 3858590.78
US_SHARE = US_USD / TOTAL_USD

with open(CSV_PATH, encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

src = []
for rec in rows:
    y, m, d_ = rec["date"].split("-")
    d = date(int(y), int(m), int(d_))
    dow_excel = d.isoweekday() % 7  # WEEKDAY(d,1)-1 equivalent
    src.append((d, dow_excel, float(rec["amount"])))

sums = {d: 0.0 for d in range(7)}
counts = {d: 0 for d in range(7)}
for d, dow, amt in src:
    sums[dow] += amt
    counts[dow] += 1
avg_by_dow = {d: sums[d] / counts[d] for d in range(7)}

aug = []
cur = date(2026, 8, 1)
while cur <= date(2026, 8, 31):
    dow = cur.isoweekday() % 7
    mult = P_MULT if P_FROM <= cur <= P_TO else 1.0
    base_idx = avg_by_dow[dow]
    aug.append({"date": cur, "dow": dow, "mult": mult, "adj_idx": base_idx * mult})
    cur += timedelta(days=1)

adj_sum = sum(r["adj_idx"] for r in aug)
allocated = 0
for r in aug[:-1]:
    amt = round(r["adj_idx"] / adj_sum * TARGET)
    r["amount"] = amt
    allocated += amt
aug[-1]["amount"] = TARGET - allocated

for r in aug:
    r["us_amount"] = round(r["amount"] * US_SHARE)
    r["non_us_amount"] = r["amount"] - r["us_amount"]

total = sum(r["amount"] for r in aug)
us_total = sum(r["us_amount"] for r in aug)
non_us_total = sum(r["non_us_amount"] for r in aug)
print(f"total={total:,} target={TARGET:,} match={total == TARGET}")
print(f"us_share={US_SHARE:.4%} us_total={us_total:,} non_us_total={non_us_total:,} sum_check={us_total+non_us_total:,}")
for r in aug:
    print(f"{r['date']} dow={r['dow']} mult={r['mult']}x amount={r['amount']:,} us={r['us_amount']:,} non_us={r['non_us_amount']:,}")
