# 국가별 오프라인 × Shopify 채널 비교 분석 방법론

대만(TWN) 대상으로 처음 수행한 분석(2026-07-04)을 일반화한 기록. 앞으로 다른 국가
(일본/미국/중국 등)로 같은 분석을 요청받을 때 이 문서 기준으로 재현한다.

## 1. 무엇을 비교하는가

- **오프라인**: PLAY MD에 등록된 국내 매장에서, 해당 국적 관광객이 면세로 구매한 내역
- **온라인**: Shopify에서 해당 국가로 결제(billing country)된 주문
- 카테고리 → 상품 → 사이즈 → 컬러 순으로 내려가며 두 채널의 구성비를 비교하고,
  오프라인에서는 잘 팔리는데 Shopify 노출이 약하거나 없는 SKU를 찾아낸다.

## 2. 데이터 소스

### 오프라인 (PLAY MD)

| 용도 | 엔드포인트 | 비고 |
|---|---|---|
| 국적별 면세 영수증 식별 | `getTaxFreeInfo({ from, to, shop })` | 응답의 `PassportInfo[].passportNation`이 ISO 3166-1 alpha-3 코드 (예: `TWN`, `JPN`, `USA`, `CHN`). `shop`은 필수 파라미터라 **매장별로 루프**해야 함 |
| 상품 라인 상세 | `getSalesDetailInfo({ fromDate, toDate })` | `shopCode`가 optional이라 **전체 매장을 한 번에** 조회 가능 (매장 루프 불필요) |
| 매장 목록 | `getShop()` | `CAFE24`(온라인 자사몰), `TEST`는 분석 대상에서 제외 |

### 온라인 (Shopify)

ShopifyQL(`run-analytics-query`)로 조회. 예시:

```
FROM sales SHOW orders, net_sales GROUP BY billing_country SINCE -90d UNTIL today ORDER BY net_sales DESC
FROM sales SHOW orders, net_sales GROUP BY product_type WHERE billing_country = 'Taiwan' SINCE -90d UNTIL today
FROM sales SHOW orders, net_sales GROUP BY product_type, product_title WHERE billing_country = 'Taiwan' SINCE -90d UNTIL today ORDER BY net_sales DESC LIMIT 50
FROM sales SHOW orders, net_sales GROUP BY product_title, product_variant_title WHERE billing_country = 'Taiwan' SINCE -90d UNTIL today ORDER BY net_sales DESC LIMIT 50
```

- `billing_country`는 영문 국가명 사용 (`'Taiwan'`, `'Japan'`, `'United States'` 등 — PLAY MD의 alpha-3 코드와 다름, 매핑 필요)
- `product_variant_title`은 보통 `"컬러 / 사이즈"` 형식으로 같이 나옴
- `net_quantity`는 존재하지 않는 컬럼 — 수량 비교는 `orders`(건수)로 대체

## 3. 정확한 상품 매칭: PLAY MD ↔ Shopify SKU (barcode2)

처음엔 상품명 기준 근사 매칭만 가능한 줄 알았는데, **PLAY MD 상품의 `barcode2` 필드가
Shopify의 variant `sku` 값과 정확히 일치한다.** (`barcode1`은 13자리 EAN 바코드로 이것도
Shopify variant의 `barcode` 필드와 같은 체계.) 실제 확인 사례:

- PLAY MD `getProduct({ productCode: "VALBR0017", searchType: "3" })` → 컬러/사이즈별
  `barcode2: "S21654"` (Beige/M 등)
- Shopify에서 `search_products({ search_query: "sku:S21654" })` → 정확히 같은 상품
  "COOL FIT BRA VOLUME FIT" 반환

이제 상품명 유추 없이 **정확한 SKU 조인**으로 두 시스템을 매칭할 수 있다:

```
PLAY MD: getProduct({ productCode, searchType: "3" }) → 컬러/사이즈별 barcode2 목록 확보
Shopify: search_products({ search_query: "sku:<barcode2> OR sku:<barcode2> ..." })
         또는 graphql_query로 productVariant(sku) 조회
         → 존재 여부, totalInventory(재고), inventoryQuantity(옵션별 재고) 확인
```

이 방법으로 대만 분석에서 "매칭 안 됨"으로 잠정 표시했던 후보들을 재검증한 결과:

