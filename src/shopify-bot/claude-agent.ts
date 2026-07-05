import Anthropic from "@anthropic-ai/sdk";
import { SHOPIFY_TOOLS, executeReadOnlyTool } from "./shopify-tools.js";
import { setPending } from "./pending-store.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `너는 Verish(verish-int.myshopify.com, Shopify Plus) 쇼핑몰의 세일즈실 팀원을 돕는 Shopify 데이터 어시스턴트다.
상품/주문/고객/재고/메타필드 조회와 ShopifyQL 매출 분석은 shopify_query, shopify_run_shopifyql 도구로 바로 처리한다.
상품/재고/메타필드 등을 "수정"해야 하는 요청이면 절대 바로 실행하지 말고 반드시 propose_mutation 도구를 써서 사람 확인을 받아야 한다.
답변은 한국어로, 세일즈 담당자가 이해하기 쉽게 간결하게 한다. 숫자는 표나 목록으로 정리해준다.
Shopify 상품 GID(gid://shopify/Product/...)는 사용자에게 그대로 노출하지 말고 상품명으로 설명한다.`;

interface AgentResult {
  text: string;
  hasPendingProposal: boolean;
}

export async function askClaude(userText: string, threadTs: string, requestedByUserId: string): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
  let hasPendingProposal = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: SHOPIFY_TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      return { text: text || "(응답 없음)", hasPendingProposal };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;

      if (block.name === "propose_mutation") {
        setPending(threadTs, {
          mutation: String(input.mutation ?? ""),
          variables: input.variables as Record<string, unknown> | undefined,
          summary: String(input.summary ?? ""),
          requestedByUserId,
        });
        hasPendingProposal = true;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "제안이 등록되었습니다. 이 스레드에 사용자가 '확인'이라고 답장하면 실행됩니다. 아직 실행되지 않았습니다.",
        });
        continue;
      }

      const content = await executeReadOnlyTool(block.name, input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { text: "요청이 너무 복잡해서 처리 단계 제한에 걸렸습니다. 더 구체적으로 나눠서 질문해주세요.", hasPendingProposal };
}
