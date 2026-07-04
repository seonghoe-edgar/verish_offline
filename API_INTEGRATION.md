# API 연동 기록

이 프로젝트는 세 개의 외부 서비스를 연동한다: 매장/상품/매출 데이터를 다루는
**PLAY MD**(TypeScript 클라이언트 직접 구현), 매장 방문객 분석 대시보드인
**mAsh**(TypeScript 클라이언트 직접 구현), 그리고 온라인 판매 채널인
**Shopify**(세션에 이미 연결된 MCP 커넥터, 별도 코드 불필요).

---

# 1부. PLAY MD API

## 1.1 개요

베리시(VERISH) 매장/상품/매출 데이터를 관리하는 PLAY MD 시스템의 Open API를
TypeScript 클라이언트로 연동. 문서 출처: Notion `[API] PLAY MD` (longhaired-ferret-10d
워크스페이스, 딥다이브 계정 기준 공유됨).

## 1.2 인증 및 기본 정보

| 항목 | 값 |
|---|---|
| Test URL | `https://t-playmd.xmd.co.kr` |
| Production URL | `https://external-api.xmd.co.kr` |
| 인증 헤더 | `PLAYMD-API-KEY`, `PLAYMD-TENANT` |
| 현재 tenant | `deepdive` (실제 데이터는 베리시(VERISH) 매장 기준) |
| Rate limit | 초당 5회 (초과 시 429) |
| 응답 규칙 | 등록/수정/삭제는 상태 200이면 성공, 바디 없음. 조회는 배열/객체 반환 |

- 자격 증명은 [.env](.env)에 저장 (`PLAYMD_API_KEY`, `PLAYMD_TENANT`, `PLAYMD_ENV=test|production`), `.gitignore`에 포함되어 커밋되지 않음.

## 1.3 프로젝트 구조

```
src/
  client.ts              # playMdRequest(), PlayMdApiError, 인증 헤더 자동 부착
  rateLimiter.ts          # 초당 5회 제한 큐잉
  test-connection.ts      # 최초 연결 확인용 스크립트 (npm run test-connection)
  test-all-gets.ts        # 전체 GET 엔드포인트 실서버 검증 스크립트 (npm run test-gets)
  endpoints/
    index.ts              # 전체 barrel export
    commonCode.ts          # 상품 세부코드 (2)
    supplier.ts            # 거래처 연동 (4)
    storage.ts             # 창고연동 (6)
    product.ts             # 상품연동 (9) + countryCode.ts(국가코드표)
    shop.ts                # 매장 연동 (7)
    sales.ts               # 판매연동 (7)
    shopLedger.ts           # 매장 출고/반품/이동 (9)
    inspect.ts              # 실사등록 (1)
    stockAdjustment.ts      # 재고조정 (1)
    coupon.ts               # 쿠폰 (2)
```

총 48개 실사용 엔드포인트 구현 (`product_sale` 계열 3개는 문서상 "사용불가"로 제외).

## 1.4 실서버(test) 검증 결과 (2026-07-04 기준)

`npm run test-gets`로 25개 GET 엔드포인트 실호출 검증, 27/28 통과 (getSupplier/getStorage/getShop/getProduct 등은 실데이터 확인, 예: 창고 18개, 매장 15개, 상품 830개).

### 코드 수정 사항 (문서와 실제 동작이 다르게 확인된 부분)

- **`getProductPrice` (`GET /api/open/product_price`)**: 다른 엔드포인트와 달리 쿼리스트링(`?shop=...&date=...`) 방식이 필요 → JSON 바디 대신 `params`로 전송하도록 수정.
- **`getNonSalesStock` (`GET /api/open/nonSalesProductMaster`)**: 문서상 `shopCode`가 선택값이지만 실제로는 없으면 400 에러 → 필수값으로 타입 변경 + 쿼리스트링 방식으로 수정.

### 알려진 제약 (코드 문제 아님)

- **`getProductPrice`**: 정상적인 요청 형식으로도 `401 Member.사용 권한이 없습니다` 응답. 현재 API 키/테넌트에 이 엔드포인트 사용 권한이 없음 — PLAY MD 고객센터(1833-5242, support@xmd.co.kr) 문의 필요.
- **`(딥) 거래처 등록` (`createDeepSupplier`, `api/open/productMaster`)**: Notion 문서의 Request/Response가 완전히 비어 있어 형제 엔드포인트를 본떠 만든 추정 타입. 실사용 전 SAP 연동 스펙 확인 필요.

