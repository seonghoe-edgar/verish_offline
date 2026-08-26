// 애월(VRJAFS) <-> 신제주(VRNJFS) RT(매장간 재고이동) 후보 대시보드 스냅샷 생성기.
// 두 매장은 PlayMD 상에서 재고를 RT로 공유하는 사이 — 한쪽이 품절 임박(OOS Risk)인데
// 반대쪽에 재고가 있으면 RT 대상으로 플래그한다.
// Usage: node refresh.cjs   (이 폴더에서 실행)
// 실행 후 rt_dashboard.html 이 갱신됨. Claude Code 세션에서 Artifact로 다시 올리려면
// 기존 artifact의 url을 지정해 이 파일을 재발행하면 됨.
const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY = '47bRHdszb8vBFQcA8lORQxGefmH/Skf0VuWIQJKXjHI=';
const TENANT = 'deepdive';

const STORES = [
  { key: 'aewol', shopCode: 'VRJAFS', name: '베리시 제주 애월' },
  { key: 'sinjeju', shopCode: 'VRNJFS', name: '베리시 신제주' },
];

const VELOCITY_WINDOW_DAYS = 7; // 최근 7일 평균 판매속도
const RISK_DAYS_THRESHOLD = 7;  // 소진예상 7일 이내면 OOS 위험
const MIN_TRANSFER_QTY = 2;     // 권장 이동수량이 이보다 적으면 RT 대상에서 제외(물류 실익 없음)

