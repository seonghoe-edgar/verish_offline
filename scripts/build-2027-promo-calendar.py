"""2027 채널별 프로모션 연간 캘린더 (xlsx).

근거: Verish_통합 DB(구글시트) 2025~2026 프로모션 이력(알림톡·친구톡 등 메시지 발송 제외).
 - R  = 2026(또는 2025) 실행 이력을 2027로 이월. 요일 맞춤(+364일) 기본, 명절·숫자데이(11.11 등)는 2027 실제 일자에 맞춤.
 - S  = 비어 있는 기간에 해당 국가/채널의 주요 시즌 이벤트를 제안.
채널 범위는 2027 매출 목표(reports/2027_매출목표.xlsx)와 동일: 국내 자사몰·국내 외부채널(면세점 포함)·오프라인 매장별·해외 자사몰(미국 제외) 국가별.

usage: python scripts/build-2027-promo-calendar.py [target_xlsx] [out_xlsx]
"""
import re
import sys
from datetime import date, timedelta

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

TARGET_XLSX = sys.argv[1] if len(sys.argv) > 1 else "reports/2027_매출목표.xlsx"
OUT = sys.argv[2] if len(sys.argv) > 2 else "reports/2027_프로모션_캘린더.xlsx"

Y = 2027


def d(md):
    m, dd = md.split("-")
    return date(Y, int(m), int(dd))


def sh(md):  # 2026 일자 → 2027 같은 요일 (+364일)
    m, dd = md.split("-")
    return date(2026, int(m), int(dd)) + timedelta(days=364)


# (시작, 종료, 마케팅종류, 프로모션명, 근거/메모, 구분 R|S)
# R 이벤트는 sh("2026 MM-DD")로, 고정일·명절 연동은 d("2027 MM-DD")로 적는다.
CH = {}

CH["자사몰"] = [
    (sh("01-07"), sh("01-13"), "시즌오프", "시즌오프 (New Year)", "26 시즌오프 1/7~13", "R"),
    (d("01-25"), d("02-03"), "기획전", "설 선물 기획전 (N팩·선물포장)", "25 N팩 선물하기 1/13~23 · 설 2/6", "R"),
    (d("02-15"), d("02-21"), "패밀리세일", "봄 패밀리세일", "25 패밀리세일 2/11~17", "R"),
    (sh("03-06"), sh("03-15"), "런칭", "[런칭] SS 신규 컬러 선론칭 (팬티 증정)", "26 쿨핏 신규 컬러 선론칭 3/6~15", "R"),
    (d("03-15"), d("03-24"), "감사제", "6주년 감사제", "25 4주년 감사제 3/10~19 (26 DB 미기재)", "R"),
    (sh("04-20"), sh("05-03"), "런칭", "[런칭] 브라탑·여름 라인 런칭 (가정의 달)", "26 브라탑 컬렉션 론칭 4/20~5/3", "R"),
    (sh("05-18"), sh("05-31"), "기획전", "Summer Sale", "26 summer sale 5/18~31", "R"),
    (sh("06-11"), sh("06-30"), "캠페인", "아이스온 시즌 캠페인", "26 아이스온 캠페인 6/11~30", "R"),
    (sh("07-13"), sh("07-31"), "기획전", "Vacation Essentials (바캉스 기획전)", "26 VACATION ESSENTIALS 7/13~31", "R"),
    (sh("08-03"), sh("08-16"), "할인코드", "할인코드 프로모션", "26 할인코드 8/3~16", "R"),
    (sh("08-18"), sh("08-24"), "시즌오프", "클리어런스 (SS 시즌오프)", "26 클리어런스 8/18~24", "R"),
    (sh("08-28"), sh("09-10"), "런칭", "[런칭] FW 어패럴 런칭", "26 Ease Fit 8/28~9/10", "R"),
    (sh("09-14"), sh("09-27"), "런칭", "[런칭] FW 레이어 런칭 + 추석(9/15)", "26 Shapethrough Layers 9/14~27", "R"),
    (sh("09-30"), sh("10-06"), "패밀리세일", "가을 패밀리세일", "26 패밀리세일 9/30~10/6", "R"),
    (d("10-07"), d("10-16"), "할인코드", "할인코드 프로모션", "26 할인코드 10/5~18", "R"),
    (sh("10-19"), sh("10-25"), "런칭", "[런칭] 웜 라인 런칭", "26 Warmlayer 10/19~25", "R"),
    (sh("11-02"), sh("11-15"), "블프", "블랙프라이데이 (얼리)", "26 블랙프라이데이 11/2~15 · 25 11/3~9", "R"),
    (d("11-22"), d("11-28"), "기획전", "윈터 웜 라인 기획전 (블프 당일 11/26 연계)", "11월 하순 공백 — 블프 본 주간", "S"),
    (sh("12-01"), sh("12-20"), "기획전", "연말 홀리데이 기획전 (콜라보)", "26 연말 기획전(키티 콜라보) 12/1~20 · 25 VERY HOLY WEEK", "R"),
    (d("12-21"), d("12-27"), "기획전", "크리스마스 선물 기획전", "연말 공백", "S"),
]

CH["29CM"] = [
    (d("01-04"), d("01-10"), "단독기획전", "New Year 단독 기획전", "25 Verish New Year 기획전 1/6~12", "R"),
    (sh("01-19"), sh("01-25"), "시즌오프", "29CM 시즌오프", "26 시즌오프 1/19~25", "R"),
    (sh("02-09"), sh("02-15"), "기획전", "폐쇄몰 링크 기획전", "26 2/9~15", "R"),
    (sh("02-23"), sh("03-01"), "단독기획전", "단독 기획전 (프리스프링 연합 하이라이팅)", "26 2/23~3/1", "R"),
    (sh("03-23"), sh("03-29"), "런칭", "[런칭] SS 신규 컬러 런칭", "26 쿨핏 신규 컬러 론칭 3/23~29", "R"),
    (sh("04-27"), sh("05-03"), "단독기획전", "단독 기획전", "26 4/27~5/3", "R"),
    (sh("06-01"), sh("06-11"), "연합기획전", "이구위크 (상반기)", "26 6/1~11 · 25 6/4~14", "R"),
    (sh("06-22"), sh("07-05"), "단독기획전", "쇼케이스 (단독)", "26 쇼케플 6/22~7/5", "R"),
    (sh("07-14"), sh("07-14"), "라이브", "29CM 라이브", "26 7/14", "R"),
    (d("07-19"), d("07-29"), "기획전", "브랜드 코멘터리 기획전", "25 7/21~31", "R"),
    (sh("08-10"), sh("08-16"), "단독기획전", "단독 기획전", "26 8/10~16", "R"),
    (sh("08-28"), sh("09-03"), "단독기획전", "단독 기획전 (FW)", "26 8/28~9/3", "R"),
    (sh("09-07"), sh("09-20"), "런칭", "[런칭] 29 에디션 (콜라보)", "26 기호X베리시 29 에디션 9/7~20", "R"),
    (sh("10-19"), sh("10-25"), "단독기획전", "단독 기획전", "26 10/19~25", "R"),
    (sh("11-09"), sh("11-19"), "연합기획전", "이구위크 (하반기)", "26 11/9~19 · 25 11/3~13", "R"),
    (d("11-22"), d("11-30"), "연합기획전", "겨울 아이템 총정리 연합전", "25 11/17~26", "R"),
    (d("12-20"), d("12-26"), "단독기획전", "연말 단독 기획전 + 라이브", "25 단독 12/22~28 · 26 라이브 12/21", "R"),
]

