# 애월·신제주 RT 대시보드 - Vercel 배포

`rt-transfer-dashboard/refresh.cjs`가 만드는 `index.html`(데이터가 그대로 박혀 있는 완전 정적 파일)을
그대로 서빙하는 정적 사이트입니다. 별도 서버/빌드 없이 Vercel이 파일만 서빙합니다.

## 배포 방식

기존 프로모션/퍼널 대시보드와 동일한 배치형 구조입니다:
**로컬에서 매일 데이터를 갱신 → `index.html`을 git push → Vercel이 push를 감지해 자동 재배포.**
Vercel 서버가 PlayMD를 직접 호출하지 않으므로 API 키가 Vercel에 올라가지 않습니다.

## 1. Vercel 프로젝트 생성 (최초 1회, 사람이 직접 — 브라우저 로그인 필요)

1. https://vercel.com 접속 → GitHub 계정으로 로그인
2. "Add New..." → "Project" → 이 레포(`seonghoe-edgar/verish_offline`) 선택
   - Import 화면에서 **Root Directory**를 `rt-transfer-dashboard-web`으로 지정
   - **Framework Preset**: "Other" (빌드 불필요, index.html을 그대로 서빙)
   - Build Command / Output Directory: 비워둠
3. **Production Branch**를 이 레포의 `online-folder-snapshot` 브랜치로 지정
   (이 레포는 다른 로컬 작업(`verish_offline` 폴더)과 `main`을 공유하고 있어서 갈라짐 문제가 있음 —
   `online-folder-snapshot` 브랜치만 쓰면 그 문제를 피할 수 있음)
4. Deploy. 완료되면 `https://<프로젝트명>.vercel.app` 같은 URL 발급됨.

## 2. 접근 제어

지금은 별도 passcode 게이트가 없습니다(순수 정적 파일이라 서버 로직을 넣기 애매함). 내부 SKU/재고
수치라 크게 민감하진 않지만, URL 공유 범위를 넓히고 싶지 않다면:
- Vercel 프로젝트 설정에서 Deployment Protection(플랜에 따라 제공) 사용을 검토하거나
- 필요해지면 Next.js 미들웨어 기반 passcode 게이트(기존 promo/funnel 대시보드 방식)로 전환 요청.

## 3. 자동 갱신

`rt-transfer-dashboard/run-refresh.ps1`이 매일 11:00 실행되며 이 폴더의 `index.html`을 갱신한 뒤
`online-folder-snapshot` 브랜치로 자동 `git commit + push`합니다(2026-08-26 사용자 승인). 이 push를
Vercel이 감지해 자동 재배포하므로, Production Branch를 반드시 `online-folder-snapshot`으로 지정해야
매일 최신 데이터가 반영됩니다. 자세한 조건/로그 위치는 `rt-transfer-dashboard/SETUP.md` 참고.
