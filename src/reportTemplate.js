import { BLOCK_TYPES } from '../config/competitors.js';

const DEFAULT_EXPECTATIONS = [
  { n: 1, title: '핏 / 사이즈 확신', desc: '내 몸에 맞는 제품을 빠르게 찾을 수 있는가 — 사이즈 가이드, 브라 파인더' },
  { n: 2, title: '카테고리 도달 속도', desc: '원하는 카테고리에 최소 탭으로 도달하는가' },
  { n: 3, title: '편안함의 근거', desc: '왜 편한지(소재·구조·기술)를 스캐닝 가능한 카피/비주얼로 보여주는가' },
  { n: 4, title: '신뢰 신호', desc: '실제 후기, 판매량 등 사회적 증거가 눈에 보이는가' },
  { n: 5, title: '첫 구매 혜택의 명확성', desc: '혜택이 한눈에 이해되는가 — 쿠폰, 무료배송 기준' },
  { n: 6, title: '공감 가능한 착용 이미지', desc: '실루엣과 핏감을 시각적으로 바로 확인할 수 있는가' },
  { n: 7, title: '로딩 체감 속도', desc: '모바일 환경에서 끊김 없이 스크롤되는가' },
];

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPhone(site) {
  const structure = site.structure && site.structure.length ? site.structure : [{ type: 'other' }];
  const blocks = structure
    .map(({ type }) => {
      const def = BLOCK_TYPES[type] || { color: '#eee', text: '#333', label: type };
      return `<div class="blk" style="background:${def.color};color:${def.text};flex-grow:${type === 'hero' ? 4 : type === 'footer' || type === 'nav' ? 1 : 2}">${esc(def.label)}</div>`;
    })
    .join('');
  return `<div class="phone">${blocks}</div>`;
}

function renderMapCard(site, isSelf) {
  const errNote = site.error ? `<div class="tag" style="color:var(--bad)">수집 실패: ${esc(site.error)}</div>` : '';
  return `
    <div class="map-card">
      <div class="brand${isSelf ? ' self' : ''}">${esc(site.name)}</div>
      <div class="tag">${esc(site.title || '')}</div>
      ${errNote}
      ${renderPhone(site)}
    </div>`;
}

function renderGalleryCard(site, isSelf) {
  if (!site.embeddedImages || site.embeddedImages.length === 0) {
    return `<figure class="gal-card${isSelf ? ' self' : ''}"><figcaption class="gal-brand">${esc(site.name)}</figcaption><div class="gal-imgs"><div class="gal-empty">이미지 없음</div></div></figure>`;
  }
  const imgs = site.embeddedImages
    .map((img) => `<img src="${img.dataUri}" alt="${esc(site.name)} 이미지" loading="lazy">`)
    .join('');
  const caps = site.embeddedImages.map((img) => `<span>${img.bucket === 'hero' ? '히어로' : img.bucket === 'product' ? '제품컷' : '이미지'}</span>`).join('');
  return `
    <figure class="gal-card${isSelf ? ' self' : ''}">
      <figcaption class="gal-brand">${esc(site.name)}</figcaption>
      <div class="gal-imgs">${imgs}</div>
      <div class="gal-caps">${caps}</div>
    </figure>`;
}

export function siteStats(site) {
  const types = (site.structure || []).map((s) => s.type);
  return {
    hasReview: types.includes('review') ? '있음' : '없음',
    promoCount: types.filter((t) => t === 'promo').length,
    sectionCount: types.length,
    navCount: (site.nav || []).length,
    imageCount: (site.images || []).length,
  };
}