CH["무신사"] = [
    (sh("01-26"), sh("02-01"), "연합기획전", "언더웨어 위크", "26 1/26~2/1", "R"),
    (d("02-01"), d("02-07"), "연합기획전", "설 빅세일", "26 설 빅세일 2/12~17 → 설 2/6 맞춤", "R"),
    (sh("03-16"), sh("03-22"), "단독기획전", "단독 기획전", "26 3/16~22", "R"),
    (d("04-01"), d("04-03"), "연합기획전", "멤버스데이", "25 4/1~3", "R"),
    (sh("04-06"), sh("04-12"), "단독기획전", "오직 무신사 우먼즈 + 단독 기획전", "26 4/6~12", "R"),
    (d("04-19"), d("04-25"), "연합기획전", "언더웨어 위크 (봄)", "25 4/14~20", "R"),
    (sh("05-04"), sh("05-10"), "단독기획전", "단독 기획전 (브라탑)", "26 5/4~10", "R"),
    (sh("06-14"), sh("06-24"), "연합기획전", "무진장 세일 (여름)", "26 6/14~24 · 25 6/15~25", "R"),
    (sh("07-17"), sh("07-19"), "기획전", "주말 특가", "26 7/17~19", "R"),
    (sh("07-20"), sh("07-30"), "연합기획전", "상반기 결산 빅세일 + 라이브", "26 7/20~30", "R"),
    (sh("08-24"), sh("08-30"), "기획전", "오직 무신사 (단독 상품)", "26 8/24~30", "R"),
    (sh("08-31"), sh("09-09"), "캠페인", "신상 캠페인 (29CM 앱스플래쉬 연동)", "26 8/31~9/9", "R"),
    (d("09-11"), d("09-24"), "연합기획전", "추석 빅세일", "26 9/21~10/4 → 추석 9/15 맞춤", "R"),
    (d("10-18"), d("10-24"), "단독기획전", "단독 기획전 (FW 웜 라인)", "10월 공백 — 웜 라인 런칭 주간", "S"),
    (sh("11-22"), sh("12-02"), "연합기획전", "무진장 세일 (겨울)", "26 11/22~12/2 · 25 11/16~27", "R"),
    (d("12-13"), d("12-19"), "단독기획전", "연말 단독 기획전", "25 12/15~22", "R"),
]

CH["지그재그"] = [
    (sh("01-05"), sh("01-11"), "단독기획전", "단독 기획전", "26 1/5~11", "R"),
    (d("02-15"), d("02-17"), "단독기획전", "단독 기획전", "26 2/9~11 → 설 연휴 이후", "R"),
    (sh("03-09"), sh("03-15"), "단독기획전", "단독 기획전 (신규 컬러)", "26 3/9~15", "R"),
    (sh("04-20"), sh("04-26"), "단독기획전", "단독 기획전 (브라탑)", "26 4/20~26", "R"),
    (sh("05-15"), sh("05-17"), "기획전", "72h sale", "26 5/15~17 · 25 5/16~18", "R"),
    (sh("06-08"), sh("06-22"), "연합기획전", "이너웨어 페스타 (여름)", "26 6/8~22 · 25 6/9~23", "R"),
    (sh("06-15"), sh("06-29"), "연합기획전", "직잭팟 (여름)", "26 6/15~29", "R"),
    (sh("07-06"), sh("07-12"), "단독기획전", "쇼케이스", "26 7/6~12", "R"),
    (sh("08-03"), sh("08-09"), "단독기획전", "단독 기획전", "26 8/3~9", "R"),
    (d("08-10"), d("08-16"), "연합기획전", "밸런스위크", "25 8/11~17", "R"),
    (sh("08-31"), sh("09-06"), "단독기획전", "단독 기획전 + 라이브", "26 8/31~9/6, 라방 9/2", "R"),
    (sh("09-28"), sh("09-30"), "기획전", "타임특가", "26 9/28~30", "R"),
    (sh("10-12"), sh("10-18"), "단독기획전", "단독 기획전 + 라이브", "26 10/12~18, 라이브 10/14", "R"),
    (sh("11-09"), sh("11-23"), "연합기획전", "이너웨어 페스타 (겨울)", "26 11/9~23 · 25 11/10~24", "R"),
    (sh("11-16"), sh("11-22"), "연합기획전", "겨울 직잭팟", "26 11/16~22", "R"),
    (sh("11-30"), sh("12-13"), "단독기획전", "쇼케이스 (연말)", "26 11/30~12/13 · 25 어워즈 12/2~7", "R"),
    (d("12-14"), d("12-23"), "연합기획전", "이너웨어 연합전", "25 12/15~24", "R"),
]

CH["에이블리"] = [
    (sh("01-13"), sh("01-17"), "기획전", "릴레이 세일 브랜드 하이라이트", "26 1/13~17", "R"),
    (sh("02-18"), sh("02-20"), "단독기획전", "단독 기획전", "26 2/18~20", "R"),
    (sh("03-30"), sh("04-05"), "단독기획전", "단독 기획전", "26 3/30~4/5", "R"),
    (sh("04-27"), sh("05-12"), "기획전", "메가세일 (브라탑 N팩 단독가)", "26 4/27~5/12", "R"),
    (sh("06-01"), sh("06-08"), "연합기획전", "홈&언더웨어 연합전", "26 6/1~8", "R"),
    (sh("06-15"), sh("06-28"), "기획전", "여름 블프", "26 6/15~28", "R"),
    (sh("07-20"), sh("07-27"), "연합기획전", "홈&언더웨어 연합전 + 원브랜드데이·라이브", "26 7/20~27", "R"),
    (sh("08-24"), sh("08-30"), "단독기획전", "단독 기획전", "26 8/24~30", "R"),
    (sh("09-28"), sh("09-28"), "쿠폰", "메가세일 브랜드 원데이 쿠폰", "26 9/28", "R"),
    (sh("10-26"), sh("11-01"), "단독기획전", "단독 기획전 + 라이브", "26 10/26~11/1", "R"),
    (d("11-15"), d("11-28"), "기획전", "윈터 메가세일·블프 참여", "11월 공백 — 플랫폼 블프 시즌", "S"),
    (d("12-13"), d("12-19"), "단독기획전", "연말 단독 기획전", "12월 공백", "S"),
]

