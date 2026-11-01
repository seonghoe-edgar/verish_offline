"""2027 매출 목표(채널×월, 오프라인 매장별, 해외 자사몰 국가별, 상품라인별) 엑셀 생성.

입력: reports/2027-target-input.json (BigQuery Verish_Datamart 스냅샷, 단위 백만원)
사용: python scripts/build-2027-target-xlsx.py reports/2027-target-input.json reports/2027_매출목표.xlsx

방법(요약):
  1) 2026E: 1~10월 실적 + 11~12월 추정(전년 11~12월 × 9~10월 YoY, 이력 없으면 9~10월 평균 × 그룹 계절지수)
  2) 기준 월평균 D: 최근 9~10월 실적(8~9월 출시 어패럴 이즈핏·코지핏 제외)을 그룹 계절지수로 역계절화
  3) 신규 언더웨어 램프업 보정 U: 쿨핏 노와이어·에센셜핏은 10월 수준을 run-rate로 인정
  4) 2027 목표(m) = (D + U) × 계절지수(m) × (1 + 성장률)   ← 엑셀 수식, 성장률은 '가정' 시트에서 수정
  5) 상품라인 = 그룹 월 목표 × 라인 믹스(신규 라인은 현재 비중 유지, 어패럴은 카테고리 비중으로만)
"""
import json
import sys

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

IN_PATH = sys.argv[1]
OUT_PATH = sys.argv[2]

FONT_NAME = "Arial"
BLUE = Font(name=FONT_NAME, color="0000FF")
BLACK = Font(name=FONT_NAME, color="000000")
GREEN = Font(name=FONT_NAME, color="008000")
BOLD = Font(name=FONT_NAME, bold=True)
TITLE = Font(name=FONT_NAME, bold=True, size=13)
GREY = Font(name=FONT_NAME, color="808080", italic=True)
HEADER_FILL = PatternFill("solid", fgColor="D9D9D9")
SUB_FILL = PatternFill("solid", fgColor="F2F2F2")
YELLOW = PatternFill("solid", fgColor="FFFF00")
EST_FILL = PatternFill("solid", fgColor="FFF2CC")
THIN_TOP = Border(top=Side(style="thin"))
M_FMT = "#,##0"
PCT_FMT = "0.0%"
IDX_FMT = "0.000"

GROUPS = [
    ("D2C_KR", "국내 자사몰"),
    ("D2C_GL", "해외 자사몰(미국 제외)"),
    ("MKT_KR", "국내 외부채널"),
    ("OFF", "오프라인"),
]
GROUP_NAME = dict(GROUPS)
MONTHS = list(range(1, 13))
MLABEL = [f"{m}월" for m in MONTHS]


def ym(y, m):
    return f"{y % 100:02d}{m:02d}"


def parse(s, summing=False):
    out = {}
    for tok in s.split():
        k, v = tok.split(":")
        out[k] = out.get(k, 0.0) + float(v) if summing else float(v)
    return out


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


data = json.load(open(IN_PATH, encoding="utf-8"))
units = []
for u in data["units"]:
    u = dict(u)
    u["a"] = parse(u["v_sum"], summing=True) if "v_sum" in u else parse(u["v"])
    units.append(u)


def A(u, key):
    return u["a"].get(key, 0.0)


# ---------------- 1) 전년(2025) 11~12월 계절성: 9~10월 평균 대비 ----------------
SEASON_REF = {  # 2025 이력이 성숙한 유닛
    "D2C_KR": ["cafe24_direct", "cafe24_naverpay_order"],
    "D2C_GL": ["shopify_HK", "shopify_TW"],
    "MKT_KR": ["29cm", "musinsa", "zigzag", "ably", "smartstore", "kakao_gift", "lotte_dfs", "shilla_dfs"],
    "OFF": ["VRSSFS", "VRDSFS"],
}
by_id = {u["id"]: u for u in units}
S_novdec = {}
for g, ids in SEASON_REF.items():
    so = sum(A(by_id[i], "2509") + A(by_id[i], "2510") for i in ids) / 2
    S_novdec[g] = {m: sum(A(by_id[i], ym(2025, m)) for i in ids) / so for m in (11, 12)}

# ---------------- 2) 2026E ----------------
for u in units:
    e = {m: A(u, ym(2026, m)) for m in range(1, 11)}
    so26 = A(u, "2609") + A(u, "2610")
    so25 = A(u, "2509") + A(u, "2510")
    if u.get("popup"):
        e[11] = e[12] = 0.0
        u["method"], u["R"] = "팝업(추정 제외)", None
    elif so25 > 0 and so25 >= 0.25 * so26 and A(u, "2511") > 0:
        R = clamp(so26 / so25, 0.4, 2.0)
        e[11], e[12] = A(u, "2511") * R, A(u, "2512") * R
        u["method"], u["R"] = "A: 전년 11~12월×YoY", R
    else:
        rr = u.get("rr", ["2609", "2610"])
        base = sum(A(u, k) for k in rr) / len(rr)
        e[11], e[12] = base * S_novdec[u["group"]][11], base * S_novdec[u["group"]][12]
        u["method"], u["R"] = "B: 9~10월 평균×전년 계절성", None
    u["e"] = e

