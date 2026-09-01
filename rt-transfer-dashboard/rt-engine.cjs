// 공용 RT(매장간 재고이동) 계산 엔진 - PlayMD 데이터를 받아 N개 매장이 하나의 풀로
// 상호 RT하는 경우의 OOS 위험 + 이동 추천을 계산한다. 애월/신제주(2개 매장) 대시보드와
// 플래그십(도산/안국/명동/성수, 4개 매장) 대시보드가 이 엔진을 공유한다.
const https = require('https');

const KEY = '47bRHdszb8vBFQcA8lORQxGefmH/Skf0VuWIQJKXjHI=';
const TENANT = 'deepdive';

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

// [from, to] 쌍으로 최대 4일씩 나눈 청크 목록 생성 (PlayMD sales API 제약)
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
  const soldQty = new Map();
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

// stores: [{key, shopCode, name}] - 이 stores 배열의 매장들은 서로 any-to-any로 RT 가능한
// 하나의 풀로 취급된다. 반환된 snapshot.items[].flows 는 이 풀 안에서 계산된 이동 추천이다.
async function buildSnapshot({ stores, velocityWindowDays = 7, riskDaysThreshold = 7, minTransferQty = 2 }) {
  const today = new Date();
  const stockDate = fmtDate(today);
  const salesTo = addDays(today, -1); // 오늘자는 아직 집계 중이므로 어제까지
  const salesFrom = addDays(salesTo, -(velocityWindowDays - 1));

  console.log('stockDate:', stockDate, 'sales window:', fmtDate(salesFrom), '~', fmtDate(salesTo));

  const perStore = {};
  for (const store of stores) {
    console.log('fetching', store.name);
    const [stock, sold] = await Promise.all([
      fetchStock(store.shopCode, stockDate),
      fetchSalesVelocity(store.shopCode, salesFrom, salesTo),
    ]);
    perStore[store.key] = { stock, sold };
    console.log(`  ${store.key}: stock SKUs=${stock.size}, sold SKUs=${sold.size}`);
  }

  const storeByKey = Object.fromEntries(stores.map((s) => [s.key, s]));

  const allKeys = new Set();
  for (const s of stores) for (const k of perStore[s.key].stock.keys()) allKeys.add(k);

  const items = [];
  for (const key of allKeys) {
    let base = null;
    const storeData = {};

    for (const store of stores) {
      const stockRow = perStore[store.key].stock.get(key);
      const sold = perStore[store.key].sold.get(key) || 0;
      if (!stockRow) {
        storeData[store.key] = null;
        continue;
      }
      base = base || stockRow;
      const velocity = sold / velocityWindowDays;
      const daysOfStock = velocity > 0 ? stockRow.stockCount / velocity : null;
      const risk = stockRow.stockCount <= 0 || (velocity > 0 && daysOfStock <= riskDaysThreshold);
      storeData[store.key] = { stock: stockRow.stockCount, sold7d: sold, velocity, daysOfStock, risk };
    }
    if (!base) continue;

    // 위험 매장을 급한 순(재고0/소진임박 먼저)으로 정렬 - 급한 곳부터 먼저 배정
    const riskStores = stores
      .filter((s) => storeData[s.key] && storeData[s.key].risk)
      .sort((a, b) => {
        const infoA = storeData[a.key];
        const infoB = storeData[b.key];
        const va = infoA.stock <= 0 ? -1 : infoA.daysOfStock ?? 999;
        const vb = infoB.stock <= 0 ? -1 : infoB.daysOfStock ?? 999;
        return va - vb;
      });

    // 위험하지 않은 매장의 "자기 몫 7일치 남기고 낼 수 있는" 여유 재고
    const remainingSurplus = {};
    for (const s of stores) {
      const info = storeData[s.key];
      if (info && !info.risk && info.stock > 0) {
        const keep = Math.ceil(riskDaysThreshold * info.velocity);
        remainingSurplus[s.key] = Math.max(info.stock - keep, 0);
      }
    }

    const flows = [];
    for (const r of riskStores) {
      const rInfo = storeData[r.key];
      const targetCover = Math.ceil(riskDaysThreshold * rInfo.velocity);
      const shortfall = Math.max(targetCover - Math.max(rInfo.stock, 0), rInfo.velocity > 0 ? 0 : 1);

      // 1순위: 버퍼(자기 7일치)를 남기고도 여유가 가장 많은 매장
      let donorKey = null;
      let donorAvail = 0;
      for (const s of stores) {
        if (s.key === r.key) continue;
        const rem = remainingSurplus[s.key] || 0;
        if (rem > donorAvail) {
          donorAvail = rem;
          donorKey = s.key;
        }
      }

      let qty = 0;
      let note = '';
      if (donorKey) {
        qty = Math.min(shortfall, donorAvail);
        remainingSurplus[donorKey] -= qty;
      }

      if (qty <= 0) {
        // 2순위(버퍼 무시 fallback): 위험하지 않은 매장 중 원재고가 가장 많은 곳
        let fbKey = null;
        let fbStock = 0;
        for (const s of stores) {
          if (s.key === r.key) continue;
          const sInfo = storeData[s.key];
          if (!sInfo || sInfo.risk || sInfo.stock <= 0) continue;
          if (sInfo.stock > fbStock) {
            fbStock = sInfo.stock;
            fbKey = s.key;
          }
        }
        if (fbKey) {
          qty = Math.min(shortfall, fbStock);
          donorKey = fbKey;
          note = `${storeByKey[fbKey].name} 자체 버퍼 여유 적음 — 신중 검토`;
        }
      }

      if (donorKey && qty >= minTransferQty) {
        flows.push({ from: donorKey, to: r.key, qty, note });
      }
    }

    items.push({
      key,
      productCode: base.productCode,
      productName: base.productName,
      colorName: base.colorName,
      sizeCode: base.sizeCode,
      styleName: base.styleName,
      storeData,
      flows,
    });
  }

  const rtItems = items.filter((it) => it.flows.length > 0);
  const others = items.filter((it) => it.flows.length === 0);

  rtItems.sort((a, b) => {
    const urgency = (it) =>
      Math.min(
        ...it.flows.map((f) => {
          const info = it.storeData[f.to];
          return info.stock <= 0 ? -1 : info.daysOfStock ?? 999;
        })
      );
    return urgency(a) - urgency(b);
  });

  const flowCounts = {}; // storeKey -> {in, out}
  for (const s of stores) flowCounts[s.key] = { in: 0, out: 0 };
  for (const it of rtItems) {
    for (const f of it.flows) {
      flowCounts[f.from].out += 1;
      flowCounts[f.to].in += 1;
    }
  }

  const summary = {
    totalSkus: items.length,
    rtTotal: rtItems.length,
    byStore: stores.map((s) => ({ key: s.key, name: s.name, in: flowCounts[s.key].in, out: flowCounts[s.key].out })),
  };

  return {
    generatedAt: new Date().toISOString(),
    stockDate,
    salesWindow: { from: fmtDate(salesFrom), to: fmtDate(salesTo), days: velocityWindowDays },
    riskDaysThreshold,
    minTransferQty,
    stores,
    summary,
    items: [...rtItems, ...others],
  };
}

module.exports = { buildSnapshot, fmtDate, addDays };