CH["스마트스토어"] = [
    (d("01-10"), d("01-16"), "기획전", "네이버 신상위크", "25 신상위크 1/13~19", "R"),
    (sh("02-02"), sh("02-08"), "단독기획전", "단독 기획전 (설 연계)", "26 2/2~8", "R"),
    (sh("03-23"), sh("03-29"), "기획전", "이너웨어 빅세일", "26 3/23~29", "R"),
    (sh("04-13"), sh("04-19"), "단독기획전", "브랜드데이 + 단독 기획전", "26 4/13~19", "R"),
    (d("05-17"), d("05-17"), "브랜드데이", "브랜드데이 (가정의 달)", "5월 공백", "S"),
    (d("06-27"), d("06-29"), "단독기획전", "단독 기획전", "25 6/28~30", "R"),
    (d("07-13"), d("07-13"), "브랜드데이", "브랜드데이 + 라이브", "25 7/14", "R"),
    (sh("08-17"), sh("08-17"), "기획전", "끝딜 테마딜", "26 8/17", "R"),
    (d("09-01"), d("09-01"), "브랜드데이", "브랜드데이 (FW)", "25 9/1", "R"),
    (sh("10-05"), sh("10-07"), "단독기획전", "단독 기획전", "26 10/5~7", "R"),
    (d("10-28"), d("11-10"), "연합기획전", "넾다쇼핑 (네이버 블프)", "25 10/29~11/11", "R"),
    (d("12-28"), d("12-30"), "기획전", "연말 기획전", "25 12/29~31", "R"),
]

CH["카카오톡 선물하기"] = [
    (d("01-31"), d("02-06"), "포미위크", "포미위크 (설 선물)", "26 2/2~8", "R"),
    (d("02-08"), d("02-14"), "연합기획전", "발렌타인데이", "25 2/7~14", "R"),
    (sh("02-23"), sh("03-01"), "기획전", "쟁특 (나에게 선물)", "26 2/23~3/1", "R"),
    (d("03-07"), d("03-14"), "연합기획전", "화이트데이", "25 3/7~14", "R"),
    (sh("03-16"), sh("03-29"), "기획전", "카쇼페", "26 3/16~29", "R"),
    (sh("04-17"), sh("04-17"), "특가", "24h 특가", "26 4/17", "R"),
    (sh("04-27"), sh("05-03"), "특가", "쟁쟁한 특가", "26 4/27~5/3", "R"),
    (d("05-10"), d("05-16"), "연합기획전", "성년의 날 (5/17)", "25 5/14~19", "R"),
    (d("05-17"), d("05-23"), "포미위크", "포미위크", "26 5/18~24", "R"),
    (d("07-05"), d("07-11"), "포미위크", "포미위크 (여름)", "25 7/7~13", "R"),
    (d("09-06"), d("09-13"), "기획전", "추석 선물 기획전", "9월 공백 · 추석 9/15", "S"),
    (d("11-05"), d("11-11"), "기획전", "빼빼로데이 선물전", "11월 공백", "S"),
    (d("12-13"), d("12-25"), "기획전", "크리스마스·연말 선물전", "12월 공백", "S"),
]

DFS = [  # 면세점: DB 이력 없음 → 관광 수요 시즌 제안 (면세점별 행사 캘린더 확인 필요)
    (d("01-25"), d("02-10"), "시즌", "춘절 시즌 (중화권 설 2/6)", "DB 이력 없음 · 관광 성수기", "S"),
    (d("04-29"), d("05-05"), "시즌", "중국 노동절·일본 골든위크", "관광 성수기", "S"),
    (d("07-15"), d("08-20"), "시즌", "여름 휴가 성수기", "관광 성수기", "S"),
    (d("09-29"), d("10-07"), "시즌", "중국 국경절 (10/1~7)", "관광 성수기", "S"),
    (d("11-20"), d("11-30"), "블프", "블랙프라이데이 행사 참여", "면세점 BF 행사", "S"),
    (d("12-15"), d("12-31"), "시즌", "연말 홀리데이", "관광 성수기", "S"),
]
for k in ("롯데면세점", "신라면세점", "신세계면세점"):
    CH[k] = DFS

CH["전매장 (공통)"] = [
    (sh("01-07"), sh("01-13"), "시즌오프", "New Year, New Me (시즌오프)", "26 1/7~13", "R"),
    (sh("03-06"), sh("03-15"), "런칭", "[런칭] SS 신규 컬러 런칭", "26 3/6~15", "R"),
    (sh("04-21"), sh("05-03"), "런칭", "[런칭] 브라탑 컬렉션 런칭", "26 4/21~5/3", "R"),
    (sh("05-18"), sh("05-31"), "전사", "Summer Sale", "26 5/18~31", "R"),
    (sh("06-11"), sh("06-30"), "전사", "ICE ON (아이스온 시즌)", "26 6/11~30", "R"),
    (sh("07-13"), sh("07-31"), "전사", "Vacation Essentials", "26 7/13~31", "R"),
    (sh("08-18"), sh("08-24"), "시즌오프", "클리어런스 세일", "26 8/18~24", "R"),
    (sh("08-29"), sh("09-10"), "런칭", "[런칭] FW 어패럴 런칭", "26 이즈핏 8/29~9/10", "R"),
    (sh("09-14"), sh("09-27"), "런칭", "[런칭] FW 레이어 런칭 + 추석 프로모션", "26 Shapethrough 9/14~27 · 25 추석 5%", "R"),
    (sh("10-19"), sh("10-25"), "런칭", "[런칭] Warm Touch 런칭", "26 10/19~25", "R"),
    (sh("11-02"), sh("11-15"), "블프", "얼리 블랙프라이데이", "26 11/2~15 · 25 11/3~9", "R"),
    (d("12-06"), d("12-19"), "전사", "We Wish You a Verish Holiday (윈터 10%)", "25 12/8~14", "R"),
]

TOURIST = [  # 외국인 관광 상권 매장 공통 제안
    (d("01-30"), d("02-14"), "택스프리", "춘절 중화권 관광객 프로모션 (택스프리)", "외국인 매출 비중 높은 상권", "S"),
    (d("04-29"), d("05-05"), "택스프리", "노동절·골든위크 관광객 프로모션", "중국 노동절·일본 GW", "S"),
    (d("09-30"), d("10-07"), "택스프리", "국경절 관광객 프로모션", "중국 국경절", "S"),
]
JEJU_SUMMER = (d("07-15"), d("08-20"), "시즌", "제주 여름 성수기 프로모션", "제주 관광 성수기", "S")