# ---------------- 3) 그룹 계절지수(평균=1) ----------------
IDX_REF = {
    "D2C_KR": ["cafe24_direct", "cafe24_naverpay_order"],
    "D2C_GL": [u["id"] for u in units if u["group"] == "D2C_GL"],
    "MKT_KR": SEASON_REF["MKT_KR"],
    "OFF": ["VRSSFS", "VRDSFS", "VRAGFS", "VRDJCS"],
}
IDX_TWO_YEAR = {"D2C_KR", "MKT_KR"}  # 2025도 성숙 → 2개년 평균으로 추세 오염 완화
idx = {}
for g, ids in IDX_REF.items():
    e26 = [sum(by_id[i]["e"][m] for i in ids) for m in MONTHS]
    s26 = [v / (sum(e26) / 12) for v in e26]
    if g in IDX_TWO_YEAR:
        a25 = [sum(A(by_id[i], ym(2025, m)) for i in ids) for m in MONTHS]
        s25 = [v / (sum(a25) / 12) for v in a25]
        idx[g] = [(x + y) / 2 for x, y in zip(s25, s26)]
    else:
        idx[g] = s26

# 국내 자사몰·국내 외부채널은 채널마다 2개년 이력이 있어 채널 고유 계절지수(프로모션 달력·면세점 평탄성 반영)
OWN_IDX_GROUPS = {"D2C_KR", "MKT_KR"}
for u in units:
    if u.get("idx_like"):
        continue
    if u["group"] in OWN_IDX_GROUPS:
        a25 = [A(u, ym(2025, m)) for m in MONTHS]
        e26 = [u["e"][m] for m in MONTHS]
        s25 = [v / (sum(a25) / 12) for v in a25]
        s26 = [v / (sum(e26) / 12) for v in e26]
        u["idx"] = [(x + y) / 2 for x, y in zip(s25, s26)]
    else:
        u["idx"] = idx[u["group"]]
for u in units:  # 2025 이력 없는 채널(신세계면세점) → 유사 채널 지수 평균
    if u.get("idx_like"):
        refs = [by_id[i]["idx"] for i in u["idx_like"]]
        u["idx"] = [sum(v) / len(v) for v in zip(*refs)]

# ---------------- 4) 기준 월평균 D (신규 어패럴 제외) ----------------
new_app = data["new_apparel_sep_oct"]
for u in units:
    if u.get("popup"):
        u["D"], u["rr_raw"], u["rr_excl"] = 0.0, 0.0, 0.0
        continue
    rr = u.get("rr", ["2609", "2610"])
    raw = sum(A(u, k) for k in rr)
    excl = sum(new_app.get(u["id"], {}).get(k, 0.0) for k in rr)
    u["rr_raw"], u["rr_excl"] = raw, excl
    u["D"] = (raw - excl) / sum(u["idx"][int(k[2:]) - 1] for k in rr)

# ---------------- 5) 성장률 기본값: 동일점 9~10월 YoY 모멘텀의 50%, 0~30% ----------------
lfl = {}
g_default = {}
for g, _ in GROUPS:
    a_units = [u for u in units if u["group"] == g and u.get("method", "").startswith("A")]
    s26 = sum(A(u, "2609") + A(u, "2610") for u in a_units)
    s25 = sum(A(u, "2509") + A(u, "2510") for u in a_units)
    lfl[g] = (s26 / s25, len(a_units))
    g_default[g] = clamp(round(0.5 * (s26 / s25 - 1), 3), 0.0, 0.30)

# ---------------- 6) 라인 믹스 ----------------
LINE_META = [  # key, 표시명, 카테고리, 규칙
    ("U_쿨핏", "쿨핏 브라·팬티 (기존)", "언더웨어", "core"),
    ("N_쿨핏리프트업", "쿨핏 리프트업 브라 [26 신규]", "언더웨어", "new_avg"),
    ("N_쿨핏노와이어", "쿨핏 노와이어 브라 [26 신규]", "언더웨어", "new_oct"),
    ("아이스온", "아이스온 26SS 브라·팬티·이너웨어 [26 신규]", "언더웨어", "seasonal"),
    ("N_에센셜핏", "에센셜핏 브라·팬티 [26 신규]", "언더웨어", "new_oct"),
    ("N_레이스&사틴", "레이스&사틴 브라·팬티 [26 신규]", "언더웨어", "new_avg"),
    ("N_누드브라·실리콘", "패브릭 누드브라·실리콘 니플패치 [26 신규]", "언더웨어", "new_avg"),
    ("U_티셔츠", "티셔츠 브라·팬티", "언더웨어", "core"),
    ("U_미니멀", "미니멀 브라·팬티", "언더웨어", "core"),
    ("U_웜터치·웜시스루", "웜터치·웜시스루 이너웨어", "언더웨어", "seasonal"),
    ("U_레이셋", "레이셋 브라·팬티", "언더웨어", "declining"),
    ("U_니플패치(착착·붐업)", "착착·붐업 니플패치", "언더웨어", "declining"),
    ("U_기타", "기타 언더웨어", "언더웨어", "declining"),
    ("A_어패럴", "어패럴 (이즈핏·코지핏 등 신규 포함, 카테고리 비중)", "어패럴", "core"),
    ("Z_미분류", "미분류(SKU 미매칭)", "기타", "declining"),
]
LAUNCH = {"N_레이스&사틴": 4, "N_누드브라·실리콘": 6, "N_쿨핏리프트업": 2}