function renderStatsTable(target, competitors) {
  const all = [target, ...competitors];
  const rows = [
    ['홈 내 실제 후기 섹션', (s) => siteStats(s).hasReview],
    ['프로모션/이벤트 배너 블록 수', (s) => siteStats(s).promoCount],
    ['추출된 구조 블록 수', (s) => siteStats(s).sectionCount],
    ['내비게이션 메뉴 항목 수', (s) => siteStats(s).navCount],
    ['페이지 내 이미지 수', (s) => siteStats(s).imageCount],
  ];
  const head = all.map((s, i) => `<th${i === 0 ? ' class="self-col"' : ''}>${esc(s.name)}</th>`).join('');
  const body = rows
    .map(([label, fn]) => {
      const cells = all.map((s, i) => `<td${i === 0 ? ' class="self-col"' : ''}>${esc(String(s.error ? '—' : fn(s)))}</td>`).join('');
      return `<tr><td>${esc(label)}</td>${cells}</tr>`;
    })
    .join('');
  return `<table><thead><tr><th>기준 (자동 추출값)</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderExpectations(list) {
  return list
    .map(
      (e) => `
      <div class="expect-item"><span class="n">${e.n}</span><div class="t">${esc(e.title)}</div><div class="d">${esc(e.desc)}</div></div>`
    )
    .join('');
}

function renderFrustrationCard(label, m) {
  if (!m) return '';
  return `<div class="kpi-item"><b>${esc(label)}</b><span>${m.sessionsWithMetricPercentage}% 세션 · 총 ${m.subTotal.toLocaleString()}회</span></div>`;
}

function renderNamedList(title, items, { isUrl = false } = {}) {
  if (!items || !items.length) return '';
  const rows = items
    .map((it) => `<li><span class="cl-name">${esc(isUrl ? it.url : it.name)}</span><span class="cl-count">${it.count.toLocaleString()}</span></li>`)
    .join('');
  return `<div class="cl-list"><h4>${esc(title)}</h4><ul>${rows}</ul></div>`;
}

function renderClaritySection(clarity, targetName) {
  if (!clarity) {
    return `<div class="swo-missing">
      <p>실측 트래픽·행동 데이터는 Microsoft Clarity 프로젝트 연동이 필요해 자동 생성되지 않았습니다.</p>
      <p><code>CLARITY_API_TOKEN</code>을 환경변수로 설정하고 다시 실행하면 최근 3일 실측 데이터가 이 섹션과 05 강점·약점 분석에 반영됩니다.</p>
    </div>`;
  }
  const t = clarity.traffic;
  const f = clarity.frustrationSignals;
  const overview = [
    ['총 세션수', t?.totalSessionCount?.toLocaleString() ?? '-'],
    ['순 방문자수', t?.distinctUserCount?.toLocaleString() ?? '-'],
    ['봇 추정 세션', t?.totalBotSessionCount?.toLocaleString() ?? '-'],
    ['세션당 페이지뷰', t?.pagesPerSession ?? '-'],
    ['평균 체류시간(활성)', clarity.engagementTimeSec ? `${clarity.engagementTimeSec.active}초 / 전체 ${clarity.engagementTimeSec.total}초` : '-'],
    ['평균 스크롤 깊이', clarity.averageScrollDepth != null ? `${clarity.averageScrollDepth}%` : '-'],
  ]
    .map(([label, value]) => `<div class="kpi-item"><b>${esc(label)}</b><span>${esc(String(value))}</span></div>`)
    .join('');

  const frustration = [
    renderFrustrationCard('무반응 클릭 (Dead Click)', f.deadClick),
    renderFrustrationCard('분노 클릭 (Rage Click)', f.rageClick),
    renderFrustrationCard('클릭 후 즉시 이탈 (Quickback)', f.quickback),
    renderFrustrationCard('오류 유발 클릭 (Error Click)', f.errorClick),
    renderFrustrationCard('과도한 스크롤 (Excessive Scroll)', f.excessiveScroll),
    renderFrustrationCard('스크립트 오류 발생 세션', f.scriptError),
  ].join('');

  const lists = [
    renderNamedList('인기 페이지', clarity.popularPages, { isUrl: true }),
    renderNamedList('유입 경로 Top 5', clarity.topReferrers),
    renderNamedList('디바이스 Top 5', clarity.topDevices),
    renderNamedList('OS Top 5', clarity.topOS),
  ].join('');

  return `
    <p class="lede">Microsoft Clarity${clarity.projectLabel ? ` (${esc(clarity.projectLabel)} 프로젝트)` : ''}에서 가져온 ${esc(targetName)}의 최근 ${clarity.numOfDays}일 실측 데이터입니다. 경쟁사는 Clarity 프로젝트 소유 범위 밖이라 비교 대상에서 제외됩니다.</p>
    <div class="kpi-grid">${overview}</div>
    <h3 class="gtitle">사용자 좌절 신호 (Frustration Signals)</h3>
    <div class="kpi-grid">${frustration}</div>
    <h3 class="gtitle">Top 리스트</h3>
    <div class="cl-lists">${lists}</div>`;
}

function renderSWO(analysis) {
  if (!analysis || !analysis.swo) {
    return `<div class="swo-missing">
      <p>강점 · 약점 · 기회 진단은 정성 판단이 필요해 자동 생성되지 않았습니다.</p>
      <p><code>ANTHROPIC_API_KEY</code>를 설정하고 다시 실행하면 Claude API가 이 섹션을 채웁니다. 지금은 <code>analysis-prompt.md</code>를 Claude에게 전달해 답을 받아 <code>--analysis</code> 옵션으로 넣어주세요.</p>
    </div>`;
  }
  const col = (key, cls, label) =>
    `<div class="swo-card"><span class="swo-head ${cls}">${label}</span><ul>${(analysis.swo[key] || [])
      .map((li) => `<li>${esc(li)}</li>`)
      .join('')}</ul></div>`;
  return `<div class="swo-grid">${col('strength', 'good', '강점')}${col('weakness', 'bad', '약점')}${col('opportunity', 'oppo', '기회')}</div>`;
}

function renderAB(analysis) {
  if (!analysis || !analysis.abTests || !analysis.abTests.length) {
    return `<div class="swo-missing"><p>A/B 테스트 플랜은 SWO 진단을 근거로 생성됩니다. 분석이 채워지면 함께 생성됩니다.</p></div>`;
  }
  return `<div class="ab-list">${analysis.abTests
    .map(
      (t, i) => `
    <div class="ab-item">
      <div class="idx">${String(i + 1).padStart(2, '0')}</div>
      <div>
        <h3>${esc(t.title)} <span class="prio ${t.priority === 'High' ? 'high' : 'med'}" style="margin-left:8px;">${esc(t.priority || 'Medium')}</span></h3>
        <p class="hyp"><b>가설 —</b> ${esc(t.hypothesis)}</p>
        <div class="ab-meta">
          <div><span class="k">Variant B</span>${esc(t.variant)}</div>
          <div><span class="k">Primary Metric</span>${esc(t.primary)}</div>
          <div><span class="k">Secondary Metric</span>${esc(t.secondary)}</div>
        </div>
      </div>
    </div>`
    )
    .join('')}</div>`;
}

function renderKPI(analysis) {
  const northStar = analysis?.kpis?.northStar || '홈 방문 세션 → 구매 전환율 (Session-to-Purchase CVR)';
  const supporting = analysis?.kpis?.supporting || [
    { title: '홈 → 카테고리/PDP CTR', desc: '홈 화면에서 실제 상품 영역으로 이동하는 비율' },
    { title: '스크롤 깊이', desc: '25 / 50 / 75 / 100% 도달률' },
    { title: 'Core Web Vitals (모바일)', desc: 'LCP, CLS' },
    { title: '배너/프로모션 CTR', desc: '상단 순환 배너 개별 클릭률' },
  ];
  return `
    <div class="north"><div class="k-label">North Star Metric</div><div class="k-value serif">${esc(northStar)}</div></div>
    <div class="kpi-grid">${supporting.map((k) => `<div class="kpi-item"><b>${esc(k.title)}</b><span>${esc(k.desc)}</span></div>`).join('')}</div>`;
}

export function renderReport({ meta, target, competitors, analysis, clarity }) {
  const expectations = analysis?.expectations || DEFAULT_EXPECTATIONS;
  const mapCards = [renderMapCard(target, true), ...competitors.map((c) => renderMapCard(c, false))].join('');
  const galCards = [renderGalleryCard(target, true), ...competitors.map((c) => renderGalleryCard(c, false))].join('');
  const legend = Object.entries(BLOCK_TYPES)
    .map(([, def]) => `<span class="sw"><span class="dot" style="background:${def.color}"></span>${esc(def.label)}</span>`)
    .join('');

  return `<title>${esc(target.name)} 모바일 ${esc(meta.pageType)} 경쟁사 진단 리포트</title>
<style>
${CSS}
</style>
<div class="wrap">
  <div class="masthead">
    <div class="kicker">Competitive Diagnostic · Mobile Web ${esc(meta.pageType)}</div>
    <h1 class="title">${esc(target.name)} 모바일 ${esc(meta.pageType)} 화면,<br>경쟁사와 무엇이 다른가</h1>
    <p class="sub">${esc(meta.url)} 화면을 ${competitors.map((c) => esc(c.name)).join(' · ')}의 동일 화면과 구조·전환 관점에서 비교했습니다.</p>
    <div class="meta-row">
      <span class="meta-chip">대상 <b>${esc(meta.url)}</b></span>
      <span class="meta-chip">화면 유형 <b>${esc(meta.pageType)}</b></span>
      <span class="meta-chip">비교 ${competitors.length}개 브랜드</span>
      <span class="meta-chip">${esc(meta.date)}</span>
    </div>
  </div>

  <nav class="toc">
    <a href="#expect"><span>01</span>기대치 정의</a>
    <a href="#map"><span>02</span>구조 비교</a>
    <a href="#table"><span>03</span>자동 추출 지표</a>
    <a href="#clarity"><span>04</span>실측 트래픽·행동</a>
    <a href="#swo"><span>05</span>강점·약점·기회</a>
    <a href="#ab"><span>06</span>A/B 테스트 플랜</a>
    <a href="#kpi"><span>07</span>모니터링 KPI</a>
  </nav>

  <section id="expect">
    <div class="eyebrow"><span class="num">01</span><span class="label">Category Expectation</span></div>
    <h2 class="htitle">소비자는 이 화면에서 무엇을 기대하는가</h2>
    <div class="expect-grid">${renderExpectations(expectations)}</div>
  </section>

  <section id="map">
    <div class="eyebrow"><span class="num">02</span><span class="label">Structure Map</span></div>
    <h2 class="htitle">홈 화면 구조 비교 (자동 추출)</h2>
    <p class="lede">각 사이트를 직접 fetch해 실제 섹션 순서를 키워드 휴리스틱으로 분류했습니다. 완벽하지 않을 수 있으니 최종 판단 전 원문 대조를 권장합니다.</p>
    <div class="map-scroll"><div class="map-row">${mapCards}</div></div>
    <div class="legend">${legend}</div>

    <h3 class="gtitle">실제 화면 이미지 (자동 다운로드)</h3>
    <p class="lede">각 사이트의 실제 히어로/상품 이미지를 자동으로 내려받아 임베드했습니다. 비교 진단 목적의 발췌이며 저작권은 각 브랜드에 있습니다.</p>
    <div class="gal-scroll"><div class="gal-row">${galCards}</div></div>
  </section>

  <section id="table">
    <div class="eyebrow"><span class="num">03</span><span class="label">Derived Metrics</span></div>
    <h2 class="htitle">자동 추출 지표</h2>
    <p class="lede">아래는 페칭 결과에서 그대로 계산한 객관적 수치입니다. 강약점 판단(정성 분석)은 04에서 별도로 다룹니다.</p>
    <div class="table-scroll">${renderStatsTable(target, competitors)}</div>
  </section>

  <section id="clarity">
    <div class="eyebrow"><span class="num">04</span><span class="label">Real Behavior Data</span></div>
    <h2 class="htitle">실측 트래픽 · 행동 데이터 (Clarity)</h2>
    ${renderClaritySection(clarity, target.name)}
  </section>

  <section id="swo">
    <div class="eyebrow"><span class="num">05</span><span class="label">Diagnosis</span></div>
    <h2 class="htitle">강점 · 약점 · 기회</h2>
    ${renderSWO(analysis)}
  </section>

  <section id="ab">
    <div class="eyebrow"><span class="num">06</span><span class="label">Experiment Backlog</span></div>
    <h2 class="htitle">A/B 테스트 액션 플랜</h2>
    ${renderAB(analysis)}
  </section>

  <section id="kpi">
    <div class="eyebrow"><span class="num">07</span><span class="label">Measurement</span></div>
    <h2 class="htitle">모니터링 KPI</h2>
    ${renderKPI(analysis)}
  </section>

  <footer class="colophon">
    데이터 소스 — 각 사이트 실시간 fetch(${esc(meta.date)}). 구조는 키워드 휴리스틱 분류, 이미지는 사이트에서 직접 다운로드해 임베드했습니다.
  </footer>
</div>`;
}

export function renderMarkdown({ meta, target, competitors, analysis, clarity }) {
  const expectations = analysis?.expectations || DEFAULT_EXPECTATIONS;
  const all = [target, ...competitors];

  const lines = [];
  lines.push(`# ${target.name} 모바일 ${meta.pageType} 경쟁사 비교 진단 리포트`, '');
  lines.push(`- 분석 대상: ${meta.url} (${meta.pageType})`);
  lines.push(`- 비교 대상: ${competitors.map((c) => c.name).join(', ')}`);
  lines.push(`- 생성일: ${meta.date}`, '', '---', '');

  lines.push('## 1. 소비자가 이 화면에서 기대하는 것', '');
  for (const e of expectations) lines.push(`${e.n}. **${e.title}** — ${e.desc}`);
  lines.push('', '---', '');

  lines.push('## 2. 구조 비교 (자동 추출)', '');
  for (const s of all) {
    const seq = (s.structure || []).map((b) => b.type).join(' > ') || (s.error ? `수집 실패: ${s.error}` : '-');
    lines.push(`- **${s.name}**: ${seq}`);
  }
  lines.push('', '---', '');

  lines.push('## 3. 자동 추출 지표', '');
  lines.push('| 기준 | ' + all.map((s) => s.name).join(' | ') + ' |');
  lines.push('|---|' + all.map(() => '---').join('|') + '|');
  const rows = [
    ['홈 내 실제 후기 섹션', (s) => siteStats(s).hasReview],
    ['프로모션/이벤트 배너 블록 수', (s) => siteStats(s).promoCount],
    ['추출된 구조 블록 수', (s) => siteStats(s).sectionCount],
    ['내비게이션 메뉴 항목 수', (s) => siteStats(s).navCount],
    ['페이지 내 이미지 수', (s) => siteStats(s).imageCount],
  ];
  for (const [label, fn] of rows) {
    lines.push(`| ${label} | ` + all.map((s) => (s.error ? '—' : fn(s))).join(' | ') + ' |');
  }
  lines.push('', '---', '');

  lines.push('## 4. 실측 트래픽 · 행동 데이터 (Clarity)', '');
  if (clarity) {
    const t = clarity.traffic;
    const e = clarity.engagementTimeSec;
    const f = clarity.frustrationSignals;
    const pct = (m) => (m ? `${m.sessionsWithMetricPercentage}% 세션, 총 ${m.subTotal.toLocaleString()}회` : '데이터 없음');
    lines.push(`_${target.name} 자사 데이터${clarity.projectLabel ? ` · ${clarity.projectLabel}` : ''}, 최근 ${clarity.numOfDays}일 (경쟁사는 조회 범위 밖)_`, '');
    lines.push(`- 총 세션수: ${t?.totalSessionCount?.toLocaleString() ?? '-'} (봇 추정 ${t?.totalBotSessionCount?.toLocaleString() ?? '-'}건 포함), 순 방문자수: ${t?.distinctUserCount?.toLocaleString() ?? '-'}`);
    lines.push(`- 세션당 페이지뷰: ${t?.pagesPerSession ?? '-'}, 평균 체류시간: 활성 ${e?.active ?? '-'}초 / 전체 ${e?.total ?? '-'}초, 평균 스크롤 깊이: ${clarity.averageScrollDepth ?? '-'}%`);
    lines.push(`- 무반응 클릭(Dead Click): ${pct(f.deadClick)}`);
    lines.push(`- 분노 클릭(Rage Click): ${pct(f.rageClick)}`);
    lines.push(`- 클릭 후 즉시 이탈(Quickback): ${pct(f.quickback)}`);
    lines.push(`- 오류 유발 클릭(Error Click): ${pct(f.errorClick)}`);
    if (clarity.popularPages.length) {
      lines.push('- 인기 페이지: ' + clarity.popularPages.map((p) => `${p.url} (${p.count.toLocaleString()}회)`).join(', '));
    }
  } else {
    lines.push('_실측 데이터 미생성 — `CLARITY_API_TOKEN` 환경변수를 설정하고 재실행하면 이 섹션과 강점·약점 분석에 실측 데이터가 반영됩니다._');
  }
  lines.push('', '---', '');

  lines.push('## 5. 강점 · 약점 · 기회', '');
  if (analysis?.swo) {
    lines.push('### 강점', ...analysis.swo.strength.map((s) => `- ${s}`), '');
    lines.push('### 약점', ...analysis.swo.weakness.map((s) => `- ${s}`), '');
    lines.push('### 기회', ...analysis.swo.opportunity.map((s) => `- ${s}`), '');
  } else {
    lines.push('_정성 분석 미생성 — `ANTHROPIC_API_KEY` 설정 후 재실행하거나, 같은 폴더의 `analysis-prompt.md`를 Claude에게 전달해 받은 JSON을 `--analysis` 옵션으로 넣어주세요._');
  }
  lines.push('', '---', '');

  lines.push('## 6. A/B 테스트 액션 플랜', '');
  if (analysis?.abTests?.length) {
    for (const [i, t] of analysis.abTests.entries()) {
      lines.push(`${i + 1}. **${t.title}** (${t.priority}) — ${t.hypothesis}`);
      lines.push(`   - Variant B: ${t.variant}`);
      lines.push(`   - Primary: ${t.primary} / Secondary: ${t.secondary}`);
    }
  } else {
    lines.push('_SWO 진단이 채워지면 함께 생성됩니다._');
  }
  lines.push('', '---', '');

  lines.push('## 7. 모니터링 KPI', '');
  lines.push(`**North Star**: ${analysis?.kpis?.northStar || '홈 방문 세션 → 구매 전환율 (Session-to-Purchase CVR)'}`, '');
  const supporting = analysis?.kpis?.supporting || [];
  for (const k of supporting) lines.push(`- **${k.title}** — ${k.desc}`);

  return lines.join('\n');
}