| 오프라인 상품 | PLAY MD 코드 | Shopify 매칭 상품 | 실제 상태 |
|---|---|---|---|
| 쿨핏 브라 볼륨핏 로고 | VALBR0018 | COOL FIT BRA VOLUME FIT LOGO | **재고 -12 (오버셀/품절)** |
| 미니멀 브라렛 트라이앵글 2.0 | VALBR0033 | MINIMAL BRALETTE TRIANGLE | **재고 0 (품절)** |
| 티셔츠 브라 컴포트 BIG | VSSBR0021 | T-SHIRT FULL COVERAGE BRA | 존재, 재고 107 (정상) |
| 아이스온 슬립 드레스 | VSSEW0044 | ICE ON SLIP DRESS | 존재, 재고 110 (정상) |
| 아이스온 노후크 브라 | VSSBR0023 | ICE ON HOOKLESS BRA | 존재, 재고 474 (정상) |

→ 애초에 "카탈로그에 없다"가 아니라 **2개는 진짜 품절/오버셀, 3개는 이미 등록·충분한 재고인데
Taiwan 매출 순위만 낮은 것**이었다. 앞으로는 상품명 매칭 대신 이 barcode2 조인을 기본으로 쓸 것.

## 4. 재사용 스크립트

[src/report/country-comparison.ts](src/report/country-comparison.ts) — 국가코드만 바꿔서 실행:

```bash
npx tsx src/report/country-comparison.ts <국가코드> [fromDate] [toDate]
# 예: npx tsx src/report/country-comparison.ts JPN 2026-04-05 2026-07-04
# fromDate/toDate 생략 시 오늘 기준 최근 3개월
```

출력: `reports/offline-<국가코드소문자>-breakdown.json` (카테고리/상품/사이즈/컬러/상품×컬러×사이즈 집계)

이 스크립트가 하는 일:
1. `getShop()`으로 매장 목록 확보 (CAFE24/TEST 제외)
2. 매장 × 4일 단위 기간 조합 전체를 **동시에** `getTaxFreeInfo` 호출 → 해당 국적 영수증 번호 수집
3. 전체 매장 대상 3일 단위 기간으로 `getSalesDetailInfo` **동시** 호출 → 전체 판매 라인
4. 두 결과를 영수증 번호로 매칭해 해당 국적 라인만 필터링
5. 카테고리(상품 스타일 코드)/상품/사이즈/컬러 단위로 집계해 JSON 저장

Shopify 쪽은 별도 스크립트 없이 위 ShopifyQL 쿼리를 국가명만 바꿔 그때그때 실행하면 된다.

## 5. 반드시 알아야 할 API 함정 (실제로 겪은 버그들)

1. **`getTaxFreeInfo`와 `getSalesDetailInfo`의 receiptNo 형식이 다르다.**
   `getTaxFreeInfo`의 receiptNo는 `매장코드+판매일자(yyyyMMdd)+일련번호` 합성키 (예: `VRJAFS202606190001`).
   `getSalesDetailInfo`의 receiptNo는 일련번호만(`0001`). 매칭하려면
   `` `${shopCode}${salesDate}${receiptNo}` `` 로 직접 합성해야 한다. (처음엔 이걸 몰라서 매칭 0건이 나왔음)

2. **날짜 범위 제한이 서로 다르고, 초과해도 에러가 아니라 평문 문자열을 200 OK로 반환한다.**
   - `getSalesDetailInfo`: 최대 **3일**
   - `getTaxFreeInfo`: 최대 **4일**
   - 초과 시 `"Please select a period of up to 3 days"` 같은 문자열이 배열 대신 옴 → 배열인지 검증(`Array.isArray`)하는 방어 코드 없이 쓰면 조용히 틀린 집계가 나간다.

3. **상품코드에서 카테고리(스타일) 추출은 고정 오프셋으로.**
   구조: `[브랜드 1자][시즈널 2자][스타일 2~3자][일련번호 4자리]` (예: `VALBR0017` = V+AL+BR+0017).
   정규식으로 끝에서부터 문자를 그리디하게 잡으면 시즌 코드 앞글자를 잘못 삼킨다 (`VALBR0017`에서 `BR` 대신 `LBR`을 잡는 식). 반드시 `productCode.slice(3)`으로 브랜드+시즌 3자를 먼저 잘라낸 뒤 그 앞부분에서 알파벳 구간을 추출해야 정확하다.