def src_key(m):
    return ym(2026, m) if m <= 10 else ym(2025, m)


mix = {}
for g, _ in GROUPS:
    raw = {k: parse(v) for k, v in data["lines"][g].items()}
    raw["아이스온"] = {}
    for k in ("N_아이스온26SS", "U_아이스온(구)"):
        for key, v in raw.pop(k, {}).items():
            raw["아이스온"][key] = raw["아이스온"].get(key, 0.0) + v
    tot = {key: sum(raw[k].get(key, 0.0) for k in raw) for key in {src_key(m) for m in MONTHS} | {"2609", "2610"}}
    share = {k: {key: raw.get(k, {}).get(key, 0.0) / tot[key] for key in tot} for k, *_ in LINE_META}

    gm = {}
    for m in MONTHS:
        fixed = {}
        for k, _, _, rule in LINE_META:
            if rule == "new_oct":
                fixed[k] = share[k]["2610"]
            elif rule == "new_avg":
                ms = [ym(2026, x) for x in range(LAUNCH[k] + 1, 11)]
                fixed[k] = sum(raw.get(k, {}).get(x, 0.0) / sum(raw[j].get(x, 0.0) for j in raw) for x in ms) / len(ms)
            elif rule == "seasonal":
                fixed[k] = share[k][src_key(m)]
            elif rule == "declining":
                fixed[k] = (share[k]["2609"] + share[k]["2610"]) / 2
        core = [k for k, _, _, rule in LINE_META if rule == "core"]
        rest = 1 - sum(fixed.values())
        core_tot = sum(share[k][src_key(m)] for k in core)
        for k in core:
            fixed[k] = rest * share[k][src_key(m)] / core_tot
        gm[m] = fixed
    mix[g] = gm

# ---------------- 7) 신규 언더웨어 램프업 보정 U (그룹 → 유닛 D 비례 배분) ----------------
ramp = {}
for g, _ in GROUPS:
    up = 0.0
    for k in ("N_쿨핏노와이어", "N_에센셜핏"):
        s = parse(data["lines"][g][k])
        sep, octv = s.get("2609", 0.0), s.get("2610", 0.0)
        up += max(0.0, octv / idx[g][9] - (sep + octv) / (idx[g][8] + idx[g][9]))
    ramp[g] = up
for g, _ in GROUPS:
    tot_d = sum(u["D"] for u in units if u["group"] == g)
    for u in units:
        if u["group"] == g:
            u["U"] = ramp[g] * u["D"] / tot_d if tot_d else 0.0

# ---------------- python 미러 계산(검증·요약 출력용) ----------------
for u in units:
    gr = g_default[u["group"]]
    u["t"] = {m: (u["D"] + u["U"]) * u["idx"][m - 1] * (1 + gr) for m in MONTHS}

# =====================================================================
#                              WORKBOOK
# =====================================================================
wb = Workbook()


def hdr(ws, row, values, col=1):
    for i, v in enumerate(values):
        c = ws.cell(row=row, column=col + i, value=v)
        c.font, c.fill = BOLD, HEADER_FILL
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


# ---------------- 가정 ----------------
wa = wb.active
wa.title = "가정"
wa["A1"] = "2027 매출 목표 — 가정 (파란 글씨 = 수정 가능 입력값)"
wa["A1"].font = TITLE
wa["A2"] = "단위: 백만원 · VAT 포함 실결제(net_goods_payment) 기준 · 기준일 2026-11-01 (BigQuery Verish_Datamart)"
wa["A2"].font = GREY

hdr(wa, 4, ["그룹", "2027 성장률(기준선 대비)", "동일점 9~10월 YoY", "산출 근거 유닛 수", "기본값 산식"])
G_ROW = {}
for i, (g, name) in enumerate(GROUPS):
    r = 5 + i
    G_ROW[g] = r
    wa.cell(row=r, column=1, value=name).font = BLACK
    c = wa.cell(row=r, column=2, value=g_default[g])
    c.font, c.number_format, c.fill = BLUE, PCT_FMT, YELLOW
    c = wa.cell(row=r, column=3, value=lfl[g][0])
    c.font, c.number_format = BLACK, '0.00"x"'
    wa.cell(row=r, column=4, value=lfl[g][1]).font = BLACK
    wa.cell(row=r, column=5, value="= clamp(0.5 × (YoY − 1), 0%, 30%)").font = GREY

wa.cell(row=10, column=1, value="그룹 계절지수 (12개월 평균 = 1.000)").font = BOLD
hdr(wa, 11, ["그룹"] + MLABEL + ["산출 기준"])
IDX_ROW = {}
for i, (g, name) in enumerate(GROUPS):
    r = 12 + i
    IDX_ROW[g] = r
    wa.cell(row=r, column=1, value=name).font = BLACK
    for m in MONTHS:
        c = wa.cell(row=r, column=1 + m, value=round(idx[g][m - 1], 4))
        c.font, c.number_format = BLUE, IDX_FMT
    basis = "2025·2026E 형태 평균" if g in IDX_TWO_YEAR else "2026E 형태"
    wa.cell(row=r, column=14, value=f"{basis} / {', '.join(by_id[x]['name'] for x in IDX_REF[g][:4])}{' 외' if len(IDX_REF[g]) > 4 else ''}").font = GREY

