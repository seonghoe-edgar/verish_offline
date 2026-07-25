import csv
import sys
from datetime import date, timedelta

CSV_PATH = sys.argv[1]
TARGET = 1823000000
CLEAN_FROM, CLEAN_TO = "20260601", "20260713"
FIXED_DATE = date(2026, 8, 3)
FIXED_AMOUNT = 47000000

with open(CSV_PATH, encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

clean = [r for r in rows if CLEAN_FROM <= r["date"] <= CLEAN_TO]
sums = {d: 0 for d in range(7)}
counts = {d: 0 for d in range(7)}
for r in clean:
    dow = int(r["dow"])
    sums[dow] += int(r["amount"])
    counts[dow] += 1
avg_by_dow = {d: sums[d] / counts[d] for d in range(7)}

aug = []
cur = date(2026, 8, 1)
while cur <= date(2026, 8, 31):
    dow = cur.isoweekday() % 7
    aug.append({"date": cur, "dow": dow, "idx": avg_by_dow[dow], "fixed": cur == FIXED_DATE})
    cur += timedelta(days=1)

remaining = TARGET - FIXED_AMOUNT
idx_sum_excl = sum(r["idx"] for r in aug if not r["fixed"])

for r in aug:
    if r["fixed"]:
        r["amount"] = FIXED_AMOUNT
    else:
        r["amount"] = round(r["idx"] / idx_sum_excl * remaining)

non_fixed = [r for r in aug if not r["fixed"]]
sum_non_fixed = sum(r["amount"] for r in non_fixed)
non_fixed[-1]["amount"] += remaining - sum_non_fixed

total = sum(r["amount"] for r in aug)
print(f"total={total:,} target={TARGET:,} match={total == TARGET}")
for r in aug:
    print(f"{r['date']} dow={r['dow']} {'FIXED' if r['fixed'] else ''} amount={r['amount']:,}")
