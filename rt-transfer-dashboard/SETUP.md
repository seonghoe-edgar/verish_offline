# 애월·신제주 RT 대시보드

애월(VRJAFS)과 신제주(VRNJFS)는 PlayMD 상에서 RT(매장간 재고이동)로 재고를 공유하는 사이입니다.
이 대시보드는 두 매장의 최근 7일 평균 판매속도로 소진예상일을 계산해, 한쪽이 품절 임박(소진예상
7일 이내)인데 반대쪽에 재고가 있는 SKU를 RT 대상으로 자동 플래그합니다.

## 구성

- `rt-engine.cjs` — **공용 계산 엔진**. PlayMD에서 매장별 당일 재고(`stock_shop`)/최근 7일 판매(`sales`)를
  가져와 N개 매장이 하나의 풀로 상호 RT하는 경우의 위험/이동추천을 계산 (`buildSnapshot()`). 2개 매장
  (여기)뿐 아니라 4개 매장짜리 [플래그십 대시보드](../rt-transfer-dashboard-flagship/SETUP.md)도 이 엔진을
  그대로 가져다 씀 — store 목록만 다르게 넘기면 됨.
- `refresh.cjs` — 애월/신제주 store 목록으로 `rt-engine.cjs`를 호출하고 `data.json` + `rt_dashboard.html`을 생성.
- `rt_dashboard_template.html` — **공용 대시보드 화면 템플릿** (매장 수에 상관없이 동작하도록 매장별
  상태를 칩으로 렌더링). `__DASHBOARD_TITLE__` / `__SNAPSHOT_JSON__` / `__SNAPSHOT_TIME__` 치환.
  플래그십 대시보드도 이 파일을 그대로 참조함(복제 아님).
- `rt_dashboard.html` — 매일 갱신되는 실제 화면 파일. 로컬에서 그냥 더블클릭해서 열어도 되고,
  Claude Code 세션에서 Artifact로 재발행하면 공유 가능한 링크로도 볼 수 있습니다.
- `run-refresh.ps1` — Windows 작업 스케줄러가 매일 호출하는 래퍼 스크립트 (이 대시보드 +
  플래그십 대시보드 둘 다 갱신).
- `data.json` — 계산 결과 원본 스냅샷(디버깅/검증용).

## 판단 기준 (2026-08-26 기준 합의)

- 판매속도: 최근 7일(오늘 제외, 어제까지) 순판매수량 평균 — `qty` 합계에는 환불/교환(salesType=2)이
  이미 음수로 반영되어 있어 자동 상쇄됨.
- OOS 위험: 재고 0 이하이거나, 판매속도>0이고 `재고÷판매속도 <= 7일`.
- RT 대상: 한쪽이 위험 + 반대쪽이 재고 있음 + 반대쪽은 위험 아님 + 권장 이동수량이 2개 이상.
- 권장 이동수량: 위험한 쪽을 7일치까지 채우는 데 필요한 수량과, 공급하는 쪽이 자기 몫 7일치를
  남기고 낼 수 있는 여유 수량 중 작은 값. 공급 쪽 버퍼가 부족하면 수량 0 + "신중 검토" 메모로 표시.
  **참고용 추정치이며, 실제 이동은 현장 재고 실사와 함께 판단해야 합니다.**
- 최소 이동수량(`MIN_TRANSFER_QTY`, 기본 2개): 계산된 권장 이동수량이 이 값보다 적으면 RT 후보에서
  제외합니다 — 애월↔신제주 물류 왕복 비용 대비 1개 이동은 실익이 없다는 판단(2026-08-26 합의).

기준을 바꾸고 싶으면 `refresh.cjs` 상단의 `VELOCITY_WINDOW_DAYS`, `RISK_DAYS_THRESHOLD`만 수정하면 됩니다.

**3개 이상 매장이 하나의 풀로 RT하는 경우** (예: 플래그십 4개 매장)는 위험 매장을 급한 순으로 먼저
처리하면서 그때마다 "자기 몫 7일치를 남기고도 여유가 가장 많은" donor 매장 하나를 매칭하고, 매칭될
때마다 그 donor의 남은 여유를 차감합니다 — 자세한 내용은 `rt-engine.cjs`의 `buildSnapshot()` 참고.

## 자동화

Windows 작업 스케줄러에 매일 11:00 실행되는 작업이 등록되어 있습니다.

```powershell
Get-ScheduledTask -TaskName "VerishRTDashboardDailyUpdate"
```

- 등록 명령(이미 실행됨, 재등록/수정 시 참고):
  ```powershell
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\Users\DEEPDIVE\Desktop\projects\online\rt-transfer-dashboard\run-refresh.ps1`""
  $trigger = New-ScheduledTaskTrigger -Daily -At 11:00AM
  Register-ScheduledTask -TaskName "VerishRTDashboardDailyUpdate" -Action $action -Trigger $trigger -Force
  ```
- 실행 로그: `last-run.log` (같은 폴더에 매 실행마다 덮어쓰기).
- `run-refresh.ps1`은 이 대시보드와 [플래그십 대시보드](../rt-transfer-dashboard-flagship/SETUP.md)를
  순서대로 갱신한 뒤, 두 대시보드의 `data.json` / `rt_dashboard.html` / `*-web/index.html` 변경분만
  골라 `online-folder-snapshot` 브랜치로 자동 `git commit + push`합니다 — 이 push를 Vercel이 감지해
  각자의 정적 사이트가 자동 재배포되므로, 두 Vercel URL 모두 매일 실제로 최신 상태를 유지합니다
  (2026-08-26 사용자 승인, 자동 push 허용).
- **공유된 Claude Artifact 링크는 이 자동화 범위 밖입니다.** 그쪽까지 최신으로 올리려면 Claude Code
  세션에서 "RT 대시보드 최신으로 올려줘"라고 요청해야 합니다(Artifact는 세션에서만 재발행 가능).

## 수동 실행

```bash
cd rt-transfer-dashboard
node refresh.cjs
```