notes = [
    "산출 방법",
    "1) 2026E = 1~10월 실적 + 11~12월 추정. 11~12월: 전년 11~12월 × (2026 9~10월 ÷ 2025 9~10월, 0.4~2.0배 제한). 전년 이력이 없거나 얕으면 9~10월 평균 × 전년 그룹 11~12월 계절성.",
    "2) 기준 월평균(D) = 최근 9~10월 실적 ÷ 해당 월 계절지수 합 → '지금 수준이 그대로 유지될 때'의 월평균. 동성수는 10월(첫 온전한 달)만 사용.",
    "   · 8~9월 출시 어패럴(이즈핏 8/28, 코지핏 9/7~)은 지시대로 D에서 제외 → 연환산하지 않음. 대신 상품라인 시트에서 어패럴 카테고리 비중 안에만 포함.",
    "3) 신규 언더웨어 보정(U): 2026 출시 언더웨어(아이스온 26SS, 레이스&사틴, 패브릭 누드브라·실리콘 니플패치, 쿨핏 리프트업, 에센셜핏, 쿨핏 노와이어)는 9~10월 실적에 이미 포함되어 연환산됨.",
    "   아이스온 26SS의 여름 피크는 계절지수(5~8월)로 반영. 아직 램프업 중인 쿨핏 노와이어(9/14 출시)·에센셜핏은 10월 수준을 run-rate로 인정해 차이를 U로 가산.",
    "4) 2027 목표(m) = (D + U) × 계절지수(m) × (1 + 그룹 성장률). 계절지수는 국내 자사몰·국내 외부채널은 채널 고유(아래 표), 해외 자사몰·오프라인은 그룹 공통.",
    "   성장률·계절지수를 바꾸면 모든 시트가 다시 계산됨(D·U는 산출값이라 고정).",
    "5) 신규 매장(명동·하남·동부산·신제주·애월·동성수)은 2026년 공백 월도 run-rate × 계절지수로 채워 12개월 운영을 가정(연환산). 팝업은 2027 계획 확정 시 별도 추가.",
    "6) 상품라인 = 그룹 월 목표 × 라인 믹스. 신규 언더웨어는 현재 비중을 전 월에 유지(에센셜핏·노와이어 10월, 나머지 출시 후 평균), 아이스온·웜터치는 2026 월별 비중(시즌성),",
    "   단종·하락 라인(레이셋·착착·붐업 등)은 9~10월 비중 유지, 나머지(쿨핏 기존·티셔츠·미니멀·어패럴)는 잔여 비중을 2026 월별 비율로 배분.",
    "면세점: 2026년 1~9월은 Revenue Projection 시트 '2026 매출 달성'(VAT 제외) 기준. 롯데·신라 10월·2025년은 BQ×(7~9월 시트/BQ 비율), 신세계 10월=9월×롯데·신라 10월/9월 평균(추정).",
    "주의: 국내 외부채널 상품 믹스는 면세점(롯데·신라·신세계)이 SKU 단위가 아니라 제외하고 산출 → 면세점도 같은 믹스로 가정. 해외 자사몰 믹스는 미국 제외 국가 합산 1개 믹스를 국가별 공통 적용. 올리브영 온라인은 목표에서 제외(매출 비중 1% 수준이라 믹스에는 잔존).",
    "해외 국가 묶음: 마카오는 홍콩에, 뉴질랜드는 기타 국가에 합산.",
]
for i, t in enumerate(notes):
    c = wa.cell(row=18 + i, column=1, value=t)
    c.font = BOLD if i == 0 else BLACK
widths(wa, [26, 12, 12, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 40])
wa.column_dimensions["B"].width = 14
wa.column_dimensions["C"].width = 14


def g_ref(g):
    return f"가정!$B${G_ROW[g]}"


# 채널 고유 계절지수 (국내 자사몰·국내 외부채널)
wa.cell(row=33, column=1, value="채널 고유 계절지수 (국내 자사몰·국내 외부채널: 채널별 2025·2026E 형태 평균, 12개월 평균 = 1.000)").font = BOLD
hdr(wa, 34, ["채널"] + MLABEL)
UNIT_IDX_ROW = {}
r = 35
for u in units:
    if u["group"] in OWN_IDX_GROUPS:
        wa.cell(row=r, column=1, value=u["name"]).font = BLACK
        for m in MONTHS:
            c = wa.cell(row=r, column=1 + m, value=round(u["idx"][m - 1], 4))
            c.font, c.number_format = BLUE, IDX_FMT
        UNIT_IDX_ROW[u["id"]] = r
        r += 1


def idx_ref(u, m):
    r_ = UNIT_IDX_ROW.get(u["id"], IDX_ROW[u["group"]])
    return f"가정!${get_column_letter(1 + m)}${r_}"