## 1.5 실사용 예시

매장별 매출 조회 (신제주 매장 `VRNJFS`, 2026-07-03 기준):

```ts
import { getSales } from "./endpoints/index.js";

const sales = await getSales({ from: "20260703", to: "20260703", shop: "VRNJFS" });
// paymentAmount = 실결제액 (creditCard + cash + easyPay), salesType "1"=판매 "2"=환불
```

결과: 판매 94건 7,339,070원 / 환불 2건 -313,940원 / 순 실결제액 7,025,130원.

## 1.6 매장 코드 참고 (getShop() 조회 결과, 2026-07-04 기준)

| shopCode | 매장명 |
|---|---|
| CAFE24 | 자사몰 |
| VRAGFS | 베리시 안국 |
| VRDJCS | 베리시 신세계 대전 |
| VRDSFS | 베리시 도산 |
| VREBCS | 베리시 동부산 아울렛 |
| VRGNPS | 신세계 강남 팝업스토어 |
| VRHSCS | 베리시 스타필드 하남 |
| VRHSPS | 스타필드 하남 팝업스토어 |
| VRJAFS | 베리시 제주 애월 |
| VRJLPS | 롯데월드몰 잠실 팝업스토어 |
| VRMDFS | 베리시 명동 |
| VRNJFS | 베리시 신제주 |
| VRSSFS | 베리시 성수 |
| VRSSPS | 스타필드 수원 팝업스토어 |
| TEST | test |

---

# 2부. mAsh 대시보드 API (오프라인 방문 데이터)

## 2.1 개요

mAsh UI(`app.mash-board.io`)에서 미리 구성한 대시보드의 모든 위젯 데이터를 단일 API
호출로 가져오는 BI 연동. 매장 방문객 수/시간대별/연령대별/성별 등 오프라인 방문
분석 데이터를 다룬다. 정기 배치로 자사 BI에 적재하는 용도.

## 2.2 인증 및 기본 정보

| 항목 | 값 |
|---|---|
| Base URL | `https://api.mash-board.io` |
| 토큰 발급 | `POST /api/token/` — body `{ email, password }` → `{ access, refresh }` |
| 토큰 갱신 | `POST /api/token/refresh/` — body `{ refresh }` (access 만료 5분 대응) |
| 데이터 조회 | `GET /dashboards/{dashboard_uid}/data?start_date=&end_date=&output_type=` |
| output_type | `JSON`(매장명 등 사람이 읽기 좋은 형태) / `RAW_JSON`(ID 기반, 가공 용이) |
| 권장 사항 | 1회 호출 최대 3개월 범위. 더 긴 기간은 나눠서 호출 |

- 자격 증명은 [.env](.env)에 저장 (`MASH_EMAIL`, `MASH_PASSWORD`, `MASH_DASHBOARD_UID`), `.gitignore`에 포함되어 커밋되지 않음.
- 대상 대시보드: `b4bb16db-8404-4877-b2f5-5a6d62d709a1` ("매장별 트래킹")

## 2.3 프로젝트 구조

```
src/
  mash/
    client.ts             # mashRequest(), MashApiError, 토큰 발급/자동갱신(401 시 재로그인)
    dashboard.ts           # getDashboardData({ dashboardUid, startDate, endDate, outputType })
    index.ts                # barrel export
  test-mash-connection.ts  # 연결 테스트 스크립트 (npm run test-mash)
```

## 2.4 실서버 검증 결과 (2026-07-04 기준)

`npm run test-mash`로 "매장별 트래킹" 대시보드(2026-06-01~06-30) 조회 성공, 위젯 10개
전부 정상 수신:

| 위젯 | 레코드 수 |
|---|---|
| 매장별 일평균 방문 횟수 | 478 |
| 구매/상담 전환율 | 0 |
| 성별 및 연령대별 방문 횟수 | 124 |
| 시간대별 매장 방문 횟수 | 101 |
| 일별 매장 방문 횟수 | 478 |
| 2030 고객의 일평균 매장 방문 횟수 | 246 |
| 연령대별 방문횟수에 따른 매장 특성 | 9 |
| 기간 동안의 매장 1개당 평균 방문객 수 | 455 |
| 일평균 방문횟수 최다 매장 | 455 |
| 40대 이상 고객의 일평균 매장 방문 횟수 | 246 |