CH["베리시 성수"] = [(d("03-05"), d("03-14"), "기념", "성수 오픈 2주년", "25.3.7 오픈", "S")] + TOURIST
CH["베리시 동성수"] = [(d("09-17"), d("09-26"), "기념", "동성수 오픈 1주년", "26.9.18 오픈", "S")] + TOURIST
CH["베리시 명동"] = TOURIST + [(d("12-20"), d("12-31"), "기념", "명동 오픈 2주년", "25.12.24 오픈", "S")]
CH["베리시 안국"] = [(d("09-01"), d("09-07"), "기념", "안국 오픈 2주년", "25.9.1 오픈", "S")] + TOURIST
CH["베리시 도산"] = [(d("06-05"), d("06-14"), "기념", "도산 리뉴얼 2주년 고객 감사", "25.6 리뉴얼 오픈", "S")]
CH["베리시 신제주"] = [
    (d("06-04"), d("06-13"), "기념", "신제주 오픈 1주년", "26.6.5 오픈", "S"),
    JEJU_SUMMER,
    (d("09-30"), d("10-07"), "택스프리", "국경절 관광객 프로모션", "중화권 크루즈·관광", "S"),
]
CH["베리시 제주 애월"] = [(d("06-19"), d("06-29"), "기념", "애월 오픈 1주년", "26.6.20 오픈", "S"), JEJU_SUMMER]
CH["베리시 동부산 아울렛"] = [
    (d("02-12"), d("02-21"), "기념", "동부산 오픈 1주년", "26.2.15 오픈", "S"),
    (sh("04-17"), sh("04-19"), "유통사", "롯데아울렛 Black S", "26 4/17~19", "R"),
    (d("07-15"), d("08-15"), "시즌", "부산 여름 휴가 시즌", "관광 성수기", "S"),
]
CH["베리시 스타필드 하남"] = [
    (d("02-05"), d("02-09"), "명절", "설 프로모션 (브라 10%)", "26 설 2/15~18 → 설 연휴 2/6~9", "R"),
    (sh("03-13"), sh("03-15"), "유통사", "유통사 프로모션 (스타필드)", "26 3/13~15", "R"),
    (d("12-20"), d("12-31"), "기념", "하남 오픈 2주년", "25.12.22 오픈", "S"),
]
CH["베리시 신세계 대전"] = [
    (d("02-05"), d("02-09"), "명절", "설 프로모션 (브라 10%)", "26 설 2/15~18 → 설 연휴 2/6~9", "R"),
    (d("04-02"), d("04-11"), "유통사", "백화점 봄 정기세일 참여", "백화점 정기세일 시즌 (일정 확인)", "S"),
    (d("09-03"), d("09-12"), "기념", "대전 오픈 2주년", "25.9.6 오픈", "S"),
    (d("10-08"), d("10-17"), "유통사", "백화점 가을 정기세일 참여", "백화점 정기세일 시즌 (일정 확인)", "S"),
]

CH["해외 자사몰 (공통)"] = [
    (d("01-01"), d("01-14"), "기획전", "New Year Sale", "1~4월 해외 공백", "S"),
    (d("02-05"), d("02-14"), "기획전", "Valentine's Day 기획전", "1~4월 해외 공백 · 발렌타인 전 국가 공통", "S"),
    (d("03-01"), d("03-14"), "런칭", "[런칭] SS 신규 컬러 (국내 3월 런칭 연동)", "1~4월 해외 공백 · 국내 3월 런칭", "S"),
    (sh("04-20"), d("05-09"), "런칭", "[런칭] 신규 라인 + Mother's Day (5/9)", "26 브라탑 런칭+Mother's Day 4/20~5/10", "R"),
    (sh("06-04"), sh("06-21"), "기획전", "Summer Sale", "26 썸머세일 6/4~21", "R"),
    (sh("07-13"), sh("07-31"), "런칭", "[런칭] 신규 라인 + Vacation Essentials", "26 에센셜핏 런칭+Vacation 7/13~31", "R"),
    (sh("08-10"), sh("08-23"), "시즌오프", "Clearance", "26 8/10~23", "R"),
    (sh("09-04"), sh("09-13"), "런칭", "[런칭] FW 어패럴 (Move it ease)", "26 9/4~13", "R"),
    (sh("09-14"), sh("09-27"), "런칭", "[런칭] FW 레이어 (Shapethrough)", "26 9/14~27", "R"),
    (sh("10-01"), sh("10-25"), "협업", "인플루언서 협업 시즌", "26 찐쩐쿠 10/1~14 · echi 10/12~25", "R"),
    (sh("11-16"), sh("12-06"), "블프", "Black Friday (11/26) & Cyber Monday (11/29)", "26 Black Friday 11/16~12/6", "R"),
    (sh("12-07"), d("12-31"), "기획전", "Holiday 프로모션", "26 홀리데이 12/7~31", "R"),
]
CH["홍콩·마카오"] = [
    (d("01-18"), d("02-05"), "시즌", "新年 CNY 프로모션 (설 2/6 전)", "중화권 최대 시즌", "S"),
    (d("03-01"), d("03-08"), "기획전", "38 女神節 (3/8)", "중화권 여성의 날", "S"),
    (d("06-01"), d("06-18"), "시즌", "6.18 年中大促 (공통 Summer Sale과 묶어 운영)", "중화권 6.18", "S"),
    (d("10-26"), d("11-14"), "시즌", "11.11 프로모션 (중화권)", "26 중화권 11.11 10/26~11/15", "R"),
    (d("12-08"), d("12-12"), "시즌", "12.12 (공통 Holiday 안에서)", "중화권 12.12", "S"),
]
CH["대만"] = [
    (d("01-18"), d("02-05"), "시즌", "春節 프로모션 (설 2/6 전)", "중화권 최대 시즌", "S"),
    (d("03-01"), d("03-08"), "기획전", "38 婦女節 (3/8)", "대만 여성의 날", "S"),
    (d("05-14"), d("05-20"), "기획전", "520 告白日", "5월 중순 공백", "S"),
    (d("05-25"), d("05-28"), "공구", "인플루언서 공구 (인플루언서 TBD)", "26 Shen 공구 5/26~29", "R"),
    (d("06-01"), d("06-18"), "시즌", "6.18 年中慶 (공통 Summer Sale과 묶어 운영)", "중화권 6.18", "S"),
    (d("07-21"), d("07-27"), "공구", "인플루언서 공구 (인플루언서 TBD)", "26 Syri 공구 7/22~28", "R"),
    (d("08-02"), d("08-08"), "기획전", "七夕 情人節 (8/8)", "대만 칠석", "S"),
    (d("09-06"), d("09-12"), "공구", "인플루언서 공구 (인플루언서 TBD)", "26 Jamie 공구 9/7~13", "R"),
    (d("10-26"), d("11-14"), "시즌", "雙11 프로모션 (중화권)", "26 중화권 11.11 10/26~11/15", "R"),
    (d("12-08"), d("12-12"), "시즌", "雙12 (공통 Holiday 안에서)", "대만 12.12", "S"),
]
CH["싱가포르"] = [
    (d("01-18"), d("02-05"), "시즌", "CNY 프로모션 (설 2/6 전)", "싱가포르 최대 시즌", "S"),
    (d("03-01"), d("03-03"), "기획전", "3.3 Sale", "SG 숫자데이", "S"),
    (d("10-08"), d("10-10"), "기획전", "10.10 Sale", "SG 숫자데이 (26 쇼피 10.10 참여)", "S"),
    (d("11-09"), d("11-11"), "기획전", "11.11 Sale", "SG 숫자데이", "S"),
]
CH["호주"] = [
    (d("03-22"), d("03-29"), "기획전", "Easter Sale (3/28)", "호주 부활절", "S"),
    (d("06-01"), d("06-30"), "시즌", "EOFY Sale (6월=겨울: 공통 Summer Sale 대신 EOFY 메시지)", "호주 회계연도 말", "S"),
    (d("11-08"), d("11-12"), "기획전", "Click Frenzy (11월 둘째 주, 일정 공지 확인)", "호주 대형 온라인 세일", "S"),
    (d("12-26"), d("12-31"), "시즌", "Boxing Day (공통 Holiday 안에서)", "호주 박싱데이", "S"),
]
CH["말레이시아"] = [
    (d("01-18"), d("02-05"), "시즌", "CNY 프로모션 (설 2/6 전)", "MY 중화계 시즌", "S"),
    (d("02-24"), d("03-09"), "시즌", "Hari Raya Aidilfitri (3/9~10 예상)", "MY 최대 명절", "S"),
    (d("10-08"), d("10-10"), "기획전", "10.10 Sale", "MY 숫자데이 (26 쇼피 10.10 참여)", "S"),
    (d("11-09"), d("11-11"), "기획전", "11.11 Sale", "MY 숫자데이", "S"),
]
CH["일본"] = [
    (d("01-01"), d("01-05"), "시즌", "初売り (신년 첫 세일)", "일본 신년 세일", "S"),
    (d("03-08"), d("03-14"), "기획전", "ホワイトデー (3/14)", "3월 공백", "S"),
    (d("04-29"), d("05-05"), "시즌", "ゴールデンウィーク (공통 런칭과 묶어 운영)", "26 큐텐 골드위크 4/29~5/10", "S"),
    (d("07-01"), d("07-11"), "시즌", "夏のボーナスセール", "일본 여름 보너스 시즌", "S"),
]
CH["영국"] = [
    (d("03-01"), d("03-07"), "기획전", "Mothering Sunday (3/7)", "영국 어머니날 (5월 아님)", "S"),
    (d("03-22"), d("03-29"), "기획전", "Easter Sale (3/28)", "영국 부활절", "S"),
    (d("12-26"), d("12-31"), "시즌", "Boxing Day (공통 Holiday 안에서)", "영국 박싱데이", "S"),
]
CH["캐나다"] = [
    (d("03-22"), d("03-29"), "기획전", "Easter Sale (3/28)", "캐나다 부활절", "S"),
    (d("06-28"), d("07-04"), "기획전", "Canada Day Sale (7/1)", "공통 Summer Sale 직후", "S"),
    (d("08-24"), d("08-31"), "시즌", "Back to School", "8월 하순 공백", "S"),
    (d("12-26"), d("12-31"), "시즌", "Boxing Week (공통 Holiday 안에서)", "캐나다 박싱위크", "S"),
]
CH["기타 국가(뉴질랜드 포함)"] = []  # 공통 일정을 따름

