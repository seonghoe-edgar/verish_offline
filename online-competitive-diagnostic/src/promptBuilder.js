function siteSummary(site) {
  if (site.error) return `### ${site.name}\n수집 실패: ${site.error}\n`;
  const structure = (site.structure || []).map((s) => s.type).join(' > ');
  const nav = (site.nav || []).slice(0, 12).join(', ');
  const sampleTexts = (site.blocks || [])
    .slice(0, 25)
    .map((b) => b.text)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 15)
    .join(' | ');
  return `### ${site.name} (${site.finalUrl})
- 페이지 제목: ${site.title || '-'}
- 내비게이션: ${nav || '-'}
- 추출된 구조 순서: ${structure || '-'}
- 화면 내 텍스트 샘플: ${sampleTexts || '-'}
`;
}

function pctLabel(m) {
  if (!m) return '데이터 없음';
  return `${m.sessionsWithMetricPercentage}% 세션, 총 ${m.subTotal}회`;
}

function claritySummary(clarity, targetName) {
  if (!clarity) return '';
  const t = clarity.traffic;
  const e = clarity.engagementTimeSec;
  const f = clarity.frustrationSignals;
  const pages = clarity.popularPages.map((p) => `${p.url} (${p.count}회)`).join(', ') || '-';

  return `

### ${targetName} 자사 실측 트래픽·행동 데이터 (Microsoft Clarity${clarity.projectLabel ? ` · ${clarity.projectLabel}` : ''}, 최근 ${clarity.numOfDays}일)
- 총 세션수: ${t?.totalSessionCount ?? '-'} (봇 추정 ${t?.totalBotSessionCount ?? '-'}건 포함), 순 방문자수: ${t?.distinctUserCount ?? '-'}
- 세션당 페이지뷰: ${t?.pagesPerSession ?? '-'}
- 평균 체류시간: 활성 ${e?.active ?? '-'}초 / 전체 ${e?.total ?? '-'}초, 평균 스크롤 깊이: ${clarity.averageScrollDepth ?? '-'}%
- 무반응 클릭(Dead Click): ${pctLabel(f.deadClick)}
- 분노 클릭(Rage Click): ${pctLabel(f.rageClick)}
- 클릭 후 즉시 이탈(Quickback Click): ${pctLabel(f.quickback)}
- 오류 유발 클릭(Error Click): ${pctLabel(f.errorClick)}
- 인기 페이지: ${pages}
`;
}

export function buildAnalysisPrompt({ meta, target, competitors, clarity }) {
  const sections = [target, ...competitors].map(siteSummary).join('\n');
  const claritySection = claritySummary(clarity, target.name);

  return `당신은 이커머스 CRO(전환율 최적화) 컨설턴트입니다. 아래는 "${target.name}"의 모바일 ${meta.pageType} 화면과 경쟁사들의 화면을 실제로 fetch해 추출한 구조 데이터입니다.

${sections}
${claritySection}
---

위 데이터를 근거로 다음 JSON을 **그 형식 그대로** 출력하세요. 다른 설명, 코드펜스, 서두 문장 없이 JSON 객체 하나만 출력합니다.

{
  "expectations": [ {"n":1,"title":"...","desc":"..."} ... 7개, 이 카테고리/화면 유형에서 소비자가 기대하는 것 ],
  "swo": {
    "strength": ["..."],
    "weakness": ["..."],
    "opportunity": ["..."]
  },
  "abTests": [
    {"title":"...", "priority":"High|Medium", "hypothesis":"...", "variant":"...", "primary":"...", "secondary":"..."}
    // 3~5개
  ],
  "kpis": {
    "northStar": "...",
    "supporting": [ {"title":"...","desc":"..."} ... 4~8개 ]
  }
}

모든 텍스트는 한국어로, "${target.name}" 관점에서 구체적으로 작성하세요. 추측이 아니라 위에 제공된 실제 구조/카피 데이터에 근거하세요.${
    clarity ? ' 특히 위 Clarity 실측 데이터(세션수, 좌절 신호, 인기 페이지 등)가 있다면 강점/약점 진단과 A/B 플랜의 근거로 구체적 수치를 반드시 인용하세요.' : ''
  }`;
}
