"""Replicates the xlsx formula logic (US never uplifted; non-US carries the
promo uplift; both rescaled together against the fixed monthly target) in
plain Python to cross-check correctness without LibreOffice."""
import csv
import sys
from datetime import date, timedelta

TOTAL_CSV = sys.argv[1]
US_CSV = sys.argv[2]
TARGET = 3125608605
P_FROM, P_TO, P_MULT = date(2026, 8, 10), date(2026, 8, 23), 1.8


def load_csv(path):
    with open(path, encoding="utf-8") as f:
        return {rec["date"]: float(rec["amount"]) for rec in csv.DictReader(f)}


total_map = load_csv(TOTAL_CSV)
us_map = load_csv(US_CSV)

rows = []
for dstr, total in total_map.items():
    y, m, d_ = dstr.split("-")
    d = date(int(y), int(m), int(d_))
    us = us_map[dstr]
    rows.append((d, d.isoweekday() % 7, us, total - us))

us_sum = {d: 0.0 for d in range(7)}
us_cnt = {d: 0 for d in range(7)}
nonus_sum = {d: 0.0 for d in range(7)}
for d, dow, us, nonus in rows:
    us_sum[dow] += us
    nonus_sum[dow] += nonus
    us_cnt[dow] += 1
us_avg = {d: us_sum[d] / us_cnt[d] for d in range(7)}
nonus_avg = {d: nonus_sum[d] / us_cnt[d] for d in range(7)}

aug = []
cur = date(2026, 8, 1)
while cur <= date(2026, 8, 31):
    dow = cur.isoweekday() % 7
    mult = P_MULT if P_FROM <= cur <= P_TO else 1.0
    us_idx = us_avg[dow]
    nonus_idx = nonus_avg[dow] * mult
    aug.append({"date": cur, "dow": dow, "mult": mult, "us_idx": us_idx, "nonus_idx": nonus_idx, "total_idx": us_idx + nonus_idx})
    cur += timedelta(days=1)

grand_idx = sum(r["total_idx"] for r in aug)

for r in aug:
    r["us_amt"] = round(r["us_idx"] / grand_idx * TARGET)
    r["nonus_amt"] = round(r["nonus_idx"] / grand_idx * TARGET)

us_total_all = sum(r["us_amt"] for r in aug)
nonus_total_first30 = sum(r["nonus_amt"] for r in aug[:-1])
aug[-1]["nonus_amt"] = TARGET - us_total_all - nonus_total_first30

us_total = sum(r["us_amt"] for r in aug)
nonus_total = sum(r["nonus_amt"] for r in aug)
grand_total = us_total + nonus_total
print(f"us_total={us_total:,} nonus_total={nonus_total:,} grand_total={grand_total:,} target={TARGET:,} match={grand_total == TARGET}")

for r in aug:
    print(f"{r['date']} dow={r['dow']} mult={r['mult']}x us={r['us_amt']:,} non_us={r['nonus_amt']:,} total={r['us_amt']+r['nonus_amt']:,}")

promo_us = sum(r["us_amt"] for r in aug if r["mult"] > 1)
promo_nonus = sum(r["nonus_amt"] for r in aug if r["mult"] > 1)
print(f"\n프로모션 구간 미국 합계(업리프트 미적용): {promo_us:,}")
print(f"프로모션 구간 미국외 합계(업리프트 적용): {promo_nonus:,}")