function get(apiPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'external-api.xmd.co.kr',
      path: apiPath,
      headers: { 'PLAYMD-API-KEY': KEY, 'PLAYMD-TENANT': TENANT },
    };
    https.get(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

// [from, to] 쌍으로 최대 4일씩 나눈 청크 목록 생성 (API 제약)
function chunkDateRange(fromDate, toDate) {
  const chunks = [];
  let cur = new Date(fromDate);
  while (cur <= toDate) {
    const chunkEnd = new Date(Math.min(addDays(cur, 3).getTime(), toDate.getTime()));
    chunks.push([fmtDate(cur), fmtDate(chunkEnd)]);
    cur = addDays(chunkEnd, 1);
  }
  return chunks;
}

function skuKey(productCode, colorCode, sizeCode) {
  return `${productCode}__${colorCode || ''}__${sizeCode || ''}`;
}

async function fetchStock(shopCode, stockDate) {
  const { status, body } = await get(`/api/open/stock_shop?shop=${shopCode}&stockDate=${stockDate}`);
  if (status !== 200) throw new Error(`stock_shop ${shopCode} ${status}: ${body.slice(0, 200)}`);
  const rows = JSON.parse(body);
  const map = new Map();
  for (const r of rows) {
    map.set(skuKey(r.productCode, r.colorCode, r.sizeCode), {
      productCode: r.productCode,
      productName: r.productName,
      colorCode: r.colorCode,
      colorName: r.colorName,
      sizeCode: r.sizeCode,
      styleName: r.styleName,
      stockCount: r.stockCount,
      tagPrice: r.tagPrice,
    });
  }
  return map;
}

async function fetchSalesVelocity(shopCode, fromDate, toDate) {
  const chunks = chunkDateRange(fromDate, toDate);
  const soldQty = new Map(); // skuKey -> qty sum over window
  for (const [from, to] of chunks) {
    const { status, body } = await get(`/api/open/sales?shop=${shopCode}&from=${from}&to=${to}`);
    if (status !== 200) {
      console.warn(`sales ${shopCode} ${from}-${to} ERR ${status}: ${body.slice(0, 150)}`);
      await sleep(250);
      continue;
    }
    let receipts;
    try {
      receipts = JSON.parse(body);
    } catch (e) {
      console.warn(`sales ${shopCode} ${from}-${to} parse error`);
      await sleep(250);
      continue;
    }
    for (const receipt of receipts) {
      for (const d of receipt.detail || []) {
        const key = skuKey(d.productCode, d.colorCode, d.sizeCode);
        soldQty.set(key, (soldQty.get(key) || 0) + (d.qty || 0));
      }
    }
    await sleep(250);
  }
  return soldQty;
}

async function main() {
  const today = new Date();
  const stockDate = fmtDate(today);
  const salesTo = addDays(today, -1); // 오늘자는 아직 집계 중이므로 어제까지
  const salesFrom = addDays(salesTo, -(VELOCITY_WINDOW_DAYS - 1));

  console.log('stockDate:', stockDate, 'sales window:', fmtDate(salesFrom), '~', fmtDate(salesTo));

  const perStore = {};
  for (const store of STORES) {
    console.log('fetching', store.name);
    const [stock, sold] = await Promise.all([
      fetchStock(store.shopCode, stockDate),
      fetchSalesVelocity(store.shopCode, salesFrom, salesTo),
    ]);
    perStore[store.key] = { stock, sold };
    console.log(`  ${store.key}: stock SKUs=${stock.size}, sold SKUs=${sold.size}`);
  }

  const allKeys = new Set([
    ...perStore.aewol.stock.keys(),
    ...perStore.sinjeju.stock.keys(),
  ]);

  const items = [];
  for (const key of allKeys) {
    const aStock = perStore.aewol.stock.get(key);
    const sStock = perStore.sinjeju.stock.get(key);
    if (!aStock && !sStock) continue; // 둘 다 취급 안 함
    const base = aStock || sStock;

    const aSold = perStore.aewol.sold.get(key) || 0;
    const sSold = perStore.sinjeju.sold.get(key) || 0;
    const aVelocity = aSold / VELOCITY_WINDOW_DAYS;
    const sVelocity = sSold / VELOCITY_WINDOW_DAYS;

    const aStockCount = aStock ? aStock.stockCount : null;
    const sStockCount = sStock ? sStock.stockCount : null;

    const aDaysOfStock = aStock ? (aVelocity > 0 ? aStockCount / aVelocity : null) : null;
    const sDaysOfStock = sStock ? (sVelocity > 0 ? sStockCount / sVelocity : null) : null;

    const aRisk = !!aStock && (aStockCount <= 0 || (aVelocity > 0 && aDaysOfStock <= RISK_DAYS_THRESHOLD));
    const sRisk = !!sStock && (sStockCount <= 0 || (sVelocity > 0 && sDaysOfStock <= RISK_DAYS_THRESHOLD));

    let rtDirection = null;
    let suggestedQty = 0;
    let suggestedNote = '';

    if (aRisk && sStock && sStockCount > 0 && !(sRisk)) {
      rtDirection = 'sinjeju_to_aewol';
    } else if (sRisk && aStock && aStockCount > 0 && !(aRisk)) {
      rtDirection = 'aewol_to_sinjeju';
    }

    if (rtDirection === 'sinjeju_to_aewol') {
      const targetCoverA = Math.ceil(RISK_DAYS_THRESHOLD * aVelocity);
      const shortfallA = Math.max(targetCoverA - Math.max(aStockCount, 0), aVelocity > 0 ? 0 : 1);
      const keepAtS = Math.ceil(RISK_DAYS_THRESHOLD * sVelocity);
      const surplusS = Math.max(sStockCount - keepAtS, 0);
      suggestedQty = Math.max(0, Math.min(shortfallA, surplusS));
      if (suggestedQty === 0) {
        suggestedQty = Math.min(shortfallA, sStockCount);
        suggestedNote = '신제주 자체 버퍼 여유 적음 — 신중 검토';
      }
    } else if (rtDirection === 'aewol_to_sinjeju') {
      const targetCoverS = Math.ceil(RISK_DAYS_THRESHOLD * sVelocity);
      const shortfallS = Math.max(targetCoverS - Math.max(sStockCount, 0), sVelocity > 0 ? 0 : 1);
      const keepAtA = Math.ceil(RISK_DAYS_THRESHOLD * aVelocity);
      const surplusA = Math.max(aStockCount - keepAtA, 0);
      suggestedQty = Math.max(0, Math.min(shortfallS, surplusA));
      if (suggestedQty === 0) {
        suggestedQty = Math.min(shortfallS, aStockCount);
        suggestedNote = '애월 자체 버퍼 여유 적음 — 신중 검토';
      }
    }

    if (rtDirection && suggestedQty < MIN_TRANSFER_QTY) {
      // 물류 실익이 없는 소량 이동은 RT 대상에서 제외
      rtDirection = null;
      suggestedQty = 0;
      suggestedNote = '';
    }

    items.push({
      key,
      productCode: base.productCode,
      productName: base.productName,
      colorName: base.colorName,
      sizeCode: base.sizeCode,
      styleName: base.styleName,
      aewol: aStock ? { stock: aStockCount, sold7d: aSold, velocity: aVelocity, daysOfStock: aDaysOfStock, risk: aRisk } : null,
      sinjeju: sStock ? { stock: sStockCount, sold7d: sSold, velocity: sVelocity, daysOfStock: sDaysOfStock, risk: sRisk } : null,
      rtDirection,
      suggestedQty,
      suggestedNote,
    });
  }

  const rtCandidates = items.filter((it) => it.rtDirection);
  rtCandidates.sort((a, b) => {
    const ua = a.rtDirection === 'sinjeju_to_aewol' ? a.aewol.daysOfStock : a.sinjeju.daysOfStock;
    const ub = b.rtDirection === 'sinjeju_to_aewol' ? b.aewol.daysOfStock : b.sinjeju.daysOfStock;
    const va = ua === null ? -1 : ua; // null(=재고0, 판매속도0) 이 가장 급함
    const vb = ub === null ? -1 : ub;
    return va - vb;
  });
  const others = items.filter((it) => !it.rtDirection);

  const sortedItems = [...rtCandidates, ...others];

  const summary = {
    totalSkus: items.length,
    rtTotal: rtCandidates.length,
    aewolToSinjeju: rtCandidates.filter((it) => it.rtDirection === 'aewol_to_sinjeju').length,
    sinjejuToAewol: rtCandidates.filter((it) => it.rtDirection === 'sinjeju_to_aewol').length,
  };

  const snapshot = {
    generatedAt: new Date().toISOString(),
    stockDate,
    salesWindow: { from: fmtDate(salesFrom), to: fmtDate(salesTo), days: VELOCITY_WINDOW_DAYS },
    riskDaysThreshold: RISK_DAYS_THRESHOLD,
    summary,
    items: sortedItems,
  };

  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(snapshot, null, 2), 'utf-8');

  const template = fs.readFileSync(path.join(__dirname, 'rt_dashboard_template.html'), 'utf-8');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  let out = template.replace('__SNAPSHOT_JSON__', JSON.stringify(snapshot));
  out = out.split('__SNAPSHOT_TIME__').join(timeStr);

  const outPath = path.join(__dirname, 'rt_dashboard.html');
  fs.writeFileSync(outPath, out, 'utf-8');
  console.log('written', outPath, 'size', fs.statSync(outPath).size);

  // Vercel 정적 배포용 사본 — 같은 조각(fragment)을 표준 HTML 문서로 감싸기만 함(내용은 동일).
  const webDir = path.join(__dirname, '..', 'rt-transfer-dashboard-web');
  if (fs.existsSync(webDir)) {
    const webOut =
      '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n' +
      out +
      '\n</body>\n</html>\n';
    const webOutPath = path.join(webDir, 'index.html');
    fs.writeFileSync(webOutPath, webOut, 'utf-8');
    console.log('written', webOutPath, 'size', fs.statSync(webOutPath).size);
  }

  console.log('summary:', summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