# 국가별 주요 시즌 이벤트(참고) — (시작, 종료, 이벤트). 대부분 국가 공통이면 '해외 자사몰 (공통)', 특정 국가면 해당 국가에만.
SEASON = {
    "해외 자사몰 (공통)": [
        (d("01-01"), d("01-01"), "New Year"),
        (d("02-14"), d("02-14"), "Valentine's Day"),
        (d("05-09"), d("05-09"), "Mother's Day (영국은 3/7)"),
        (d("06-20"), d("06-20"), "Father's Day (대만 8/8·호주 9/5)"),
        (d("10-31"), d("10-31"), "Halloween"),
        (d("11-26"), d("11-26"), "Black Friday"),
        (d("11-29"), d("11-29"), "Cyber Monday"),
        (d("12-25"), d("12-25"), "Christmas"),
    ],
    "홍콩·마카오": [
        (d("01-24"), d("02-06"), "春節 CNY (설 2/6, 구매는 설 전 2주)"), (d("03-08"), d("03-08"), "38 女神節"), (d("06-18"), d("06-18"), "6.18"),
        (d("09-15"), d("09-15"), "中秋節"), (d("11-11"), d("11-11"), "雙11"), (d("12-12"), d("12-12"), "雙12"),
        (d("12-26"), d("12-26"), "Boxing Day"),
    ],
    "대만": [
        (d("01-24"), d("02-06"), "春節 (설 2/6, 구매는 설 전 2주)"), (d("03-08"), d("03-08"), "婦女節"), (d("05-20"), d("05-20"), "520"),
        (d("06-18"), d("06-18"), "618"), (d("08-08"), d("08-08"), "父親節·七夕 (8/8)"), (d("09-15"), d("09-15"), "中秋節"),
        (d("11-11"), d("11-11"), "雙11"), (d("12-12"), d("12-12"), "雙12"),
    ],
    "싱가포르": [
        (d("01-24"), d("02-06"), "CNY (2/6, 구매는 설 전 2주)"), (d("03-03"), d("03-03"), "3.3"), (d("03-09"), d("03-09"), "Hari Raya (예상)"),
        (d("06-06"), d("06-06"), "6.6"), (d("06-15"), d("07-31"), "Great Singapore Sale 시즌 (공지 확인)"),
        (d("09-09"), d("09-09"), "9.9"), (d("09-15"), d("09-15"), "Mid-Autumn"), (d("10-10"), d("10-10"), "10.10"),
        (d("10-28"), d("10-28"), "Deepavali (10월 말 예상)"), (d("11-11"), d("11-11"), "11.11"), (d("12-12"), d("12-12"), "12.12"),
    ],
    "호주": [
        (d("03-28"), d("03-28"), "Easter"), (d("06-30"), d("06-30"), "EOFY"), (d("09-05"), d("09-05"), "Father's Day (AU)"),
        (d("11-09"), d("11-09"), "Click Frenzy (공지 확인)"), (d("12-26"), d("12-26"), "Boxing Day"),
    ],
    "말레이시아": [
        (d("01-24"), d("02-06"), "CNY (2/6, 구매는 설 전 2주)"), (d("03-09"), d("03-09"), "Hari Raya Aidilfitri (예상)"), (d("09-09"), d("09-09"), "9.9"),
        (d("09-15"), d("09-15"), "Mid-Autumn"), (d("10-10"), d("10-10"), "10.10"), (d("10-28"), d("10-28"), "Deepavali (10월 말 예상)"),
        (d("11-11"), d("11-11"), "11.11"), (d("12-12"), d("12-12"), "12.12"),
    ],
    "일본": [
        (d("01-01"), d("01-03"), "初売り·福袋"), (d("03-14"), d("03-14"), "ホワイトデー"), (d("04-29"), d("05-05"), "ゴールデンウィーク"),
        (d("08-13"), d("08-16"), "お盆"),
    ],
    "영국": [
        (d("01-01"), d("01-15"), "January Sales"), (d("03-07"), d("03-07"), "Mothering Sunday (UK)"), (d("03-28"), d("03-28"), "Easter"),
        (d("12-26"), d("12-26"), "Boxing Day"),
    ],
    "캐나다": [
        (d("03-28"), d("03-28"), "Easter"), (d("07-01"), d("07-01"), "Canada Day"), (d("08-20"), d("09-06"), "Back to School"),
        (d("10-11"), d("10-11"), "Thanksgiving (CA)"), (d("12-26"), d("12-26"), "Boxing Day/Week"),
    ],
    "기타 국가(뉴질랜드 포함)": [
        (d("03-28"), d("03-28"), "Easter (NZ)"), (d("09-05"), d("09-05"), "Father's Day (NZ)"),
    ],
}

