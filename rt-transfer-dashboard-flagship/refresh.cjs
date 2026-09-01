// 도산/안국/명동/성수 플래그십 4개 매장 RT(매장간 재고이동) 대시보드 스냅샷 생성기.
// 4개 매장이 하나의 풀로 상호 RT — 한 매장이 품절 임박인데 다른 매장(들) 중 재고 있는 곳이
// 있으면 RT 대상으로 플래그한다. 계산 로직은 ../rt-transfer-dashboard/rt-engine.cjs 공유.
// Usage: node refresh.cjs   (이 폴더에서 실행)
const fs = require('fs');
const path = require('path');
const { buildSnapshot } = require('../rt-transfer-dashboard/rt-engine.cjs');

const STORES = [
  { key: 'dosan', shopCode: 'VRDSFS', name: '도산' },
  { key: 'anguk', shopCode: 'VRAGFS', name: '안국' },
  { key: 'myeongdong', shopCode: 'VRMDFS', name: '명동' },
  { key: 'seongsu', shopCode: 'VRSSFS', name: '성수' },
];

const VELOCITY_WINDOW_DAYS = 7;
const RISK_DAYS_THRESHOLD = 7;
const MIN_TRANSFER_QTY = 2;

async function main() {
  const snapshot = await buildSnapshot({
    stores: STORES,
    velocityWindowDays: VELOCITY_WINDOW_DAYS,
    riskDaysThreshold: RISK_DAYS_THRESHOLD,
    minTransferQty: MIN_TRANSFER_QTY,
  });
  snapshot.title = '플래그십 RT 대시보드';
  snapshot.subtitle = '도산 · 안국 · 명동 · 성수 4개 매장이 하나의 풀로 상호 RT(매장간 이동) — 한 매장이 품절 임박인데 다른 매장에 재고가 있으면 이동 대상으로 표시합니다.';

  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(snapshot, null, 2), 'utf-8');

  const template = fs.readFileSync(path.join(__dirname, '..', 'rt-transfer-dashboard', 'rt_dashboard_template.html'), 'utf-8');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  let out = template.replace('__DASHBOARD_TITLE__', snapshot.title);
  out = out.replace('__SNAPSHOT_JSON__', JSON.stringify(snapshot));
  out = out.split('__SNAPSHOT_TIME__').join(timeStr);

  const outPath = path.join(__dirname, 'rt_dashboard.html');
  fs.writeFileSync(outPath, out, 'utf-8');
  console.log('written', outPath, 'size', fs.statSync(outPath).size);

  const webDir = path.join(__dirname, '..', 'rt-transfer-dashboard-flagship-web');
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

  console.log('summary:', snapshot.summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
