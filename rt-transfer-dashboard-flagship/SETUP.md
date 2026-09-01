# 플래그십 RT 대시보드 (도산·안국·명동·성수)

도산(VRDSFS)·안국(VRAGFS)·명동(VRMDFS)·성수(VRSSFS) 4개 매장이 **하나의 풀로 상호 RT**하는
경우의 OOS 위험/이동 후보를 보여줍니다. [애월·신제주 대시보드](../rt-transfer-dashboard/SETUP.md)와
계산 로직을 공유하지만(둘 다 `rt-transfer-dashboard/rt-engine.cjs`), 매장 풀이 다르고 물리적으로도
별개의 RT 네트워크(제주 vs 서울)라 대시보드/Vercel 배포는 완전히 분리했습니다.

## 구성

- `refresh.cjs` — 이 4개 매장을 `../rt-transfer-dashboard/rt-engine.cjs`의 `buildSnapshot()`에
  넘겨서 계산하고, `data.json` + `rt_dashboard.html`(공용 템플릿 사용) + Vercel용 사본을 생성.
- `data.json` — 계산 결과 원본 스냅샷.
- `rt_dashboard.html` — 매일 갱신되는 실제 화면 파일 (Claude Artifact로 재발행 가능).

## N개 매장 풀 매칭 로직 (2개 매장 pairwise와 다른 점)

- 매장이 3개 이상이면 한 SKU에 위험 매장이 여러 개, donor(재고 여유) 매장도 여러 개일 수 있음.
- 위험 매장을 급한 순(재고 0 → 소진임박)으로 먼저 처리하고, 그때마다 "자기 몫 7일치를 남기고도
  여유가 가장 많은" donor 매장 **하나**를 골라 매칭 — 한 SKU가 여러 donor로 나눠서 오지는 않음
  (표 한 줄에 여러 이동이 뜰 수는 있지만, 각 이동은 항상 단일 출발지→단일 도착지).
- donor를 고른 뒤엔 그 donor의 남은 여유를 차감하고 다음 위험 매장으로 넘어감 — 같은 donor
  재고를 여러 매장이 동시에 중복으로 가져가지 않도록 함.
- 자세한 계산식은 `rt-transfer-dashboard/rt-engine.cjs`의 `buildSnapshot()` 참고.

## 자동화

애월/신제주 쪽과 **같은 스케줄러 작업**(`VerishRTDashboardDailyUpdate`, 매일 11:00)에서 이 폴더도
함께 갱신 + push됩니다 — `rt-transfer-dashboard/run-refresh.ps1`이 두 refresh.cjs를 순서대로 실행.

## 수동 실행

```bash
cd rt-transfer-dashboard-flagship
node refresh.cjs
```