# 캘린더 행 순서 (그룹, 채널명, 목표 시트 행 이름 or 합계 대상)
LAYOUT = [
    ("국내 자사몰", ["자사몰"]),
    ("국내 외부채널", ["29CM", "무신사", "지그재그", "에이블리", "스마트스토어", "카카오톡 선물하기", "롯데면세점", "신라면세점", "신세계면세점"]),
    ("오프라인", ["전매장 (공통)", "베리시 성수", "베리시 동성수", "베리시 명동", "베리시 안국", "베리시 도산", "베리시 신제주",
                "베리시 제주 애월", "베리시 동부산 아울렛", "베리시 스타필드 하남", "베리시 신세계 대전"]),
    ("해외 자사몰(미국 제외)", ["해외 자사몰 (공통)", "홍콩·마카오", "대만", "싱가포르", "호주", "말레이시아", "일본", "영국", "캐나다", "기타 국가(뉴질랜드 포함)"]),
]
TARGET_ALIAS = {  # 캘린더 행 → 목표 시트 행(합산)
    "자사몰": ["자사몰", "자사몰(네이버페이 주문형)"],
    "전매장 (공통)": ["오프라인 소계"],
    "해외 자사몰 (공통)": ["해외 자사몰(미국 제외) 소계"],
}

KEY_DATES = [
    ("01-01", "전 국가", "신정"),
    ("02-06", "국내·중화권·SG·MY", "설 / 춘절 (국내 연휴 2/6~9)"),
    ("02-14", "전 국가", "발렌타인데이"),
    ("03-07", "영국", "Mothering Sunday"),
    ("03-08", "중화권", "38 여성의 날"),
    ("03-09", "말레이시아", "Hari Raya Aidilfitri (예상, 3/9~10)"),
    ("03-14", "국내·일본", "화이트데이"),
    ("03-28", "AU·GB·CA", "Easter Sunday"),
    ("04-29", "일본", "골든위크 시작 (~5/5)"),
    ("05-01", "중화권", "노동절"),
    ("05-05", "국내", "어린이날"),
    ("05-08", "국내", "어버이날"),
    ("05-09", "HK·TW·SG·MY·AU·JP·CA", "Mother's Day"),
    ("05-17", "국내", "성년의 날"),
    ("05-20", "중화권", "520"),
    ("06-18", "중화권", "6.18"),
    ("06-30", "호주", "EOFY (회계연도 말)"),
    ("07-01", "캐나다", "Canada Day"),
    ("08-08", "대만", "七夕 (칠석)"),
    ("09-15", "국내·중화권", "추석 / 중추절 (국내 연휴 9/14~16)"),
    ("10-01", "중국", "국경절 (~10/7)"),
    ("10-10", "SG·MY·TW", "10.10"),
    ("11-11", "국내·중화권·SG·MY", "빼빼로데이 / 11.11"),
    ("11-26", "전 국가", "Black Friday"),
    ("11-29", "전 국가", "Cyber Monday"),
    ("12-12", "중화권·SG·MY", "12.12"),
    ("12-25", "전 국가", "크리스마스"),
    ("12-26", "AU·GB·CA·HK", "Boxing Day"),
]


# ---------------- 2027 월별 목표 (목표 워크북 수식을 값으로 평가) ----------------
def load_targets(path):
    wb = openpyxl.load_workbook(path)
    ws, wa = wb["채널별_월별목표"], wb["가정"]

    def val(sheet, ref):
        return sheet[ref.replace("$", "")].value

    out = {}
    rows = {r[1].value: r for r in ws.iter_rows(min_row=5) if r[1].value}
    for name, r in rows.items():
        if not str(r[5].value or "").startswith("=가정!"):  # 소계·합계 행
            continue
        dd_, uu = r[3].value, r[4].value
        g = val(wa, r[5].value.split("!")[1])
        vals = []
        for c in r[6:18]:
            ref = re.search(r"가정!(\$?[A-Z]+\$?\d+)", c.value).group(1)
            vals.append((dd_ + uu) * val(wa, ref) * (1 + g))
        out[name] = vals
    for sub, prefix in (("오프라인 소계", None), ("해외 자사몰(미국 제외) 소계", None)):
        grp = {"오프라인 소계": "오프라인", "해외 자사몰(미국 제외) 소계": "해외 자사몰(미국 제외)"}[sub]
        members = [r[1].value for r in ws.iter_rows(min_row=5) if r[0].value == grp and r[1].value in out]
        out[sub] = [sum(out[m][i] for m in members) for i in range(12)]
    return out


targets = load_targets(TARGET_XLSX)


def target_of(ch):
    names = TARGET_ALIAS.get(ch, [ch])
    if not all(n in targets for n in names):
        return None
    return [sum(targets[n][i] for n in names) for i in range(12)]


# ---------------- 이벤트 정리 ----------------
for ch, evs in CH.items():
    for s, e, *_ in evs:
        assert s <= e and s.year == Y and e.year == Y, (ch, s, e)

GROUP_OF = {ch: g for g, chs in LAYOUT for ch in chs}

# =====================================================================
#                              WORKBOOK
# =====================================================================
BOLD = Font(bold=True)
TITLE = Font(bold=True, size=14)
SMALL = Font(size=8)
GREY = Font(color="808080", size=9)
HEADER_FILL = PatternFill("solid", fgColor="D9E1F2")
GROUP_FILL = PatternFill("solid", fgColor="EDEDED")
WEEKEND_FILL = PatternFill("solid", fgColor="F7F7F7")
HOLI_FILL = PatternFill("solid", fgColor="FCE4D6")
FILL = {
    "R": PatternFill("solid", fgColor="BDD7EE"),
    "RL": PatternFill("solid", fgColor="C6E0B4"),
    "S": PatternFill("solid", fgColor="FFD966"),
}
SEASON_FILL = PatternFill("solid", fgColor="F8CBAD")
WD = "월화수목금토일"
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)


def kind_key(ev):
    return "RL" if ev[5] == "R" and ev[2] == "런칭" else ev[5]


wb = Workbook()

# ---------------- 캘린더 (일별 간트, 겹치면 레인 분리) ----------------
wc = wb.active
wc.title = "캘린더"
days = [date(Y, 1, 1) + timedelta(days=i) for i in range(365)]
C0 = 4  # 1열 그룹, 2열 채널, 3열 레인 / 날짜는 4열부터
col_of = {dd_: C0 + i for i, dd_ in enumerate(days)}
holidays = {d(md) for md, *_ in KEY_DATES}

wc["A1"] = f"{Y} 채널별 프로모션 캘린더"
wc["A1"].font = TITLE
wc["A2"] = "파랑 = 2026·2025 실행 이력 이월 · 초록 = 이력 기반 런칭 슬롯(제품 TBD) · 노랑 = 공백 기간 제안 · 분홍◆ = 국가별 주요 시즌 이벤트(참고, 해외 행 맨 윗줄) · 날짜 머리글 주황 = 주요 일자"
wc["A2"].font = GREY
for m in range(1, 13):
    first = date(Y, m, 1)
    last = (date(Y, m + 1, 1) if m < 12 else date(Y + 1, 1, 1)) - timedelta(days=1)
    wc.merge_cells(start_row=4, start_column=col_of[first], end_row=4, end_column=col_of[last])
    c = wc.cell(row=4, column=col_of[first], value=f"{m}월")
    c.font, c.fill, c.alignment = BOLD, HEADER_FILL, Alignment(horizontal="center")