4. **동시 요청으로 처리할 것.** 매장×기간 조합을 `for` 루프로 순차 `await`하면 각 요청의 네트워크 왕복시간이 그대로 누적되어 300건 기준 20분 이상 걸린다. `Promise.all`로 한꺼번에 던지면 `src/client.ts`의 rate limiter가 초당 5회로 알아서 페이싱하며 2~3분 내로 끝난다.

## 6. 상품 스타일 코드 매핑표

`getCommonCode()`의 `codeType: '스타일'` 목록 (2026-07-04 기준, 11개):

| 코드 | 이름 |
|---|---|
| AP | 어패럴 |
| AU | 부자재(비매품 — 택/폴리백/스티커 등, 분석 시 제외 권장) |
| AW | 액티브웨어 |
| BR | 브라 |
| BRT | 브라탑 |
| EW | 이지웨어 |
| FA | 패션잡화 |
| GS | 굿즈 |
| IW | 이너웨어 |
| PT | 팬티 |
| UW | 언더웨어 |

## 7. 한계 (매번 사용자에게 상기시킬 것)

- **상품 단위는 barcode2=SKU 조인으로 정확히 매칭 가능** (3장 참고). 다만 카테고리 비중
  비교(브라/팬티/어패럴 등)는 PLAY MD 스타일 코드와 Shopify product_type이 완전히 같은 분류
  체계는 아니라서 여전히 개념적 매칭.
- **환율 미반영.** 오프라인은 KRW, Shopify는 USD라 절대 금액 비교 대신 **채널 내부 비중(%)**으로
  비교하는 것을 기본으로 한다.
- **면세(taxFree) 거래만 오프라인 "해당 국적 매출"로 간주한다.** 내국인 구매나 면세 미신청 외국인
  구매는 국적 정보가 없어 집계에서 빠진다.
- **PLAY MD는 홍콩을 별도 국적 코드로 구분하지 않는 것으로 보인다.** `passportNation` 샘플 조사에서
  `HKG` 코드가 한 번도 나오지 않았다 (대신 `CHN`으로 기록되는 듯). "홍콩"을 오프라인과 비교하고 싶을
  땐 `passportNation=CHN` 전체를 홍콩 포함 대리 지표로 쓰고, Shopify만 `billing_country='Hong Kong'`
  로 정확히 분리한다 — 이 경우 오프라인 절대 수치는 홍콩 단독이 아니라 "중국 전체(홍콩 포함 추정)"라는
  점을 리포트에 항상 명시할 것.

## 8. 완료된 분석 사례

| 국가 | 기간 | 산출물 |
|---|---|---|
| 대만 (TWN) | 2026-04-05 ~ 2026-07-04 | [reports/offline-twn-breakdown.json](reports/offline-twn-breakdown.json), [reports/taiwan-channel-comparison.html](reports/taiwan-channel-comparison.html) |
| 홍콩 (오프라인은 CHN 대리) | 2026-04-04 ~ 2026-07-04 | [reports/offline-chn-breakdown.json](reports/offline-chn-breakdown.json), [reports/hongkong-channel-comparison.html](reports/hongkong-channel-comparison.html) |

핵심 결론(홍콩): 대만과 같은 브라 중심 패턴이지만 온·오프라인 격차가 더 크다 (Shopify 브라 비중
78.8% vs 오프라인 67.2%, +11.6%p). **쿨핏 브라 볼륨핏 로고·미니멀 브라렛 트라이앵글 2.0은 대만·홍콩
양쪽 오프라인에서 모두 상위권으로 확인**됐는데 Shopify 재고는 각각 -12(오버셀)·0(품절) — 한 시장의
우연이 아니라 글로벌 재고 이슈로 격상. 추가로 "티셔츠 브라 컴포트 BIG"는 재고가 충분한데도(107)
홍콩 Shopify 매출이 극히 낮아(하위권) 순수 노출/마케팅 격차로 판단됨.

핵심 결론(대만): 오프라인·Shopify 모두 브라 중심 구조(오프라인 71% / Shopify 79.6%)로 카테고리
구성은 거의 동일. "오프라인=일반의류, Shopify=이너웨어" 가설은 기각. barcode2=SKU 조인으로
재검증한 결과, 오프라인 강세 SKU 중 **쿨핏 브라 볼륨핏 로고·미니멀 브라렛 트라이앵글 2.0 2개는
실제로 Shopify 재고 품절/오버셀 상태**였고, 나머지(티셔츠 브라 컴포트 BIG, 아이스온 슬립
드레스, 아이스온 노후크 브라)는 재고는 충분하나 노출·마케팅 문제로 판단됨.
