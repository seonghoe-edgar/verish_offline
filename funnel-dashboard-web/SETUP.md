# Verish 퍼널 대시보드 - 설치/배포 가이드

카페24 자사몰의 **상품별 조회수 · 장바구니담기율 · 구매전환율**을 주단위로 보여주는 대시보드입니다.
Cafe24 API 자격증명은 Vercel에 올라가지 않습니다 — 로컬(또는 스케줄 작업)에서 매주 스냅샷 JSON을 만들어 git에 커밋하면, Vercel은 그 정적 JSON만 읽습니다.

## 데이터 구조

- `public/data/weekly-summary.json` — 최근 12주치 주간 요약(세션수/유효주문수/전환율/매출/객단가). 트렌드 차트에 사용.
- `public/data/latest-products.json` — 가장 최근 완료 주(월~일)의 상품별 조회수/장바구니담기/판매수량/매출/구매전환율.
- 두 파일 모두 `../scripts/funnel-dashboard-snapshot.ts`가 생성합니다.

## 1. 로컬에서 데이터 스냅샷 만들기

`verish_offline` 루트에서 (Cafe24 토큰이 `credentials/cafe24-tokens.json`에 이미 있어야 함 — 없으면 `npm run cafe24-setup`으로 먼저 인증):

```bash
npx tsx scripts/funnel-dashboard-snapshot.ts
```

- 인자 없이 실행하면 "오늘(KST) 기준으로 완료된 지난 주(월~일)"를 집계합니다. 매주 월요일에 실행하면 자동으로 바로 전주가 대상이 됩니다.
- 특정 기준일로 테스트하려면: `npx tsx scripts/funnel-dashboard-snapshot.ts 2026-08-20` (그 날짜가 속한 주의 전주를 집계).
- 실행 시간은 그 주 주문량에 따라 몇 분 걸릴 수 있습니다(날짜별로 `/admin/orders` 전량 페이지네이션).

## 2. 로컬에서 웹앱 확인

```bash
cd funnel-dashboard-web
npm install
npm run dev
```

`http://localhost:3000`에서 확인. `.env.local`에 `DASHBOARD_PASSCODE`를 설정해야 로그인 화면이 정상 동작합니다(이미 생성돼 있음 — 운영 배포 시에는 다른 값으로 바꾸는 걸 권장).

## 3. Vercel 배포

`verish_offline` 로컬 저장소와 원격 `main`이 서로 모르게 갈라져 있던 상태라(다른 PC/폴더에서 같은 remote에 별도로 push해온 히스토리가 있었음), 이번 대시보드 코드는 `main`이 아니라 **`funnel-dashboard` 브랜치**로 push해뒀습니다. 두 히스토리를 어떻게 정리할지는 별도 결정이 필요해서 건드리지 않았습니다.

1. (이미 완료) `funnel-dashboard` 브랜치가 GitHub에 push돼 있음.
2. [vercel.com](https://vercel.com) → GitHub 계정으로 로그인 → **Add New Project** → `verish_offline` 레포 선택.
3. **Root Directory**를 `funnel-dashboard-web`로 지정 (레포 루트가 아니라 이 하위 폴더가 Next.js 앱이므로 반드시 지정해야 함).
4. import 화면에서(또는 이후 프로젝트 **Settings → Git → Production Branch**에서) 대상 브랜치를 `funnel-dashboard`로 지정 — 기본값인 `main`으로 두면 이 코드가 안 잡힙니다.
5. **Environment Variables**에 `DASHBOARD_PASSCODE` 추가 (전사 공유용 비밀번호 — Cafe24 자격증명은 여기 넣지 않음).
6. **Deploy** 클릭 → 몇 분 뒤 `프로젝트명.vercel.app` URL 발급. 그 링크 + 비밀번호를 공유하면 됩니다.

이후 주간 자동 업데이트(아래 4번)도 이 PC의 로컬 저장소가 지금 `funnel-dashboard` 브랜치에 체크아웃된 채로 커밋/푸시하도록 돼 있습니다.

## 4. 매주 자동 업데이트 (매주 월요일 11:00, 이 PC의 Windows 작업 스케줄러)

Claude Code의 클라우드 스케줄(routine)은 매번 새 클라우드 환경에 깃허브 레포만 체크아웃하는 방식이라, `.gitignore`로 보호된 로컬 `credentials/cafe24-tokens.json`에 접근할 수 없습니다(의도적으로 커밋되지 않음). Cafe24 자격증명을 클라우드에 별도로 복제해두는 대신, **이 PC의 Windows 작업 스케줄러**에 등록해 로컬 토큰 파일을 그대로 재사용하는 방식으로 자동화했습니다.

- 등록된 작업: `VerishFunnelDashboardWeeklyUpdate` (매주 월요일 11:00, 로컬 시간 기준 — 이 PC는 이미 Asia/Seoul)
- 실행 스크립트: `verish_offline/scripts/weekly-funnel-update.ps1`
  1. `npx tsx scripts/funnel-dashboard-snapshot.ts` 실행
  2. `funnel-dashboard-web/public/data`에 변경이 있으면 `git add`/`commit`/`push` (변경 없으면 커밋 생략)
  3. 성공/실패 로그를 `funnel-dashboard-web/update-log.txt`에 기록 (실패 시 Cafe24 재인증 필요 여부 등 사유 포함)
- push되면 Vercel이 자동으로 재배포합니다.

확인/관리 명령:
```powershell
Get-ScheduledTask -TaskName "VerishFunnelDashboardWeeklyUpdate"          # 상태 확인
Start-ScheduledTask -TaskName "VerishFunnelDashboardWeeklyUpdate"        # 지금 바로 1회 실행(테스트)
Unregister-ScheduledTask -TaskName "VerishFunnelDashboardWeeklyUpdate"   # 삭제
```

**주의**: 이 방식은 이 PC가 매주 월요일 11시에 켜져 있어야 동작합니다(꺼져 있으면 그 주는 건너뜀 — `StartWhenAvailable` 설정으로 다음 부팅 시 바로 실행은 되지만 늦게 반영될 수 있음). `update-log.txt`에 "refresh_token이 만료됐습니다" 같은 에러가 남으면 `npm run cafe24-setup`으로 사람이 직접 재인증해야 합니다.

## 5. 이후 관리

- **집계 로직 수정**(예: below_avg 기준 임계값, 컬럼 추가)은 `scripts/funnel-dashboard-snapshot.ts`에서.
- **화면 수정**은 `funnel-dashboard-web/app/`에서 — 코드 수정 후 git push하면 Vercel이 자동 재배포합니다(데이터와 무관하게 코드 변경도 동일하게 재배포됨).
- `npm audit`에서 `postcss`/`sharp` 관련 high severity 경고가 있는데, 이 앱은 사용자 업로드 이미지나 외부 CSS를 처리하지 않아 실질 위험은 낮습니다. 다음 Next.js major 업그레이드(16.x) 시 자연히 해결됩니다.