for dd_ in days:
    c = wc.cell(row=5, column=col_of[dd_], value=dd_.day)
    c.font, c.alignment = SMALL, Alignment(horizontal="center")
    if dd_ in holidays:
        c.fill = HOLI_FILL
    elif dd_.weekday() >= 5:
        c.fill = WEEKEND_FILL
    wc.column_dimensions[get_column_letter(col_of[dd_])].width = 2.6
for i, h in enumerate(["그룹", "채널 / 매장 / 국가"], start=1):
    c = wc.cell(row=5, column=i, value=h)
    c.font, c.fill = BOLD, HEADER_FILL
wc.column_dimensions["A"].width = 14
wc.column_dimensions["B"].width = 24
wc.column_dimensions["C"].width = 2

r = 6
for g, chs in LAYOUT:
    wc.cell(row=r, column=1, value=g).font = BOLD
    for col in range(1, C0 + 365):
        wc.cell(row=r, column=col).fill = GROUP_FILL
    r += 1
    for ch in chs:
        lanes = []  # 각 레인의 마지막 종료일
        placed = []
        for ev in sorted(CH[ch], key=lambda x: (x[0], x[1])):
            for li, end in enumerate(lanes):
                if ev[0] > end:
                    lanes[li] = ev[1]
                    break
            else:
                li = len(lanes)
                lanes.append(ev[1])
            placed.append((li, ev))
        n = max(1, len(lanes))
        seas = SEASON.get(ch)
        if seas:  # 맨 위 레인 = 시즌 이벤트(참고)
            placed = [(li + 1, ev) for li, ev in placed]
            n = len(lanes) + 1
            for s, e, label in seas:
                for col in range(col_of[s], col_of[e] + 1):
                    wc.cell(row=r, column=col).fill = SEASON_FILL
                c = wc.cell(row=r, column=col_of[s], value=f"◆{label}")
                c.font = Font(size=8, italic=True, color="833C0B")
        wc.cell(row=r, column=2, value=ch).font = BOLD
        if n > 1:
            wc.merge_cells(start_row=r, start_column=2, end_row=r + n - 1, end_column=2)
        wc.cell(row=r, column=2).alignment = Alignment(vertical="center")
        for li, ev in placed:
            s, e, typ, name, basis, kind = ev
            rr = r + li
            c1, c2 = col_of[s], col_of[e]
            if c2 > c1:
                wc.merge_cells(start_row=rr, start_column=c1, end_row=rr, end_column=c2)
            c = wc.cell(row=rr, column=c1, value=name)
            c.fill, c.font = FILL[kind_key(ev)], Font(size=8)
            c.alignment = Alignment(horizontal="left", vertical="center", shrink_to_fit=False)
            for col in range(c1, c2 + 1):
                wc.cell(row=rr, column=col).fill = FILL[kind_key(ev)]
                wc.cell(row=rr, column=col).border = BOX
        for k in range(n):
            wc.row_dimensions[r + k].height = 15
        r += n
wc.freeze_panes = wc.cell(row=6, column=C0)

# ---------------- 월별 요약 (프로모션 + 2027 월 목표) ----------------
wm = wb.create_sheet("월별_요약")
wm["A1"] = f"{Y} 월별 프로모션 요약 · 각 채널 아래 줄 = 2027 월 매출 목표(백만원, 목표 워크북 기준)"
wm["A1"].font = TITLE
hdr = ["그룹", "채널 / 매장 / 국가", ""] + [f"{m}월" for m in range(1, 13)] + ["연간"]
for i, h in enumerate(hdr, start=1):
    c = wm.cell(row=3, column=i, value=h)
    c.font, c.fill = BOLD, HEADER_FILL
    c.alignment = Alignment(horizontal="center", vertical="center")
r = 4
for g, chs in LAYOUT:
    wm.cell(row=r, column=1, value=g).font = BOLD
    for col in range(1, 17):
        wm.cell(row=r, column=col).fill = GROUP_FILL
    r += 1
    for ch in chs:
        wm.cell(row=r, column=2, value=ch).font = BOLD
        wm.cell(row=r, column=3, value="프로모션").font = GREY
        for m in range(1, 13):
            items = []
            for s, e, typ, name, basis, kind in sorted(CH[ch]):
                if s.month <= m <= e.month:
                    mark = "☆" if kind == "S" else ""
                    items.append(f"{mark}{name} ({s.month}/{s.day}~{e.month}/{e.day})")
            c = wm.cell(row=r, column=3 + m, value="\n".join(items) if items else "")
            c.alignment = Alignment(wrap_text=True, vertical="top")
            c.font = Font(size=8)
            c.border = BOX
            if not items:
                c.fill = PatternFill("solid", fgColor="FFF2CC")
        wm.row_dimensions[r].height = max(30, 11 * max(
            (sum(1 for s, e, *_ in CH[ch] if s.month <= m <= e.month) for m in range(1, 13)), default=1))
        if ch in SEASON:
            r += 1
            wm.cell(row=r, column=3, value="◆시즌").font = Font(size=9, color="833C0B")
            for m in range(1, 13):
                ev = [f"{lab} ({s.month}/{s.day}{'' if e == s else f'~{e.month}/{e.day}'})"
                      for s, e, lab in SEASON[ch] if s.month <= m <= e.month]
                c = wm.cell(row=r, column=3 + m, value="\n".join(ev))
                c.font, c.border = Font(size=8, italic=True, color="833C0B"), BOX
                c.alignment = Alignment(wrap_text=True, vertical="top")
                if ev:
                    c.fill = SEASON_FILL
            wm.row_dimensions[r].height = max(15, 11 * max(
                sum(1 for s, e, _ in SEASON[ch] if s.month <= m <= e.month) for m in range(1, 13)))
        t = target_of(ch)
        wm.cell(row=r + 1, column=3, value="목표").font = GREY
        if t:
            for m in range(1, 13):
                c = wm.cell(row=r + 1, column=3 + m, value=round(t[m - 1]))
                c.number_format, c.font = "#,##0", GREY
            c = wm.cell(row=r + 1, column=16, value=round(sum(t)))
            c.number_format, c.font = "#,##0", Font(bold=True, color="808080", size=9)
        else:
            wm.cell(row=r + 1, column=4, value="(매장별 목표에 포함)").font = GREY
        r += 2
wm.column_dimensions["A"].width = 14
wm.column_dimensions["B"].width = 22
wm.column_dimensions["C"].width = 8
for m in range(1, 13):
    wm.column_dimensions[get_column_letter(3 + m)].width = 26
wm.column_dimensions["P"].width = 9
wm.freeze_panes = "D4"

