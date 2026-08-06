import http from 'http';

import { MANDATORY_COMPETITORS } from './config/competitors.js';
import { CLARITY_PROJECTS } from './config/clarityProjects.js';
import { collectMany } from './src/collect.js';
import { classifyMany } from './src/classify.js';
import { pickAndEmbedImages } from './src/images.js';
import { buildAnalysisPrompt } from './src/promptBuilder.js';
import { generateAnalysis } from './src/anthropic.js';
import { getClarityInsights } from './src/clarity.js';
import { renderReport } from './src/reportTemplate.js';

const PORT = process.env.PORT || 3400;

function slugFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\.|^m\./, '');
  } catch {
    return 'target';
  }
}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(bodyHtml) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>경쟁사 구조·전환 진단 도구</title>
<style>
  :root{ --ink:#201820; --paper:#f1eef2; --surface:#fff; --line:#ddd4da; --muted:#7d7080; --accent:#9c3b57; --accent-tint:#f1dde3; }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard Variable",Pretendard,"Malgun Gothic",sans-serif;line-height:1.6;}
  .wrap{max-width:640px;margin:0 auto;padding:56px 24px 96px;}
  h1{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;font-size:28px;margin:0 0 8px;}
  p.sub{color:var(--muted);font-size:14px;margin:0 0 32px;max-width:56ch;}
  form{display:flex;flex-direction:column;gap:20px;background:var(--surface);border:1px solid var(--line);padding:24px;}
  label{font-size:13px;font-weight:600;display:block;margin-bottom:6px;}
  label .hint{font-weight:400;color:var(--muted);font-size:12px;display:block;margin-top:2px;}
  input[type=text],input[type=url],select,textarea{width:100%;padding:10px 12px;border:1px solid var(--line);background:#fff;font-size:14px;font-family:inherit;color:var(--ink);}
  textarea{min-height:72px;resize:vertical;}
  .row{display:grid;grid-template-columns:2fr 1fr;gap:14px;}
  .competitor-list{font-size:12.5px;color:var(--muted);background:var(--paper);border:1px solid var(--line);padding:10px 12px;}
  button{background:var(--accent);color:#fff;border:none;padding:13px 20px;font-size:14.5px;font-weight:600;cursor:pointer;}
  button:hover{opacity:.92;}
  button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
  .note{font-size:12px;color:var(--muted);margin-top:8px;}
  .status{background:var(--accent-tint);border:1px solid var(--accent);padding:14px 16px;font-size:13.5px;margin-bottom:24px;}
</style>
</head>
<body>
<div class="wrap">${bodyHtml}</div>
</body>
</html>`;
}

function formHtml({ error } = {}) {
  const competitorNames = MANDATORY_COMPETITORS.map((c) => c.name).join(' · ');
  const apiKeySet = !!process.env.ANTHROPIC_API_KEY;
  const clarityProjectsStatus = CLARITY_PROJECTS.map((p) => `${p.label}(${p.tokenEnv}) ${process.env[p.tokenEnv] ? '✓' : '✗'}`).join(' · ');
  return page(`
    <h1>경쟁사 구조·전환 진단</h1>
    <p class="sub">자사 페이지 URL과 화면 유형을 입력하면, 필수 경쟁사 5곳(그리고 추가로 넣은 URL)과 실시간으로 비교한 리포트를 생성합니다.</p>
    ${error ? `<div class="status" style="border-color:#a8433f;background:#f3e2e0;color:#a8433f;">${esc(error)}</div>` : ''}
    <div class="status">${apiKeySet ? 'ANTHROPIC_API_KEY가 설정되어 있어 강점·약점·기회 분석과 A/B 플랜까지 자동으로 채워집니다.' : 'ANTHROPIC_API_KEY가 없어 구조 비교/이미지/자동 추출 지표만 생성됩니다. 정성 분석은 리포트 생성 후 analysis-prompt를 복사해 별도로 받아보세요.'}</div>
    <div class="status">Clarity 실측 데이터 — 입력한 URL의 도메인에 맞는 프로젝트 토큰이 있으면 자동 반영됩니다: ${esc(clarityProjectsStatus)}</div>
    <form method="POST" action="/analyze">
      <div>
        <label for="url">분석할 페이지 URL<span class="hint">예: https://m.verish.me/</span></label>
        <input type="url" id="url" name="url" placeholder="https://m.verish.me/" required>
      </div>
      <div class="row">
        <div>
          <label for="name">브랜드명<span class="hint">리포트 표시용, 비워두면 도메인에서 추출</span></label>
          <input type="text" id="name" name="name" placeholder="Verish">
        </div>
        <div>
          <label for="type">화면 유형</label>
          <select id="type" name="type">
            <option>홈</option>
            <option>PDP</option>
            <option>카테고리</option>
            <option>장바구니</option>
            <option>기타</option>
          </select>
        </div>
      </div>
      <div>
        <label for="extra">추가 비교 URL<span class="hint">한 줄에 하나씩, 선택 사항</span></label>
        <textarea id="extra" name="extra" placeholder="https://example-competitor.com/"></textarea>
      </div>
      <div class="competitor-list">필수 비교 대상 (자동 포함): ${esc(competitorNames)}</div>
      <button type="submit">리포트 생성</button>
      <p class="note">사이트마다 실제로 fetch하기 때문에 완료까지 10~30초 정도 걸립니다.</p>
    </form>
  `);
}

async function runAnalysis({ url, name, type, extra }) {
  const targetName = name || slugFromUrl(url);
  const targetSite = { id: 'target', name: targetName, url };
  const extraSites = (extra || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((u, i) => ({ id: `extra${i}`, name: slugFromUrl(u), url: u }));
  const competitorSites = [
    ...MANDATORY_COMPETITORS.map((c) => ({ id: c.id, name: c.name, url: c.homeUrl })),
    ...extraSites,
  ];

  const collected = await collectMany([targetSite, ...competitorSites]);
  const [target, ...competitors] = classifyMany(collected);

  for (const site of [target, ...competitors]) {
    site.embeddedImages = site.error ? [] : await pickAndEmbedImages(site.images, 3);
  }

  let clarity = null;
  try {
    clarity = await getClarityInsights({ url: target.finalUrl || url });
  } catch {
    clarity = null;
  }

  const meta = { url, pageType: type || '홈', date: new Date().toISOString().slice(0, 10) };
  const prompt = buildAnalysisPrompt({ meta, target, competitors, clarity });

  let analysis = null;
  try {
    analysis = await generateAnalysis(prompt);
  } catch {
    analysis = null;
  }

  return renderReport({ meta, target, competitors, analysis, clarity });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(formHtml());
    return;
  }

  if (req.method === 'POST' && req.url === '/analyze') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      const params = new URLSearchParams(body);
      const url = params.get('url');
      if (!url) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(formHtml({ error: 'URL을 입력해주세요.' }));
        return;
      }
      try {
        const reportBody = await runAnalysis({
          url,
          name: params.get('name'),
          type: params.get('type'),
          extra: params.get('extra'),
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>${reportBody}</body></html>`);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(formHtml({ error: `분석 중 오류: ${err.message}` }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
