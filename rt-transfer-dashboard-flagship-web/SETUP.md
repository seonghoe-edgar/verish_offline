# 플래그십 RT 대시보드 - Vercel 배포

[rt-transfer-dashboard-web](../rt-transfer-dashboard-web/SETUP.md)(애월·신제주)와 완전히 같은 방식의
정적 사이트입니다. 별도 Vercel 프로젝트로 만드세요 (같은 프로젝트에 합치지 않음 — 사용자 요청).

## 1. Vercel 프로젝트 생성 (최초 1회, 사람이 직접)

1. https://vercel.com/dashboard → "Add New..." → "Project"
2. `seonghoe-edgar/verish_offline` 선택해서 Import
3. **주의**: Import 화면의 Root Directory 선택창은 `main` 브랜치 기준으로 폴더를 스캔해서
   `rt-transfer-dashboard-flagship-web`이 안 보입니다 — 그냥 기본값(`./`)으로 두고 **Deploy**까지
   진행하세요 (첫 배포는 실패해도 정상, 프로젝트 껍데기만 만드는 목적).
4. 프로젝트 생성 후 **Settings → Environments → Production → Branch Tracking**에서
   브랜치를 `online-folder-snapshot`으로 저장
5. **Settings → General → Build and Deployment**에서 Root Directory를
   `rt-transfer-dashboard-flagship-web`으로 직접 입력
6. **Deployments** 탭에서 최신 커밋으로 Redeploy (또는 새 push가 있으면 자동으로 재배포됨)

## 2. 자동 갱신

`rt-transfer-dashboard/run-refresh.ps1`이 매일 11:00에 이 폴더의 `index.html`도 함께 갱신하고
`online-folder-snapshot`에 push합니다 — 애월/신제주 쪽과 같은 스케줄러 작업 1개로 두 배포 모두 처리.

## 3. 접근 제어

[rt-transfer-dashboard-web/SETUP.md](../rt-transfer-dashboard-web/SETUP.md)와 동일 — 현재 별도
passcode 게이트 없음.
