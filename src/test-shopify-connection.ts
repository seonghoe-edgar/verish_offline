import { runShopifyQl, ShopifyApiError } from "./shopify/index.js";

async function main() {
  try {
    console.log("1) 기본 연결 + 전체 세션/전환율 조회...");
    const basic = await runShopifyQl("FROM sessions SHOW sessions, conversion_rate SINCE -30d UNTIL today");
    console.log("연결 성공.", JSON.stringify(basic.rows));

    // 참고: FROM sessions GROUP BY product_title / SHOW product_views, add_to_carts, checkouts는
    // read_reports 권한을 가진 이 전용 앱으로도 "Column Not Found"로 막혀있음 — 권한 문제가 아니라
    // Shopify가 세션-상품 조인을 공개 API 자체에서 제공하지 않는 플랫폼 제약. 상품별 노출수/전환율은
    // Shopify Admin > Analytics > Reports에서 수동 확인만 가능. COUNTRY_CHANNEL_ANALYSIS.md 참고.

    console.log("\n2) 상품별 매출 랭킹 (MCP 커넥터보다 자유로운 ShopifyQL 예시)...");
    const topProducts = await runShopifyQl(
      "FROM sales SHOW total_sales GROUP BY product_title ORDER BY total_sales DESC LIMIT 10 SINCE -30d UNTIL today"
    );
    for (const row of topProducts.rows) {
      console.log(" ", JSON.stringify(row));
    }
  } catch (err) {
    if (err instanceof ShopifyApiError) {
      console.error(`연결 실패 (status: ${err.status ?? "unknown"}): ${err.message}`);
      if (err.body) console.error(JSON.stringify(err.body, null, 2));
    } else {
      console.error("예상치 못한 오류:", err);
    }
    process.exitCode = 1;
  }
}

main();