### 코드 반영 사항 (문서와 실제 동작이 다르게 확인된 부분)

- **`is_all_data_available` / `missing_data`**: 문서 예시에는 항상 존재하는 것처럼 나오지만, 실제로는 결측 데이터가 없을 때 응답에서 필드 자체가 통째로 빠짐. `DashboardDataResponse` 타입에 optional로 반영하고, 호출부는 `=== false`일 때만 누락으로 처리하도록 수정 (`undefined`를 "이상 없음"으로 취급).
- 실제 응답 최상위 키: `dashboard_uid`, `dashboard_name`, `owner`, `board_uid`, `board_name`, `created_at`, `updated_at`, `widgets` (+ 조건부 `is_all_data_available`, `missing_data`).

## 2.5 실행 방법

```bash
npm run test-mash   # 대시보드 데이터 조회 테스트
```

---

# 3부. Shopify (MCP 커넥터)

## 3.1 개요

베리시(VERISH)의 온라인 판매 채널. PLAY MD/mAsh와 달리 자체 코드로 클라이언트를
만든 게 아니라, 세션에 이미 연결되어 있는 **Shopify MCP 커넥터**를 그대로 사용한다.
API 키·토큰 관리, 인증, rate limit 처리를 커넥터가 대신하므로 `.env`에 추가한
자격 증명이 없다.

## 3.2 연결 확인 (2026-07-04 기준)

`get-shop-info` 도구로 연결 상태 확인:

| 항목 | 값 |
|---|---|
| 스토어명 | Verish |
| 도메인 | verishshop.com |
| 플랜 | Shopify Plus |
| 통화 | USD |
| 타임존 | KST |
| 국가 | South Korea |

PLAY MD가 다루는 오프라인 매장 데이터와 별개로, 이 스토어(CAFE24는 PLAY MD 쪽 별도
자사몰 채널)가 Shopify 기반 온라인 판매를 담당한다.

## 3.3 제공 기능

MCP 커넥터가 기본 제공하는 도구:

- **상품**: 조회/생성/수정/상태 일괄변경, 컬렉션 관리
- **주문**: 목록 조회, 상세 조회
- **고객**: 목록/검색
- **재고**: 위치별 재고 조회/설정
- **분석**: ShopifyQL 쿼리 (`run-analytics-query`)
- **할인**: 퍼센트 할인 코드 생성
- **이미지**: Shopify CDN 업로드
- **GraphQL**: 위 built-in 도구로 커버 안 되는 리소스(기프트카드, 메타필드, 마켓 등)는 `graphql_query`/`graphql_mutation`으로 직접 조회

## 3.4 실행 방법

별도 스크립트/설치 불필요 — 세션 내에서 바로 `mcp__*__get-shop-info`, `mcp__*__search_products` 등 도구를 호출하면 된다.

---

# 4부. Slack (매장 오픈마감보고 정성 데이터)

## 4.1 개요

매장별 "오픈마감보고" Slack 채널(비공개)에 올라오는 마감 정산·VOC 텍스트를 누적 수집해
정량 데이터(PLAY MD/mAsh) 분석과 함께 활용하기 위한 연동. **`verish-offline.slack.com`**
워크스페이스는 커넥터 화면(claude.ai)에서 Slack을 1개만 붙일 수 있는 제약 때문에 기존
`deepdive-global` 워크스페이스 연결과 별개로, 전용 Slack App(Bot Token) + 직접 API 호출
방식으로 연동했다 (MCP 커넥터/서버를 새로 만들지 않음 — PLAY MD/mAsh와 동일한 패턴).

## 4.2 인증 및 기본 정보

| 항목 | 값 |
|---|---|
| 워크스페이스 | `verish-offline.slack.com` |
| 인증 | Bot Token (`xoxb-...`), `Authorization: Bearer` 헤더 |
| 필요 Bot Token Scope | `channels:read`, `channels:history`, `groups:read`, `groups:history` (비공개 채널이라 `groups:*` 필수) |
| 대상 채널 | 채널명이 `오픈마감보고`로 끝나는 비공개 채널 — 봇을 각 채널에 **직접 초대**해야 보임 (2026-07-05 기준 6개: 도산/성수/안국/명동/신제주/애월) |