const CSS = `
  :root{
    --ink:#201820; --paper:#f1eef2; --surface:#ffffff; --line:#ddd4da; --muted:#7d7080;
    --accent:#9c3b57; --accent-tint-1:#f1dde3; --accent-tint-2:#e3b7c4; --accent-tint-3:#c96f88;
    --good:#3f7a5c; --good-tint:#e1ede6; --bad:#a8433f; --bad-tint:#f3e2e0; --oppo:#3d6ea5; --oppo-tint:#e1e9f0;
  }
  *{box-sizing:border-box;} html,body{margin:0;padding:0;}
  body{background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard Variable",Pretendard,"Malgun Gothic",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.58;}
  .serif{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;}
  .wrap{max-width:920px;margin:0 auto;padding:56px 24px 96px;}
  a{color:var(--accent);} a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
  .masthead{border-bottom:1px solid var(--line);padding-bottom:28px;margin-bottom:36px;}
  .masthead .kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:14px;}
  h1.title{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;font-size:34px;line-height:1.18;font-weight:600;margin:0 0 14px;text-wrap:balance;letter-spacing:-.01em;}
  .masthead .sub{color:var(--muted);font-size:15px;max-width:62ch;margin:0 0 18px;}
  .meta-row{display:flex;flex-wrap:wrap;gap:10px;}
  .meta-chip{font-size:12px;border:1px solid var(--line);border-radius:3px;padding:5px 10px;color:var(--ink);background:var(--surface);white-space:nowrap;}
  .meta-chip b{font-weight:600;color:var(--accent);}
  .toc{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;border:1px solid var(--line);background:var(--surface);margin-bottom:56px;}
  .toc a{display:block;padding:12px 16px;font-size:13px;color:var(--ink);text-decoration:none;border-right:1px solid var(--line);border-bottom:1px solid var(--line);}
  .toc a:hover{background:var(--paper);}
  .toc a span{color:var(--muted);font-family:"Iowan Old Style",Georgia,serif;margin-right:8px;}
  section{margin-bottom:64px;}
  .eyebrow{display:flex;align-items:baseline;gap:12px;margin-bottom:6px;}
  .eyebrow .num{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;font-size:15px;color:var(--accent);font-weight:600;}
  .eyebrow .label{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
  h2.htitle{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;font-size:24px;font-weight:600;margin:2px 0 18px;text-wrap:balance;}
  .lede{color:var(--muted);font-size:14.5px;max-width:68ch;margin:0 0 22px;}
  .expect-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border:1px solid var(--line);}
  .expect-item{background:var(--surface);padding:16px 18px;}
  .expect-item .n{font-family:"Iowan Old Style",Georgia,serif;color:var(--accent);font-size:13px;font-weight:600;display:block;margin-bottom:4px;}
  .expect-item .t{font-size:14px;font-weight:600;margin-bottom:4px;}
  .expect-item .d{font-size:13px;color:var(--muted);}
  .map-scroll,.gal-scroll,.table-scroll{overflow-x:auto;padding-bottom:8px;}
  .map-row,.gal-row{display:flex;gap:20px;min-width:min-content;}
  .map-card{flex:0 0 172px;}
  .map-card .brand{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;font-size:14px;font-weight:600;margin-bottom:2px;}
  .map-card .brand.self{color:var(--accent);}
  .map-card .tag{font-size:11.5px;color:var(--muted);margin-bottom:10px;min-height:32px;}
  .phone{width:172px;height:340px;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--surface);display:flex;flex-direction:column;box-shadow:0 1px 0 var(--line);}
  .blk{display:flex;align-items:center;justify-content:center;text-align:center;padding:3px 6px;font-size:8px;letter-spacing:.03em;text-transform:uppercase;font-weight:600;line-height:1.25;}
  .legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:16px;}
  .legend .sw{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);}
  .legend .dot{width:10px;height:10px;border-radius:2px;display:inline-block;}
  .gtitle{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;font-size:18px;font-weight:600;margin:36px 0 8px;}
  .gal-card{flex:0 0 auto;margin:0;border:1px solid var(--line);background:var(--surface);padding:12px;}
  .gal-card.self{border-color:var(--accent);background:var(--accent-tint-1);}
  .gal-brand{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;font-size:13px;font-weight:600;margin-bottom:8px;}
  .gal-card.self .gal-brand{color:var(--accent);}
  .gal-imgs{display:flex;gap:6px;}
  .gal-imgs img{width:92px;height:118px;object-fit:cover;background:var(--paper);border:1px solid var(--line);display:block;}
  .gal-empty{width:92px;height:118px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted);border:1px dashed var(--line);}
  .gal-caps{display:flex;gap:6px;margin-top:6px;}
  .gal-caps span{width:92px;font-size:10px;color:var(--muted);text-align:center;}
  table{border-collapse:collapse;width:100%;min-width:640px;font-size:13px;background:var(--surface);border:1px solid var(--line);}
  thead th{text-align:left;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:12px 14px;border-bottom:1px solid var(--line);white-space:nowrap;}
  thead th:first-child{color:var(--ink);}
  tbody td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top;font-variant-numeric:tabular-nums;}
  tbody tr:last-child td{border-bottom:none;}
  tbody td:first-child{font-weight:600;white-space:nowrap;}
  td.self-col,th.self-col{background:var(--accent-tint-1);}
  th.self-col{color:var(--accent);}
  .swo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
  .swo-card{border:1px solid var(--line);background:var(--surface);padding:18px 18px 20px;}
  .swo-head{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 11px;border-radius:20px;margin-bottom:14px;}
  .swo-head.good{background:var(--good-tint);color:var(--good);}
  .swo-head.bad{background:var(--bad-tint);color:var(--bad);}
  .swo-head.oppo{background:var(--oppo-tint);color:var(--oppo);}
  .swo-card ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:11px;}
  .swo-card li{font-size:13.5px;padding-left:14px;position:relative;}
  .swo-card li::before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;background:var(--line);}
  .swo-missing{border:1px dashed var(--line);padding:18px;font-size:13.5px;color:var(--muted);}
  .swo-missing code{background:var(--paper);padding:2px 5px;border-radius:3px;}
  .ab-list{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);}
  .ab-item{background:var(--surface);padding:20px 22px;display:grid;grid-template-columns:28px 1fr;gap:16px;}
  .ab-item .idx{font-family:"Iowan Old Style",Georgia,serif;font-size:20px;color:var(--accent);font-weight:600;}
  .ab-item h3{font-size:15px;margin:0 0 6px;font-weight:700;}
  .ab-item .hyp{font-size:13.5px;color:var(--ink);margin:0 0 12px;}
  .ab-item .hyp b{color:var(--accent);font-weight:600;}
  .ab-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
  .ab-meta div{font-size:12px;}
  .ab-meta .k{color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-size:10.5px;display:block;margin-bottom:3px;}
  .prio{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;letter-spacing:.03em;}
  .prio.high{background:var(--accent);color:#fff;}
  .prio.med{background:transparent;border:1px solid var(--accent-tint-3);color:var(--accent-tint-3);}
  .north{border:1px solid var(--accent);background:var(--accent-tint-1);padding:22px 24px;margin-bottom:18px;}
  .north .k-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:6px;}
  .north .k-value{font-family:"Iowan Old Style",Georgia,serif;font-size:20px;font-weight:600;}
  .kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:28px;}
  .kpi-grid:last-child{margin-bottom:0;}
  .kpi-item{background:var(--surface);padding:14px 18px;font-size:13.5px;}
  .kpi-item b{display:block;font-weight:600;margin-bottom:3px;}
  .kpi-item span{color:var(--muted);font-size:12.5px;}
  .cl-lists{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
  .cl-list{border:1px solid var(--line);background:var(--surface);padding:14px 16px;}
  .cl-list h4{font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;font-weight:600;}
  .cl-list ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;}
  .cl-list li{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;}
  .cl-list .cl-name{color:var(--ink);word-break:break-all;}
  .cl-list .cl-count{color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;}
  footer.colophon{border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:12px;}
  @media (max-width:640px){.toc{grid-template-columns:1fr;}.expect-grid{grid-template-columns:1fr;}.swo-grid{grid-template-columns:1fr;}.ab-meta{grid-template-columns:1fr;}.cl-lists{grid-template-columns:1fr;}h1.title{font-size:26px;}}
`;
