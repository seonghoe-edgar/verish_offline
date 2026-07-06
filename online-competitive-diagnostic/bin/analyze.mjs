#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { MANDATORY_COMPETITORS } from '../config/competitors.js';
import { collectMany } from '../src/collect.js';
import { classifyMany } from '../src/classify.js';
import { pickAndEmbedImages } from '../src/images.js';
import { buildAnalysisPrompt } from '../src/promptBuilder.js';
import { generateAnalysis } from '../src/anthropic.js';
import { getClarityInsights } from '../src/clarity.js';
import { renderReport, renderMarkdown } from '../src/reportTemplate.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = { type: '홈', extra: [] };
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'extra') args.extra = val.split(',').map((s) => s.trim()).filter(Boolean);
    else args[key] = val;
  }
  return args;
}

function slugFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\.|^m\./, '');
  } catch {
    return 'target';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error(`사용법: node bin/analyze.mjs --url=<베리시 페이지 URL> --type=<홈|PDP|카테고리 등> [--extra=url1,url2] [--name=브랜드명] [--analysis=path.json]`);
    process.exit(1);
  }

  const targetName = args.name || slugFromUrl(args.url);
  const targetSite = { id: 'target', name: targetName, url: args.url };
  const extraSites = args.extra.map((u, i) => ({ id: `extra${i}`, name: slugFromUrl(u), url: u }));
  const competitorSites = [...MANDATORY_COMPETITORS.map((c) => ({ id: c.id, name: c.name, url: c.homeUrl })), ...extraSites];

  console.log(`[1/6] 수집: ${targetSite.name} + 경쟁사 ${competitorSites.length}곳 ...`);
  const collected = await collectMany([targetSite, ...competitorSites]);
  const [target, ...competitors] = classifyMany(collected);

  console.log('[2/6] 이미지 다운로드 & 임베드 ...');
  for (const site of [target, ...competitors]) {
    site.embeddedImages = site.error ? [] : await pickAndEmbedImages(site.images, 3);
  }

  console.log('[3/6] Clarity 실측 데이터 조회 ...');
  let clarity = null;
  try {
    clarity = await getClarityInsights({ url: target.finalUrl || args.url });
    console.log(clarity ? `      Clarity(${clarity.projectLabel || '기본'} 프로젝트)로 최근 트래픽/행동 데이터를 가져왔습니다.` : '      해당 도메인의 Clarity 토큰 미설정 — 실측 데이터 섹션은 생략합니다.');
  } catch (err) {
    console.warn('      Clarity API 호출 실패, 실측 데이터 섹션은 생략합니다:', err.message);
  }

  console.log('[4/6] 분석 준비 ...');
  const meta = { url: args.url, pageType: args.type, date: new Date().toISOString().slice(0, 10) };
  const prompt = buildAnalysisPrompt({ meta, target, competitors, clarity });

  let analysis = null;
  if (args.analysis) {
    analysis = JSON.parse(fs.readFileSync(args.analysis, 'utf8'));
    console.log(`      --analysis 파일에서 분석 결과를 불러왔습니다: ${args.analysis}`);
  } else {
    try {
      analysis = await generateAnalysis(prompt);
      console.log(analysis ? '      ANTHROPIC_API_KEY로 분석을 자동 생성했습니다.' : '      ANTHROPIC_API_KEY 미설정 — 정성 분석(SWO/AB플랜)은 비워둡니다.');
    } catch (err) {
      console.warn('      Claude API 호출 실패, 정성 분석은 비워둡니다:', err.message);
    }
  }

  console.log('[5/6] 리포트 생성 ...');
  const outDir = path.join(ROOT, 'reports', `${targetName}-${meta.pageType}-${meta.date}`.replace(/[^\w가-힣.-]+/g, '_'));
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'analysis-prompt.md'), prompt, 'utf8');
  fs.writeFileSync(path.join(outDir, 'report.html'), renderReport({ meta, target, competitors, analysis, clarity }), 'utf8');
  fs.writeFileSync(path.join(outDir, 'report.md'), renderMarkdown({ meta, target, competitors, analysis, clarity }), 'utf8');
  fs.writeFileSync(
    path.join(outDir, 'raw-data.json'),
    JSON.stringify({ meta, target, competitors, clarity }, (k, v) => (k === 'embeddedImages' ? '[omitted]' : v), 2),
    'utf8'
  );

  console.log('[6/6] 완료 ->', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