# ---------------- 프로모션 목록 (통합 DB 컬럼 형식) ----------------
wl = wb.create_sheet("프로모션_목록")
cols = ["시작일", "종료일", "진행기간", "채널구분", "채널명", "마케팅종류", "프로모션명", "구분", "근거 / 메모"]
for i, h in enumerate(cols, start=1):
    c = wl.cell(row=1, column=i, value=h)
    c.font, c.fill = BOLD, HEADER_FILL
rows = []
for g, chs in LAYOUT:
    for ch in chs:
        for s, e, typ, name, basis, kind in CH[ch]:
            rows.append((s, e, g, ch, typ, name, kind, basis))
rows.sort(key=lambda x: (x[0], x[2], x[3]))
for i, (s, e, g, ch, typ, name, kind, basis) in enumerate(rows, start=2):
    vals = [s, e, f"{(e - s).days + 1}일", g, ch, typ, name,
            "제안" if kind == "S" else ("이력 이월(런칭 슬롯)" if typ == "런칭" else "이력 이월"), basis]
    for j, v in enumerate(vals, start=1):
        c = wl.cell(row=i, column=j, value=v)
        if j <= 2:
            c.number_format = "yyyy-mm-dd"
    wl.cell(row=i, column=8).fill = FILL["S" if kind == "S" else ("RL" if typ == "런칭" else "R")]
wl.auto_filter.ref = f"A1:I{len(rows) + 1}"
wl.freeze_panes = "A2"
for i, w in enumerate([11, 11, 8, 20, 22, 11, 52, 18, 52], start=1):
    wl.column_dimensions[get_column_letter(i)].width = w

# ---------------- 주요 일자 ----------------
wk = wb.create_sheet("2027_주요일자")
for i, h in enumerate(["일자", "요일", "국가", "이벤트"], start=1):
    c = wk.cell(row=1, column=i, value=h)
    c.font, c.fill = BOLD, HEADER_FILL
for i, (md, ctry, ev) in enumerate(KEY_DATES, start=2):
    dt = d(md)
    wk.cell(row=i, column=1, value=dt).number_format = "yyyy-mm-dd"
    wk.cell(row=i, column=2, value=WD[dt.weekday()])
    wk.cell(row=i, column=3, value=ctry)
    wk.cell(row=i, column=4, value=ev)
for i, w in enumerate([12, 6, 24, 40], start=1):
    wk.column_dimensions[get_column_letter(i)].width = w

# ---------------- 국가별 시즌 이벤트 ----------------
wse = wb.create_sheet("국가별_시즌이벤트")
for i, h in enumerate(["구분", "시작", "종료", "요일", "이벤트", "같은 기간 프로모션 (공통 + 해당 국가)"], start=1):
    c = wse.cell(row=1, column=i, value=h)
    c.font, c.fill = BOLD, HEADER_FILL
r = 2
for ch, evs in SEASON.items():
    pool = CH["해외 자사몰 (공통)"] + (CH[ch] if ch != "해외 자사몰 (공통)" else [])
    for s, e, label in evs:
        hit = [p[3] for p in pool if p[0] <= e and p[1] >= s]
        vals = ["공통 (전 국가)" if ch == "해외 자사몰 (공통)" else ch, s, e, WD[s.weekday()], label,
                " / ".join(hit) if hit else "— (프로모션 없음)"]
        for j, v in enumerate(vals, start=1):
            c = wse.cell(row=r, column=j, value=v)
            if j in (2, 3):
                c.number_format = "yyyy-mm-dd"
        if not hit:
            wse.cell(row=r, column=6).fill = PatternFill("solid", fgColor="FFF2CC")
        r += 1
wse.auto_filter.ref = f"A1:F{r - 1}"
wse.freeze_panes = "A2"
for i, w in enumerate([22, 11, 11, 6, 36, 80], start=1):
    wse.column_dimensions[get_column_letter(i)].width = w

# ---------------- 기준 ----------------
wn = wb.create_sheet("기준")
notes = [
    "작성 기준",
    "1) 출처: Verish_통합 DB(구글시트) 2025~2026 프로모션 이력. 알림톡·친구톡·문자 등 메시지 발송, 인플루언서 개별 공구(유튜브·인스타)는 제외.",
    "2) 이월 규칙: 2026 일정을 같은 요일로 +364일 이동(예: 26.1.7 수 → 27.1.6 수). 2026에 없던 반복 행사는 2025 일정을 사용.",
    "   명절 연동(설 2/6, 추석 9/15)과 숫자데이(11.11·6.18 등)는 2027 실제 일자 기준으로 맞춤.",
    "3) 런칭 프로모션은 제품이 미정이라 '런칭 슬롯'으로 표시(2026 같은 시기 런칭 제품을 근거에 기재).",
    "4) 제안(노랑·☆)은 비어 있는 기간에 해당 국가·채널의 주요 시즌 이벤트를 넣은 것. 면세점은 DB 이력이 없어 전부 관광 수요 시즌 제안.",
    "5) 해외 자사몰은 '공통' 행(전 국가 Shopify 프로모션) + 국가별 행(국가 고유 이벤트)으로 나눔. 국가 행은 공통 일정 위에 얹는 개념.",
    "6) 국가별 주요 시즌 이벤트(분홍 ◆, 참고용): 대부분 국가에 해당하면 '해외 자사몰 (공통)' 줄에, 특정 국가에만 있으면 해당 국가 줄에만 표기.",
    "   공통이지만 날짜가 다른 국가는 예외로 적음(어머니날: 영국 3/7 · 아버지날: 대만 8/8, 호주·뉴질랜드 9/5). '국가별_시즌이벤트' 시트에서 같은 기간 프로모션 유무 대조.",
    "7) 채널 범위는 2027 매출 목표와 동일. 올리브영(온·오프)·해외 외부몰(쇼피·큐텐·틱톡·티몰 등)·미국은 제외.",
    "8) 월별_요약의 목표 줄은 reports/2027_매출목표.xlsx 수식을 값으로 계산한 것(성장률을 바꾸면 이 파일도 다시 생성).",
    "확인 필요",
    "· 플랫폼 행사(이구위크·무진장·이너페 등)는 2027 플랫폼 공지 일정으로 확정 필요. 면세점·백화점 정기세일·Click Frenzy 일정도 공지 확인.",
    "· Hari Raya(3/9~10)는 예상일. 매장 주년 행사는 오픈일 기준 제안.",
]
for i, t in enumerate(notes, start=1):
    wn.cell(row=i, column=1, value=t).font = BOLD if t in ("작성 기준", "확인 필요") else Font()
wn.column_dimensions["A"].width = 140

wb.save(OUT)
n_r = sum(1 for x in rows if x[6] == "R")
print(f"saved {OUT}: events {len(rows)} (이력 이월 {n_r}, 제안 {len(rows) - n_r})")
for g, chs in LAYOUT:
    for ch in chs:
        empty = [m for m in range(1, 13) if not any(s.month <= m <= e.month for s, e, *_ in CH[ch])]
        t = target_of(ch)
        print(f"  {ch:<18} {len(CH[ch]):>2}건  공백월 {empty}  목표 {round(sum(t)) if t else '-'}")