# ---------------- 채널별 월별 목표 ----------------
wt = wb.create_sheet("채널별_월별목표")
wt["A1"] = "2027 채널별·월별 매출 목표 (오프라인 매장별 · 해외 자사몰 국가별)"
wt["A1"].font = TITLE
wt["A2"] = "단위: 백만원 · 월 목표 셀은 수식: (D + U) × 계절지수 × (1 + 성장률)"
wt["A2"].font = GREY
COLS = ["그룹", "채널 / 매장 / 국가", "2026E 연간", "기준 월평균 D", "신규라인 보정 U", "성장률"] + MLABEL + ["2027 목표 합계", "vs 2026E"]
hdr(wt, 4, COLS)
FIRST_M = 7  # G
TOT_COL = FIRST_M + 12  # S
YOY_COL = TOT_COL + 1
row = 5
SUB_ROWS = {}
UNIT_ROWS = {}
for g, gname in GROUPS:
    start = row
    for u in [x for x in units if x["group"] == g]:
        wt.cell(row=row, column=1, value=gname).font = BLACK
        wt.cell(row=row, column=2, value=u["name"]).font = BLACK
        c = wt.cell(row=row, column=3, value=round(sum(u["e"].values()), 1))
        c.font, c.number_format = GREEN, M_FMT
        if u.get("popup"):
            wt.cell(row=row, column=4, value="2027 팝업 계획 확정 시 별도 입력").font = GREY
            for m in MONTHS:
                c = wt.cell(row=row, column=FIRST_M + m - 1, value=0)
                c.font, c.number_format = BLUE, M_FMT
        else:
            c = wt.cell(row=row, column=4, value=round(u["D"], 2))
            c.font, c.number_format = GREEN, M_FMT
            c = wt.cell(row=row, column=5, value=round(u["U"], 2))
            c.font, c.number_format = GREEN, M_FMT
            c = wt.cell(row=row, column=6, value=f"={g_ref(g)}")
            c.font, c.number_format = GREEN, PCT_FMT
            for m in MONTHS:
                c = wt.cell(row=row, column=FIRST_M + m - 1,
                            value=f"=($D{row}+$E{row})*{idx_ref(u, m)}*(1+$F{row})")
                c.font, c.number_format = BLACK, M_FMT
        c = wt.cell(row=row, column=TOT_COL, value=f"=SUM({get_column_letter(FIRST_M)}{row}:{get_column_letter(FIRST_M + 11)}{row})")
        c.font, c.number_format = BLACK, M_FMT
        c = wt.cell(row=row, column=YOY_COL, value=f"=IF(C{row}=0,\"\",{get_column_letter(TOT_COL)}{row}/C{row}-1)")
        c.font, c.number_format = BLACK, PCT_FMT
        UNIT_ROWS[u["id"]] = row
        row += 1
    end = row - 1
    wt.cell(row=row, column=1, value=gname).font = BOLD
    wt.cell(row=row, column=2, value=f"{gname} 소계").font = BOLD
    for col in [3] + list(range(FIRST_M, TOT_COL + 1)):
        L = get_column_letter(col)
        c = wt.cell(row=row, column=col, value=f"=SUM({L}{start}:{L}{end})")
        c.font, c.number_format = BOLD, M_FMT
    c = wt.cell(row=row, column=YOY_COL, value=f"={get_column_letter(TOT_COL)}{row}/C{row}-1")
    c.font, c.number_format = BOLD, PCT_FMT
    for col in range(1, YOY_COL + 1):
        wt.cell(row=row, column=col).fill = SUB_FILL
        wt.cell(row=row, column=col).border = THIN_TOP
    SUB_ROWS[g] = row
    row += 2
wt.cell(row=row, column=2, value="4개 그룹 합계").font = BOLD
for col in [3] + list(range(FIRST_M, TOT_COL + 1)):
    L = get_column_letter(col)
    c = wt.cell(row=row, column=col, value="=" + "+".join(f"{L}{SUB_ROWS[g]}" for g, _ in GROUPS))
    c.font, c.number_format = BOLD, M_FMT
c = wt.cell(row=row, column=YOY_COL, value=f"={get_column_letter(TOT_COL)}{row}/C{row}-1")
c.font, c.number_format = BOLD, PCT_FMT
GRAND_ROW = row
widths(wt, [20, 26, 11, 11, 11, 8] + [9] * 12 + [12, 9])
wt.freeze_panes = "C5"

# ---------------- 요약 ----------------
ws = wb.create_sheet("요약", 0)
ws["A1"] = "2027 매출 목표 요약"
ws["A1"].font = TITLE
ws["A2"] = "단위: 백만원 · 국내 자사몰 / 해외 자사몰(미국 제외) / 국내 외부채널 / 오프라인 · 모든 값은 다른 시트 참조 수식"
ws["A2"].font = GREY
hdr(ws, 4, ["그룹", "2025 실적", "2026E", "2027 목표", "vs 2026E", "성장률 가정"] + MLABEL)
for i, (g, gname) in enumerate(GROUPS):
    r = 5 + i
    ws.cell(row=r, column=1, value=gname).font = BOLD
    a25 = sum(sum(A(u, ym(2025, m)) for m in MONTHS) for u in units if u["group"] == g)
    c = ws.cell(row=r, column=2, value=round(a25, 1))
    c.font, c.number_format = GREEN, M_FMT
    sr = SUB_ROWS[g]
    for col, src in ((3, f"채널별_월별목표!C{sr}"), (4, f"채널별_월별목표!{get_column_letter(TOT_COL)}{sr}")):
        c = ws.cell(row=r, column=col, value=f"={src}")
        c.font, c.number_format = GREEN, M_FMT
    c = ws.cell(row=r, column=5, value=f"=D{r}/C{r}-1")
    c.font, c.number_format = BLACK, PCT_FMT
    c = ws.cell(row=r, column=6, value=f"={g_ref(g)}")
    c.font, c.number_format = GREEN, PCT_FMT
    for m in MONTHS:
        c = ws.cell(row=r, column=6 + m, value=f"=채널별_월별목표!{get_column_letter(FIRST_M + m - 1)}{sr}")
        c.font, c.number_format = GREEN, M_FMT
