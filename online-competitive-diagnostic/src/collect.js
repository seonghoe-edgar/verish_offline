import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const IMG_ATTRS = ['src', 'data-src', 'data-original', 'data-lazy', 'data-srcset', 'srcset'];

function absolutize(base, maybeRelative) {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

function firstFromSrcset(value) {
  // "a.jpg 1x, b.jpg 2x" -> "a.jpg"
  return value.split(',')[0].trim().split(/\s+/)[0];
}

function classifyImageBucket(url) {
  const u = url.toLowerCase();
  // cafe24 에디터로 올린 작은 텍스트/LNB 배너, 품절 아이콘 등 UI 그래픽 — 사진이 아니라 깨져 보이므로 제외
  if (/(nneditor|_lnb|sprite|\bbtn|button|logo|icon|ico_|skin\/admin|soldout)/.test(u)) return 'skip';
  if (/(main|banner|visual|hero|key|campaign|event)/.test(u)) return 'hero';
  if (/(product|item|goods)/.test(u)) return 'product';
  return 'other';
}

/**
 * 하나의 URL을 fetch해서 구조 분석에 필요한 원재료를 뽑아낸다.
 * 실제 렌더링(JS 실행)은 하지 않으므로, JS로 늦게 그려지는 히어로 슬라이더 등은
 * 못 잡을 수 있다 — 이 경우 product 계열 이미지로 갤러리를 대체한다.
 */
export async function collectSite({ id, name, url }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`${name}: HTTP ${res.status} fetching ${url}`);
  }
  const finalUrl = res.url || url;
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim();

  // 내비게이션 후보: header/nav 안의 링크 텍스트
  const nav = [];
  $('header a, nav a').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length <= 20 && !nav.includes(t)) nav.push(t);
  });

  // 섹션 블록 후보: 헤딩 + 짧은 문단, DOM 순서 그대로
  const blocks = [];
  $('h1, h2, h3, h4, p, li, span, a').each((_, el) => {
    const tag = el.tagName;
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (!t || t.length < 2 || t.length > 80) return;
    blocks.push({ tag, text: t });
  });

  // 이미지 후보: src 계열 속성 전부 스캔, 절대경로로 변환, 중복 제거
  const seen = new Set();
  const images = [];
  $('img, source').each((_, el) => {
    for (const attr of IMG_ATTRS) {
      const raw = $(el).attr(attr);
      if (!raw) continue;
      const candidate = attr.includes('srcset') ? firstFromSrcset(raw) : raw;
      const abs = absolutize(finalUrl, candidate);
      if (!abs || seen.has(abs)) continue;
      if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(abs)) continue;
      seen.add(abs);
      const bucket = classifyImageBucket(abs);
      if (bucket === 'skip') continue;
      images.push({ url: abs, bucket });
    }
  });

  return { id, name, requestedUrl: url, finalUrl, title, nav, blocks, images };
}

export async function collectMany(sites) {
  const results = [];
  for (const site of sites) {
    try {
      results.push(await collectSite(site));
    } catch (err) {
      results.push({ id: site.id, name: site.name, requestedUrl: site.url, error: String(err.message || err) });
    }
  }
  return results;
}
