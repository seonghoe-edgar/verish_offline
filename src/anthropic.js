function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 응답을 찾지 못함');
  return JSON.parse(raw.slice(start, end + 1));
}

// ANTHROPIC_API_KEY가 있으면 Claude에 프롬프트를 보내 analysis JSON을 생성한다.
// 없으면 null을 반환 — 이 경우 호출부에서 analysis-prompt.md만 파일로 남긴다.
export async function generateAnalysis(promptMarkdown, { model = 'claude-sonnet-4-5' } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: promptMarkdown }],
  });

  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return extractJson(text);
}