r = 9
ws.cell(row=r, column=1, value="합계").font = BOLD
for col in [2, 3, 4] + list(range(7, 19)):
    L = get_column_letter(col)
    c = ws.cell(row=r, column=col, value=f"=SUM({L}5:{L}8)")
    c.font, c.number_format = BOLD, M_FMT
c = ws.cell(row=r, column=5, value="=D9/C9-1")
c.font, c.number_format = BOLD, PCT_FMT
for col in range(1, 19):
    ws.cell(row=r, column=col).border = THIN_TOP
ws["A11"] = "참고"
ws["A11"].font = BOLD
ref_notes = [
    "· 2025 실적의 오프라인에는 2025 팝업(하남·수원·잠실·강남) 매출이 포함되어 있고, 2027 목표에는 팝업이 0으로 잡혀 있음(계획 확정 시 '채널별_월별목표' 팝업 행에 입력).",
    "· 미국(Shopify US)은 지시대로 제외. 참고로 2026 1~10월 Shopify 미국 매출은 '실적_월별' 시트 하단에 별도 표기.",
    "· 해외 외부몰(Shopee·Amazon·TikTok·중국 3사·큐텐)은 요청 범위 밖이라 포함하지 않음.",
    "· 카테고리·상품라인 목표는 '카테고리_요약', '상품라인_월별', '상품_핏별(연간)' 시트 참고.",
]
for i, t in enumerate(ref_notes):
    ws.cell(row=12 + i, column=1, value=t).font = BLACK
widths(ws, [24, 11, 11, 11, 9, 9] + [9] * 12)

# ---------------- 2026E 월별 ----------------
we = wb.create_sheet("2026E_월별")
we["A1"] = "2026 추정(2026E) — 1~10월 실적, 11~12월 추정(노란 칸)"
we["A1"].font = TITLE
hdr(we, 3, ["그룹", "채널 / 매장 / 국가"] + MLABEL + ["2026E 합계", "11~12월 추정 방법", "적용 YoY 배수"])
r = 4
for g, gname in GROUPS:
    for u in [x for x in units if x["group"] == g]:
        we.cell(row=r, column=1, value=gname)
        we.cell(row=r, column=2, value=u["name"])
        for m in MONTHS:
            c = we.cell(row=r, column=2 + m, value=round(u["e"][m], 1))
            c.number_format = M_FMT
            if m >= 11:
                c.fill = EST_FILL
        c = we.cell(row=r, column=15, value=f"=SUM(C{r}:N{r})")
        c.number_format = M_FMT
        we.cell(row=r, column=16, value=u["method"]).font = GREY
        if u["R"] is not None:
            c = we.cell(row=r, column=17, value=round(u["R"], 3))
            c.number_format = '0.00"x"'
        r += 1
widths(we, [20, 26] + [9] * 12 + [11, 26, 10])
we.freeze_panes = "C4"

# ---------------- 실적 월별 ----------------
wr = wb.create_sheet("실적_월별")
wr["A1"] = "실적 2025-01 ~ 2026-10 (백만원)"
wr["A1"].font = TITLE
keys = [ym(2025, m) for m in MONTHS] + [ym(2026, m) for m in range(1, 11)]
hdr(wr, 3, ["그룹", "채널 / 매장 / 국가"] + [f"20{k[:2]}-{k[2:]}" for k in keys] + ["9~10월 중 신규 어패럴(제외분)"])
r = 4
for g, gname in GROUPS:
    for u in [x for x in units if x["group"] == g]:
        wr.cell(row=r, column=1, value=gname)
        wr.cell(row=r, column=2, value=u["name"])
        for i, k in enumerate(keys):
            c = wr.cell(row=r, column=3 + i, value=round(A(u, k), 1))
            c.number_format = M_FMT
        c = wr.cell(row=r, column=3 + len(keys), value=round(u["rr_excl"], 1))
        c.number_format = M_FMT
        r += 1
r += 1
wr.cell(row=r, column=1, value="참고(제외)")
wr.cell(row=r, column=2, value="Shopify 미국")
us = parse(data["us_ref"])
for i, k in enumerate(keys):
    c = wr.cell(row=r, column=3 + i, value=round(us.get(k, 0.0), 1))
    c.number_format, c.font = M_FMT, GREY
widths(wr, [20, 26] + [9] * len(keys) + [14])
wr.freeze_panes = "C4"

# ---------------- 라인 믹스 ----------------
wm = wb.create_sheet("라인믹스")
wm["A1"] = "그룹별 월 상품라인 비중 (2027 적용, 각 월 합계 = 100%)"
wm["A1"].font = TITLE
hdr(wm, 3, ["그룹", "상품라인", "카테고리", "규칙"] + MLABEL)
RULE_KO = {"core": "잔여 배분(2026 월별 비율)", "new_oct": "신규·10월 비중 유지", "new_avg": "신규·출시 후 평균 비중",
           "seasonal": "시즌성(2026 월별 비중)", "declining": "9~10월 비중 유지"}
