import csv
import sys
from datetime import date, timedelta

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

CSV_PATH = sys.argv[1]
OUT_PATH = sys.argv[2]

FONT_NAME = "Arial"
BLUE = Font(name=FONT_NAME, color="0000FF")
BLACK = Font(name=FONT_NAME, color="000000")
BOLD = Font(name=FONT_NAME, bold=True)
HEADER_FILL = PatternFill("solid", fgColor="D9D9D9")
YELLOW = PatternFill("solid", fgColor="FFFF00")
DATE_FMT = "yyyy-mm-dd"
WON_FMT = "#,##0"
USD_FMT = "#,##0.00"
PCT_FMT = "0.0%"


def style_header(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = BOLD
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")


def autofit(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


wb = Workbook()

# ---------------- 가정 ----------------
ws_a = wb.active
ws_a.title = "가정"
ws_a.append(["항목", "값", "비고"])
style_header(ws_a, 1, 3)

rows_a = [
    ("8월 목표매출 (해외자사몰, 원화)", 3125608605, "사용자 제공 값"),
    ("요일비중 산출기간 시작", date(2026, 6, 1), "Shopify(verish-int.myshopify.com) 커넥터, ShopifyQL total_sales 기준"),
    ("요일비중 산출기간 종료", date(2026, 7, 24), "정산 지연 없음(CAFE24와 달리 Shopify는 실시간 집계) — 전체 기간 사용"),
    ("프로모션 시작", date(2026, 8, 10), ""),
    ("프로모션 종료", date(2026, 8, 23), ""),
    ("프로모션 업리프트 배수", 1.8, "\"매출 180%로 업리프트\" = 평시 대비 1.8배로 해석"),
    ("미국 매출(USD, 기준기간)", 1285765.44, "ShopifyQL: FROM sales SHOW total_sales GROUP BY billing_country, 6/1~7/24"),
    ("전체 매출(USD, 기준기간)", 3858590.78, "같은 쿼리의 전체 합계 (요일비중 산출과 동일 기간/데이터)"),
]
for r in rows_a:
    ws_a.append(list(r))

n_base_rows = len(rows_a)
for i, r in enumerate(range(2, 2 + n_base_rows), start=0):
    ws_a.cell(row=r, column=1).font = BLACK
    val_cell = ws_a.cell(row=r, column=2)
    val_cell.font = BLUE
    val_cell.fill = YELLOW
    note_cell = ws_a.cell(row=r, column=3)
    note_cell.font = BLACK
    note_cell.alignment = Alignment(wrap_text=True, vertical="top")
    if isinstance(rows_a[i][1], date):
        val_cell.number_format = DATE_FMT
    elif rows_a[i][0].endswith("매출") or "원화" in rows_a[i][0]:
        val_cell.number_format = WON_FMT if "원화" in rows_a[i][0] else USD_FMT
    elif "배수" in rows_a[i][0]:
        val_cell.number_format = "0.0\"x\""

us_share_row = 2 + n_base_rows
ws_a.cell(row=us_share_row, column=1, value="미국 비중(%)").font = BLACK
us_share_cell = ws_a.cell(row=us_share_row, column=2, value="=B8/B9")
us_share_cell.font = BLACK
us_share_cell.number_format = PCT_FMT
ws_a.cell(row=us_share_row, column=3, value="같은 기준기간 미국/전체 매출 비율을 8월 전 기간에 동일하게 적용 (요일별로 따로 나누지 않음)").font = BLACK
ws_a.cell(row=us_share_row, column=3).alignment = Alignment(wrap_text=True, vertical="top")

autofit(ws_a, [32, 16, 70])
ws_a.freeze_panes = "A2"

# ---------------- 원천데이터 (Shopify daily USD sales) ----------------
ws_r = wb.create_sheet("원천데이터(Shopify)")
ws_r.append(["날짜", "요일번호", "요일", "total_sales(USD)"])
style_header(ws_r, 1, 4)

with open(CSV_PATH, encoding="utf-8") as f:
    src_rows = list(csv.DictReader(f))

r0 = 2
for i, rec in enumerate(src_rows):
    y, m, d_ = rec["date"].split("-")
    d = date(int(y), int(m), int(d_))
    row = r0 + i
    ws_r.cell(row=row, column=1, value=d).number_format = DATE_FMT
    ws_r.cell(row=row, column=1).font = BLUE
    ws_r.cell(row=row, column=2, value=f"=WEEKDAY(A{row},1)-1").font = BLACK
    ws_r.cell(row=row, column=3, value=f'=CHOOSE(B{row}+1,"일","월","화","수","목","금","토")').font = BLACK
    amt_cell = ws_r.cell(row=row, column=4, value=float(rec["amount"]))
    amt_cell.font = BLUE
    amt_cell.number_format = USD_FMT

last_src_row = r0 + len(src_rows) - 1
autofit(ws_r, [14, 10, 8, 16])
ws_r.freeze_panes = "A2"

# ---------------- 요일별비중 ----------------
ws_w = wb.create_sheet("요일별비중")
ws_w.append(["요일번호", "요일", "평균매출(USD)", "비중(%)"])
style_header(ws_w, 1, 4)

for dow in range(7):
    row = 2 + dow
    ws_w.cell(row=row, column=1, value=dow).font = BLUE
    ws_w.cell(row=row, column=2, value=f'=CHOOSE(A{row}+1,"일","월","화","수","목","금","토")').font = BLACK
    avg_formula = (
        f"=AVERAGEIF('원천데이터(Shopify)'!$B$2:$B${last_src_row},A{row},"
        f"'원천데이터(Shopify)'!$D$2:$D${last_src_row})"
    )
    c = ws_w.cell(row=row, column=3, value=avg_formula)
    c.font = BLACK
    c.number_format = USD_FMT

total_row = 9
ws_w.cell(row=total_row, column=2, value="합계").font = BOLD
sum_cell = ws_w.cell(row=total_row, column=3, value="=SUM(C2:C8)")
sum_cell.font = BOLD
sum_cell.number_format = USD_FMT

for dow in range(7):
    row = 2 + dow
    pct_cell = ws_w.cell(row=row, column=4, value=f"=C{row}/$C${total_row}")
    pct_cell.font = BLACK
    pct_cell.number_format = PCT_FMT

pct_total = ws_w.cell(row=total_row, column=4, value="=SUM(D2:D8)")
pct_total.font = BOLD
pct_total.number_format = PCT_FMT

autofit(ws_w, [10, 8, 18, 10])
ws_w.freeze_panes = "A2"

# ---------------- 일별배분 ----------------
ws_d = wb.create_sheet("일별배분")
ws_d.append(["날짜", "요일번호", "요일", "구간", "업리프트 배수", "기준지수(요일 평균매출,USD)", "조정지수", "배분금액(원)", "미국 비중(%)", "미국 배분금액(원)", "미국외 배분금액(원)"])
style_header(ws_d, 1, 11)

start = date(2026, 8, 1)
n_days = 31
first_row = 2
last_row = first_row + n_days - 1

for i in range(n_days):
    d = start + timedelta(days=i)
    row = first_row + i
    ws_d.cell(row=row, column=1, value=d).number_format = DATE_FMT
    ws_d.cell(row=row, column=1).font = BLUE
    ws_d.cell(row=row, column=2, value=f"=WEEKDAY(A{row},1)-1").font = BLACK
    ws_d.cell(row=row, column=3, value=f'=CHOOSE(B{row}+1,"일","월","화","수","목","금","토")').font = BLACK

    segment_formula = f'=IF(AND(A{row}>=가정!$B$5,A{row}<=가정!$B$6),"프로모션","평시")'
    ws_d.cell(row=row, column=4, value=segment_formula).font = BLACK

    mult_formula = f'=IF(AND(A{row}>=가정!$B$5,A{row}<=가정!$B$6),가정!$B$7,1)'
    ws_d.cell(row=row, column=5, value=mult_formula).font = BLACK
    ws_d.cell(row=row, column=5).number_format = "0.0\"x\""

    base_idx_formula = f"=INDEX('요일별비중'!$C$2:$C$8,MATCH(B{row},'요일별비중'!$A$2:$A$8,0))"
    c6 = ws_d.cell(row=row, column=6, value=base_idx_formula)
    c6.font = BLACK
    c6.number_format = USD_FMT

    adj_idx_formula = f"=F{row}*E{row}"
    c7 = ws_d.cell(row=row, column=7, value=adj_idx_formula)
    c7.font = BLACK
    c7.number_format = USD_FMT

    if i < n_days - 1:
        amt_formula = f"=ROUND(G{row}/SUM($G${first_row}:$G${last_row})*가정!$B$2,0)"
    else:
        amt_formula = f"=가정!$B$2-SUM(H{first_row}:H{last_row-1})"
    c8 = ws_d.cell(row=row, column=8, value=amt_formula)
    c8.font = BLACK
    c8.number_format = WON_FMT

    us_share_cell = ws_d.cell(row=row, column=9, value="=가정!$B$10")
    us_share_cell.font = BLACK
    us_share_cell.number_format = PCT_FMT

    us_amt_cell = ws_d.cell(row=row, column=10, value=f"=ROUND(H{row}*I{row},0)")
    us_amt_cell.font = BLACK
    us_amt_cell.number_format = WON_FMT

    non_us_amt_cell = ws_d.cell(row=row, column=11, value=f"=H{row}-J{row}")
    non_us_amt_cell.font = BLACK
    non_us_amt_cell.number_format = WON_FMT

sum_row = last_row + 1
ws_d.cell(row=sum_row, column=3, value="합계").font = BOLD
for col in (8, 10, 11):
    tot_cell = ws_d.cell(row=sum_row, column=col, value=f"=SUM({get_column_letter(col)}{first_row}:{get_column_letter(col)}{last_row})")
    tot_cell.font = BOLD
    tot_cell.number_format = WON_FMT

check_row = sum_row + 1
ws_d.cell(row=check_row, column=3, value="목표 대비 차액(검증, 0이어야 함)").font = BLACK
diff_cell = ws_d.cell(row=check_row, column=8, value=f"=H{sum_row}-가정!$B$2")
diff_cell.font = BLACK
diff_cell.number_format = WON_FMT

promo_row = check_row + 2
ws_d.cell(row=promo_row, column=3, value="프로모션 구간 합계").font = BLACK
p1 = ws_d.cell(row=promo_row, column=8, value=f'=SUMIF($D${first_row}:$D${last_row},"프로모션",$H${first_row}:$H${last_row})')
p1.font = BLACK
p1.number_format = WON_FMT

rest_row = promo_row + 1
ws_d.cell(row=rest_row, column=3, value="평시 합계").font = BLACK
p2 = ws_d.cell(row=rest_row, column=8, value=f'=SUMIF($D${first_row}:$D${last_row},"평시",$H${first_row}:$H${last_row})')
p2.font = BLACK
p2.number_format = WON_FMT

autofit(ws_d, [14, 10, 8, 12, 12, 22, 16, 18, 12, 18, 20])
ws_d.freeze_panes = "A2"

wb._sheets = [ws_a, ws_d, ws_w, ws_r]
wb.calculation.fullCalcOnLoad = True
wb.save(OUT_PATH)
print("saved", OUT_PATH)
