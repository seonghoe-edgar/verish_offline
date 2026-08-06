// 텍스트 블록을 구조맵 블록 타입(config/competitors.js의 BLOCK_TYPES 키)으로 분류한다.
// 완벽한 시맨틱 분석이 아니라 키워드 휴리스틱 — 사람이 WebFetch로 훑어본 것을 근사한다.
const RULES = [
  // "REVIEW (26)" 같은 상품카드 리뷰 수 배지는 제외 — 실제 후기 콘텐츠 섹션만 잡는다
  { type: 'review', re: /(후기|리뷰|review|평점|별점)(?!\s*[:(]?\s*\d)/i },
  { type: 'ugc', re: /(with me|ugc|인플루언서|influencer|커뮤니티|인스타|instagram|해시태그)/i },
  // 나비 메뉴의 "매장보기" 링크와 구분하기 위해 "방문하기/브랜드 스토리/오프라인 매장" 조합만 잡는다
  { type: 'store', re: /(brand story|브랜드\s*스토리|방문하기|오프라인\s*매장)/i },
  // 히어로 바로 아래 가로 스크롤 숏컷 칩 — 짧은 CTA형 문구(~받기/찾기, up to N%)가 특징.
  // maxLen으로 상단 회전 배너의 긴 마케팅 문장("...가입하고 5만원 쿠폰팩 받기")과 구분한다.
  { type: 'quicklink', re: /(받기$|찾기$|up to\s*\d+%|\d+%\s*(off|받기))/i, maxLen: 14 },
  { type: 'promo', re: /(쿠폰|할인|이벤트|특가|세일|sale|무료배송|프로모션|deal|블프|프리쇼|룰렛|% off)/i },
  { type: 'curate', re: /(스타일링|룩북|lookbook|맞는|추천|취향|activity|필터|탐색|세그먼트|for you|for my)/i },
  { type: 'product', re: /(best|베스트|신상|상품보기|제품보기|shop now|더보기|원\)?$|\d{1,3},\d{3}원)/i },
];

const FOOTER_RE = /(사업자등록번호|대표자|copyright|이용약관|개인정보처리방침|통신판매)/i;

function collapseConsecutive(types) {
  const out = [];
  for (const t of types) {
    if (out[out.length - 1] !== t) out.push(t);
  }
  return out;
}

export function classifySite(site) {
  if (site.error) return { ...site, structure: [] };

  const navSet = new Set(site.nav || []);
  const usableBlocks = (site.blocks || []).filter((b) => !navSet.has(b.text));

  const sequence = [];
  if ((site.nav || []).length > 0) sequence.push('nav');

  // 상단 20블록 안에서 프로모션 키워드가 보이면 nav 바로 아래에 프로모 배너로 간주
  const earlyPromo = usableBlocks
    .slice(0, 20)
    .some((b) => RULES.find((r) => r.type === 'promo').re.test(b.text));
  if (earlyPromo) sequence.push('promo');

  sequence.push('hero'); // 모든 홈/PDP는 최상단에 메인 비주얼을 갖는다고 가정

  let footerSeen = false;
  for (const block of usableBlocks) {
    if (FOOTER_RE.test(block.text)) {
      footerSeen = true;
      continue; // 푸터 텍스트 자체는 구조 블록으로 안 쌓고, 마지막에 한 번만 추가
    }
    const hit = RULES.find((r) => r.re.test(block.text) && (!r.maxLen || block.text.length <= r.maxLen));
    if (hit) sequence.push(hit.type);
  }

  let structureTypes = collapseConsecutive(sequence).slice(0, 12);
  if (footerSeen) structureTypes.push('footer');

  const structure = structureTypes.map((type) => ({ type }));

  return { ...site, structure };
}

export function classifyMany(sites) {
  return sites.map(classifySite);
}