MIX_ROW = {}
r = 4
for g, gname in GROUPS:
    for k, name, cat, rule in LINE_META:
        wm.cell(row=r, column=1, value=gname)
        wm.cell(row=r, column=2, value=name)
        wm.cell(row=r, column=3, value=cat)
        wm.cell(row=r, column=4, value=RULE_KO[rule]).font = GREY
        for m in MONTHS:
            c = wm.cell(row=r, column=4 + m, value=round(mix[g][m][k], 5))
            c.number_format, c.font = PCT_FMT, BLUE
        MIX_ROW[(g, k)] = r
        r += 1
    wm.cell(row=r, column=2, value="합계 확인").font = GREY
    for m in MONTHS:
        L = get_column_letter(4 + m)
        c = wm.cell(row=r, column=4 + m, value=f"=SUM({L}{r - len(LINE_META)}:{L}{r - 1})")
        c.number_format, c.font = PCT_FMT, GREY
    r += 2
widths(wm, [20, 44, 9, 22] + [8] * 12)
wm.freeze_panes = "E4"

# ---------------- 상품라인 월별 ----------------
wl = wb.create_sheet("상품라인_월별")
wl["A1"] = "2027 상품라인별·월별 목표 (그룹 월 목표 × 라인 비중)"
wl["A1"].font = TITLE
wl["A2"] = "단위: 백만원 · 어패럴은 신규 라인을 따로 키우지 않고 카테고리 비중으로만 반영"
wl["A2"].font = GREY
hdr(wl, 4, ["그룹", "상품라인", "카테고리"] + MLABEL + ["2027 합계", "비중"])
LINE_ROWS = {}
r = 5
for g, gname in GROUPS:
    start = r
    sr = SUB_ROWS[g]
    for k, name, cat, rule in LINE_META:
        wl.cell(row=r, column=1, value=gname)
        wl.cell(row=r, column=2, value=name)
        wl.cell(row=r, column=3, value=cat)
        for m in MONTHS:
            src_t = f"채널별_월별목표!{get_column_letter(FIRST_M + m - 1)}${sr}"
            src_m = f"라인믹스!{get_column_letter(4 + m)}{MIX_ROW[(g, k)]}"
            c = wl.cell(row=r, column=3 + m, value=f"={src_t}*{src_m}")
            c.number_format, c.font = M_FMT, GREEN
        c = wl.cell(row=r, column=16, value=f"=SUM(D{r}:O{r})")
        c.number_format = M_FMT
        LINE_ROWS[(g, k)] = r
        r += 1
    end = r - 1
    wl.cell(row=r, column=2, value=f"{gname} 합계").font = BOLD
    for col in range(4, 17):
        L = get_column_letter(col)
        c = wl.cell(row=r, column=col, value=f"=SUM({L}{start}:{L}{end})")
        c.number_format, c.font = M_FMT, BOLD
    for rr_ in range(start, end + 1):
        c = wl.cell(row=rr_, column=17, value=f"=P{rr_}/P${r}")
        c.number_format = PCT_FMT
    for col in range(1, 18):
        wl.cell(row=r, column=col).fill = SUB_FILL
    r += 2
# 전체 합산 블록
wl.cell(row=r, column=1, value="4개 그룹 합산").font = BOLD
r += 1
all_start = r
for k, name, cat, rule in LINE_META:
    wl.cell(row=r, column=1, value="전체")
    wl.cell(row=r, column=2, value=name)
    wl.cell(row=r, column=3, value=cat)
    for col in range(4, 17):
        L = get_column_letter(col)
        c = wl.cell(row=r, column=col, value="=" + "+".join(f"{L}{LINE_ROWS[(g, k)]}" for g, _ in GROUPS))
        c.number_format = M_FMT
    LINE_ROWS[("ALL", k)] = r
    r += 1
wl.cell(row=r, column=2, value="전체 합계").font = BOLD
for col in range(4, 17):
    L = get_column_letter(col)
    c = wl.cell(row=r, column=col, value=f"=SUM({L}{all_start}:{L}{r - 1})")
    c.number_format, c.font = M_FMT, BOLD
for rr_ in range(all_start, r):
    c = wl.cell(row=rr_, column=17, value=f"=P{rr_}/P${r}")
    c.number_format = PCT_FMT
widths(wl, [20, 44, 9] + [9] * 12 + [11, 8])
wl.freeze_panes = "D5"

