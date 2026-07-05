import { shopifyGraphql, runShopifyQl, ShopifyApiError } from "../shopify/index.js";

// Claude가 쓸 수 있는 도구 정의. 조회(query/shopifyql)는 즉시 실행하지만,
// 수정(mutation)은 바로 실행하지 않고 pending-store에 등록해 Slack 스레드에서
// 사람이 "확인"이라고 답장해야 실제로 실행되도록 한다 (오작동/오해 방지).
export const SHOPIFY_TOOLS = [
  {
    name: "shopify_query",
    description:
      "Shopify Admin GraphQL 읽기 전용 쿼리를 실행한다. 상품/주문/고객/재고/메타필드 등을 조회할 때 사용. query 문자열은 'query { ... }' 형태여야 하며 mutation은 이 도구로 실행할 수 없다.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "GraphQL query 문자열 (query { ... })" },
        variables: { type: "object", description: "GraphQL variables (선택)" },
      },
      required: ["query"],
    },
  },
  {
    name: "shopify_run_shopifyql",
    description:
      "ShopifyQL 쿼리를 실행해 매출/세션/전환율 등 분석 데이터를 조회한다. 예: 'FROM sales SHOW total_sales GROUP BY product_title ORDER BY total_sales DESC LIMIT 10 SINCE -30d UNTIL today'",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "ShopifyQL 쿼리 문자열" },
      },
      required: ["query"],
    },
  },
  {
    name: "propose_mutation",
    description:
      "상품/재고/메타필드 등을 수정하는 GraphQL mutation을 '제안'한다. 이 도구는 절대 즉시 실행하지 않는다 — Slack 스레드에 변경 내용을 사람이 읽을 수 있게 설명과 함께 등록해두고, 사용자가 '확인'이라고 답장해야 실제로 실행된다. 수정성 요청에는 반드시 이 도구를 쓰고, shopify_query로 mutation을 직접 실행하려 하지 말 것.",
    input_schema: {
      type: "object" as const,
      properties: {
        mutation: { type: "string", description: "GraphQL mutation 문자열 (mutation { ... })" },
        variables: { type: "object", description: "GraphQL variables (선택)" },
        summary: {
          type: "string",
          description: "이 변경이 정확히 무엇을 하는지 사람이 이해할 수 있는 한국어 설명 (예: '상품 A의 재고를 10개에서 20개로 변경')",
        },
      },
      required: ["mutation", "summary"],
    },
  },
];

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export async function executeMutation(
  mutation: string,
  variables: Record<string, unknown> | undefined
): Promise<string> {
  try {
    const data = await shopifyGraphql<Record<string, unknown>>(mutation, variables);
    // 대부분의 Shopify mutation은 { <mutationName>: { userErrors: [...] } } 형태를 반환한다.
    const topLevelResult = Object.values(data)[0] as { userErrors?: { field: string[]; message: string }[] } | undefined;
    if (topLevelResult?.userErrors?.length) {
      return `Shopify가 오류를 반환했습니다: ${JSON.stringify(topLevelResult.userErrors)}`;
    }
    return JSON.stringify(data);
  } catch (err) {
    if (err instanceof ShopifyApiError) {
      return `Shopify API 오류: ${err.message}`;
    }
    return `오류: ${(err as Error).message}`;
  }
}

export async function executeReadOnlyTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    if (name === "shopify_query") {
      const query = String(input.query ?? "");
      if (/\bmutation\b/i.test(query)) {
        return "오류: shopify_query는 읽기 전용입니다. 수정이 필요하면 propose_mutation을 사용하세요.";
      }
      const data = await shopifyGraphql(query, input.variables as Record<string, unknown> | undefined);
      return JSON.stringify(data);
    }
    if (name === "shopify_run_shopifyql") {
      const result = await runShopifyQl(String(input.query ?? ""));
      return JSON.stringify(result);
    }
    return `알 수 없는 도구: ${name}`;
  } catch (err) {
    if (err instanceof ShopifyApiError) {
      return `Shopify API 오류: ${err.message}`;
    }
    return `오류: ${(err as Error).message}`;
  }
}
