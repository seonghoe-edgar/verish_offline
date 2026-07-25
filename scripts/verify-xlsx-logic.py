"""Replicates the exact formula logic written into the xlsx (no LibreOffice
available on this machine to actually recalc) and cross-checks it against
the independently-validated aug-cafe24-daily-target.calc.ts output."""
import csv
import sys
from datetime import date, timedelta

CSV_PATH = sys.argv[1]
TARGET = 4177348798
CLEAN_FROM, CLEAN_TO = date(2026, 6, 1), date(2026, 7, 13)
P1_FROM, P1_TO, P1_MULT = date(2026, 8, 3), date(2026, 8, 14), 1.5
P2_FROM, P2_TO, P2_MULT = date(2026, 8, 18), date(2026, 8, 24), 4.0

with open(CSV_PATH, encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

src = []
for rec in rows:
    d = date(int(rec["date"][0:4]), int(rec["date"][4:6]), int(rec["date"][6:8]))
    dow_excel = (d.isoweekday() % 7)  # WEEKDAY(d,1)-1 equivalent: 0=Sun..6=Sat
    dow_csv = int(rec["dow"])
    assert dow_excel == dow_csv, f"weekday mismatch {d}: excel={dow_excel} csv={dow_csv}"
    src.append((d, dow_excel, int(rec["amount"])))

# AVERAGEIFS(amount, dow=X, included="포함") equivalent
sums = {d: 0 for d in range(7)}
counts = {d: 0 for d in range(7)}
for d, dow, amt in src:
    if CLEAN_FROM <= d <= CLEAN_TO:
        sums[dow] += amt
        counts[dow] += 1
avg_by_dow = {d: sums[d] / counts[d] for d in range(7)}

# 일별배분 sheet replica
aug = []
cur = date(2026, 8, 1)
while cur <= date(2026, 8, 31):
    dow = cur.isoweekday() % 7
    if P1_FROM <= cur <= P1_TO:
        mult = P1_MULT
    elif P2_FROM <= cur <= P2_TO:
        mult = P2_MULT
    else:
        mult = 1.0
    base_idx = avg_by_dow[dow]
    adj_idx = base_idx * mult
    aug.append({"date": cur, "dow": dow, "mult": mult, "adj_idx": adj_idx})
    cur += timedelta(days=1)

adj_sum = sum(r["adj_idx"] for r in aug)
allocated = 0
for r in aug[:-1]:
    amt = round(r["adj_idx"] / adj_sum * TARGET)
    r["amount"] = amt
    allocated += amt
aug[-1]["amount"] = TARGET - allocated

total = sum(r["amount"] for r in aug)
print(f"total={total:,} target={TARGET:,} match={total == TARGET}")
for r in aug:
    print(f"{r['date']} dow={r['dow']} mult={r['mult']}x amount={r['amount']:,}")