# ---------------- 카테고리 요약 ----------------
wc = wb.create_sheet("카테고리_요약", 1)
wc["A1"] = "2027 카테고리별 목표 (연간)"
wc["A1"].font = TITLE
wc["A2"] = "단위: 백만원 · '상품라인_월별' 합계 참조"
wc["A2"].font = GREY
CATS = ["언더웨어", "어패럴", "기타"]
hdr(wc, 4, ["그룹"] + [f"{c}" for c in CATS] + ["합계"] + [f"{c} 비중" for c in CATS] + ["└ 그중 26 신규 언더웨어", "신규 언더웨어 비중"])
for i, (g, gname) in enumerate(GROUPS + [("ALL", "전체")]):
    r = 5 + i
    wc.cell(row=r, column=1, value=gname).font = BOLD if g == "ALL" else BLACK
    for j, cat in enumerate(CATS):
        refs = [f"상품라인_월별!P{LINE_ROWS[(g, k)]}" for k, _, c_, _ in LINE_META if c_ == cat]
        c = wc.cell(row=r, column=2 + j, value="=" + "+".join(refs))
        c.number_format, c.font = M_FMT, GREEN
    c = wc.cell(row=r, column=5, value=f"=SUM(B{r}:D{r})")
    c.number_format = M_FMT
    for j in range(3):
        c = wc.cell(row=r, column=6 + j, value=f"={get_column_letter(2 + j)}{r}/E{r}")
        c.number_format = PCT_FMT
    refs = [f"상품라인_월별!P{LINE_ROWS[(g, k)]}" for k, n, _, _ in LINE_META if "신규" in n and not k.startswith("A_")]
    c = wc.cell(row=r, column=9, value="=" + "+".join(refs))
    c.number_format, c.font = M_FMT, GREEN
    c = wc.cell(row=r, column=10, value=f"=I{r}/E{r}")
    c.number_format = PCT_FMT
widths(wc, [24, 12, 12, 10, 12, 11, 11, 10, 20, 14])

# ---------------- 상품 핏별(연간) ----------------
wf = wb.create_sheet("상품_핏별(연간)")
wf["A1"] = "2027 주요 라인 상품(핏)별 연간 목표 — 라인 연간 목표 × 최근 12개월 핏 비중"
wf["A1"].font = TITLE
wf["A2"] = "단위: 백만원 · 핏 비중 = 2025-11~2026-10 국내+해외 자사몰(미국 제외) 매출 기준, 매출 1억 미만 핏 생략"
wf["A2"].font = GREY
hdr(wf, 4, ["상품명", "라인", "품목", "핏", "라인 내 비중", "2027 연간 목표"])
LINE_KEY_FOR_FIT = {"쿨핏": "U_쿨핏", "아이스온": "아이스온", "에센셜핏": "N_에센셜핏", "레이스&사틴": "N_레이스&사틴", "티셔츠": "U_티셔츠"}
fits = data["fit_mix_12m"]
r = 5
for line, lk in LINE_KEY_FOR_FIT.items():
    rows = [f for f in fits if f[0] == line]
    tot = sum(f[3] for f in rows)
    for _, item, fit, amt in rows:
        full = f"{line} {item}" + ("" if fit == "(기본)" else f" {fit}")
        wf.cell(row=r, column=1, value=full)
        wf.cell(row=r, column=2, value=line)
        wf.cell(row=r, column=3, value=item)
        wf.cell(row=r, column=4, value=fit)
        c = wf.cell(row=r, column=5, value=round(amt / tot, 4))
        c.number_format, c.font = PCT_FMT, BLUE
        c = wf.cell(row=r, column=6, value=f"=상품라인_월별!P{LINE_ROWS[('ALL', lk)]}*E{r}")
        c.number_format, c.font = M_FMT, GREEN
        r += 1
    r += 1
wf.cell(row=r, column=1, value="* 쿨핏 핏 비중에는 2026 신규 쿨핏 리프트업·노와이어가 포함되지 않음(별도 라인). 비중은 상위 핏만이라 라인 합계와 약간 다를 수 있음 → 생략분은 비중에서 이미 제외하고 100%로 재정규화.").font = GREY
widths(wf, [36, 12, 10, 22, 12, 14])

wb.save(OUT_PATH)

# ---------------- 콘솔 요약 ----------------
print("성장률 기본값:", {GROUP_NAME[g]: g_default[g] for g in g_default})
print("동일점 YoY:", {GROUP_NAME[g]: round(v[0], 3) for g, v in lfl.items()})
print("램프업 보정 U(월평균):", {GROUP_NAME[g]: round(v, 1) for g, v in ramp.items()})
for g, gname in GROUPS:
    us_ = [u for u in units if u["group"] == g]
    a25 = sum(sum(A(u, ym(2025, m)) for m in MONTHS) for u in us_)
    e26 = sum(sum(u["e"].values()) for u in us_)
    t27 = sum(sum(u["t"].values()) for u in us_)
    print(f"\n[{gname}] 2025 {a25:,.0f} / 2026E {e26:,.0f} / 2027 {t27:,.0f} ({t27 / e26 - 1:+.1%})  idx={[round(x, 2) for x in idx[g]]}")
    for u in us_:
        e = sum(u["e"].values())
        t = sum(u["t"].values())
        print(f"   {u['name']:<22} 2026E {e:>8,.0f}  D {u['D']:>7,.1f}  U {u['U']:>5,.1f}  2027 {t:>8,.0f}  {(t / e - 1) if e else 0:+.0%}  [{u['method']}]")
print(f"\nTOTAL 2026E {sum(sum(u['e'].values()) for u in units):,.0f}  2027 {sum(sum(u['t'].values()) for u in units):,.0f}")
for g, _ in GROUPS:
    for m in (1, 6, 11):
        assert abs(sum(mix[g][m].values()) - 1) < 1e-9, (g, m)
print("saved", OUT_PATH)