- 자격 증명은 [.env](.env)에 저장 (`SLACK_BOT_TOKEN`), `.gitignore`에 포함되어 커밋되지 않음.
- Slack Web API는 실패해도 HTTP 200을 반환하고 바디의 `ok:false`로 실패를 표시 — `client.ts`에서 이를 확인해 `SlackApiError`로 변환.

## 4.3 프로젝트 구조

```
src/
  slack/
    client.ts               # slackRequest(), SlackApiError
    reports.ts               # listStoreReportChannels(), getChannelMessages()
    index.ts                  # barrel export
  test-slack-connection.ts   # 연결 테스트 (npm run test-slack)
  report/
    collect-store-voc.ts     # 증분 수집 스크립트 (npm run collect-voc)
```

## 4.4 실서버 검증 결과 (2026-07-05 기준)

`npm run collect-voc`로 9개 채널 전체 수집 성공, 누적 4,432건 (2024-06-17 ~ 2026-07-04):

| 매장 | 채널 유형 | 건수 |
|---|---|---|
| 도산 | 직영(오픈마감보고) | 1,417 |
| 성수 | 직영(오픈마감보고) | 690 |
| 안국 | 직영(오픈마감보고) | 532 |
| 명동 | 직영(오픈마감보고) | 442 |
| 신제주 | 직영(오픈마감보고) | 62 |
| 애월 | 직영(오픈마감보고) | 52 |
| 신세계-대전 | 중간관리(중간관리자) | 553 |
| 스타필드-하남 | 중간관리(중간관리자) | 416 |
| 동부산-아울렛 | 중간관리(중간관리자) | 268 |

- 직영 매장은 채널명이 `-오픈마감보고`로, 위탁운영(중간관리) 매장은 `-중간관리자`로 끝난다 —
  `listStoreReportChannels()`가 두 접미사를 모두 인식한다 (`STORE_REPORT_SUFFIXES` 상수).
- **`중간관리자` 채널은 순수 마감보고가 아니라 매니저와의 일반 소통도 섞여 있다** (예: 채널 개설
  안내, 매니저 프로필 변경 요청 등). `오픈마감보고` 채널보다 노이즈가 많으므로, 나중에 실제 분석에
  쓸 때는 마감 정산/매출 언급이 있는 메시지만 골라 쓰는 필터링이 필요할 수 있다.

출력: `reports/store-voc-log.json` — 배열, 각 원소는 `{ store, channelId, channelName, ts, date, text }`.
재실행 시 이미 수집한 메시지(`channelId:ts` 기준)는 건너뛰고 새 메시지만 추가하는 **증분 수집** 방식.

## 4.5 실행 방법

```bash
npm run test-slack    # 연결 확인 + 봇이 볼 수 있는 오픈마감보고 채널 목록 출력
npm run collect-voc    # 전체 채널 증분 수집 -> reports/store-voc-log.json
```

새 매장 채널이 생기면 해당 채널에 Slack에서 봇(`verish_report_bot`)을 초대하기만 하면
다음 `collect-voc` 실행 시 자동으로 잡힌다 (코드 수정 불필요).

## 4.6 향후 활용

`reports/store-voc-log.json`은 국가별 채널 비교 분석([[COUNTRY_CHANNEL_ANALYSIS.md]])의
정량 데이터와 날짜/매장 기준으로 조인해, "이 날 이 매장에 이런 정성적 특이사항이 있었다"를
같이 보여주는 용도로 쓸 수 있다. 아직 텍스트 자체를 구조화(정형화)하지는 않았고 원문 그대로
누적만 하는 단계 — 분석 시점에 필요한 필드(매출/특이사항/고객 코멘트 등)를 그때그때 파싱해서 쓴다.

---

## 공통 실행 방법

```bash
npm install
npm run test-connection   # PLAY MD: 거래처 조회로 인증/연결 확인
npm run test-gets         # PLAY MD: 전체 GET 엔드포인트 실서버 검증
npm run test-mash         # mAsh: 대시보드 데이터 조회 테스트
npm run test-slack        # Slack: 오픈마감보고 채널 연결 확인
npm run collect-voc        # Slack: 오픈마감보고 정성 데이터 증분 수집
npx tsc --noEmit           # 전체 타입체크
```
