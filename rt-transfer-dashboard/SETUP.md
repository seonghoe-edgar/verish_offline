# 애월·신제주 RT 대시보드

애월(VRJAFS)과 신제주(VRNJFS)는 PlayMD 상에서 RT(매장간 재고이동)로 재고를 공유하는 사이입니다.
이 대시보드는 두 매장의 최근 7일 평균 판매속도로 소진예상일을 계산해, 한쪽이 품절 임박(소진예상
7일 이내)인데 반대쪽에 재고가 있는 SKU를 RT 대상으로 자동 플래그합니다.

## 구성

- `refresh.cjs` — PlayMD API에서 두 매장의 당일 재고(`stock_shop`)와 최근 7일 판매(`sales`)를
  가져와 SKU 단위(productCode+color+size)로 병합·계산하고 `data.json` + `rt_dashboard.html`을 생성합니다.
- `rt_dashboard_template.html` — 대시보드 화면 템플릿 (`__SNAPSHOT_JSON__` / `__SNAPSHOT_TIME__` 치환).
- `rt_dashboard.html` — 매일 갱신되는 실제 화면 파일. 로컬에서 그냥 더블클릭해서 열어도 되고,
  Claude Code 세션에서 Artifact로 재발행하면 공유 가능한 링크로도 볼 수 있습니다.
- `run-refresh.ps1` — Windows 작업 스케줄러가 매일 호출하는 래퍼 스크립트.
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
- `run-refresh.ps1`은 데이터 갱신 후 `data.json` / `rt_dashboard.html` / `../rt-transfer-dashboard-web/index.html`
  변경분만 골라 `online-folder-snapshot` 브랜치로 자동 `git commit + push`합니다 — 이 push를 Vercel이
  감지해 [rt-transfer-dashboard-web](../rt-transfer-dashboard-web/SETUP.md)가 자동 재배포되므로, Vercel
  URL은 매일 실제로 최신 상태를 유지합니다(2026-08-26 사용자 승인, 자동 push 허용).
- **공유된 Claude Artifact 링크는 이 자동화 범위 밖입니다.** 그쪽까지 최신으로 올리려면 Claude Code
  세션에서 "RT 대시보드 최신으로 올려줘"라고 요청해야 합니다(Artifact는 세션에서만 재발행 가능).

## 수동 실행

```bash
cd rt-transfer-dashboard
node refresh.cjs
```
