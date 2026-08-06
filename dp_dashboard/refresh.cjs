// Refreshes the VERISH DP dashboard snapshot from the live Google Sheet.
// Usage: node refresh.js   (run from this directory)
// After running, republish dp_dashboard.html via the Artifact tool with the
// existing artifact's `url` so it updates in place.
const fs = require('fs');
const path = require('path');
const https = require('https');

const SHEET_ID = "1-NXkxzFuS4B-luDVfD3RSVN7odqtm6mDeGFFP183Qmw";
function csvUrl(gid){ return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`; }

const STORES = [
  { key:"dosan",  name:"베리시 도산",       tier:"컨시어지 · S",  mainGid:0,          rawGid:1912955462 },
  { key:"seongsu",name:"베리시 성수",       tier:"플래그십 · L2", mainGid:38355089,   rawGid:180814903  },
  { key:"anguk",  name:"베리시 안국",       tier:"세일즈 · M",    mainGid:411004576,  rawGid:452865611  },
  { key:"myeongdong", name:"베리시 명동",   tier:"세일즈 · L1",   mainGid:1384264503, rawGid:808529729  },
  { key:"dongbusan", name:"베리시 롯데 동부산", tier:"아울렛",     mainGid:324632995,  rawGid:1317141807 },
  { key:"daejeon",name:"신세계 대전",       tier:"백화점",        mainGid:1825504795, rawGid:1535137991 },
  { key:"hanam",  name:"스타필드 하남",     tier:"백화점",        mainGid:674652356,  rawGid:548792956  },
  { key:"jeju",   name:"신제주",            tier:"세일즈 · L1",   mainGid:557498277,  rawGid:171398146  },
  { key:"aewol",  name:"애월",              tier:"세일즈 · M",    mainGid:2066694001, rawGid:788418011  }
];

function fetchText(url){
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseCSV(text) {
  const rows = [];
  let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDpRaw(text) {
  const rows = parseCSV(text);
  let headerIdx = rows.findIndex(r => r[0] === '카테고리' || r[0] === '카데고리');
  const out = [];
  if (headerIdx === -1) return out;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    if (!r[1] && !r[3]) continue;
    const status = (r[10]||"").trim();
    if (status !== '진열') continue;
    out.push({
      product: r[3]||"", option: r[4]||"", color: r[5]||"", size: r[6]||"", sku: r[1]||"",
      zone: (r[8]||"").trim(), location: (r[9]||"").trim(), dpQty: r[12]||""
    });
  }
  return out;
}

function parseZoneCapacity(text) {
  const rows = parseCSV(text);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === 'Depth1(Zone)' && r[1] === 'Depth2(집기)') {
      let j = i + 1;
      while (j < rows.length) {
        const rc = rows[j];
        if (!rc || !rc[0] || !rc[1]) break;
        if (rc[0] === 'Depth1(Zone)') break;
        out.push({ zone: (rc[0]||"").trim(), fixture: (rc[1]||"").trim(), maxCapa: +rc[2]||0, current: +rc[3]||0, extra: rc[4]||"" });
        j++;
      }
      i = j - 1;
    }
  }
  return out;
}

async function main() {
  const result = {};
  for (const s of STORES) {
    console.log('fetching', s.name);
    const [rawText, mainText] = await Promise.all([fetchText(csvUrl(s.rawGid)), fetchText(csvUrl(s.mainGid))]);
    result[s.key] = { dpRaw: parseDpRaw(rawText), zoneCap: parseZoneCapacity(mainText) };
    console.log('  dpRaw (진열):', result[s.key].dpRaw.length, 'zoneCap:', result[s.key].zoneCap.length);
  }

  const template = fs.readFileSync(path.join(__dirname, 'dp_dashboard_template.html'), 'utf-8');
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  let out = template.replace('__SNAPSHOT_JSON__', JSON.stringify(result));
  out = out.split('__SNAPSHOT_TIME__').join(timeStr);

  const outPath = path.join(__dirname, 'dp_dashboard.html');
  fs.writeFileSync(outPath, out, 'utf-8');
  console.log('written', outPath, 'size', fs.statSync(outPath).size, 'timestamp', timeStr);
}
main().catch(e => { console.error(e); process.exit(1); });
