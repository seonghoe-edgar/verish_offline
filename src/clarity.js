import { CLARITY_PROJECTS, DEFAULT_CLARITY_TOKEN_ENV } from '../config/clarityProjects.js';

const CLARITY_ENDPOINT = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

// 분석 대상 URL의 호스트명을 보고 어느 Clarity 프로젝트(토큰)를 써야 할지 고른다.
// 매칭되는 프로젝트가 없으면 기본 토큰(국내)으로 폴백한다.
function resolveClarityToken(url) {
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    // url이 없거나 파싱 불가하면 기본 토큰으로 폴백
  }
  const project = CLARITY_PROJECTS.find((p) => p.hostPattern.test(hostname));
  const tokenEnv = project?.tokenEnv || DEFAULT_CLARITY_TOKEN_ENV;
  return { token: process.env[tokenEnv], tokenEnv, label: project?.label };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function metricInfo(byName, name) {
  const info = byName[name]?.[0];
  if (!info) return null;
  return {
    sessionsWithMetricPercentage: Math.round((info.sessionsWithMetricPercentage || 0) * 10) / 10,
    subTotal: num(info.subTotal),
    pagesViews: num(info.pagesViews),
  };
}

function topN(byName, name, n = 5) {
  return (byName[name] || []).slice(0, n).map((row) => ({
    name: row.name ?? row.url ?? '(직접 유입/알 수 없음)',
    count: num(row.sessionsCount ?? row.visitsCount),
  }));
}

export function summarizeClarityInsights(raw, { numOfDays = 3, projectLabel = null } = {}) {
  if (!raw) return null;
  const byName = Object.fromEntries(raw.map((m) => [m.metricName, m.information]));
  const traffic = byName.Traffic?.[0];
  const engagement = byName.EngagementTime?.[0];
  const scroll = byName.ScrollDepth?.[0];

  return {
    numOfDays,
    projectLabel,
    traffic: traffic
      ? {
          totalSessionCount: num(traffic.totalSessionCount),
          totalBotSessionCount: num(traffic.totalBotSessionCount),
          distinctUserCount: num(traffic.distinctUserCount),
          pagesPerSession: Math.round((traffic.pagesPerSessionPercentage || 0) * 100) / 100,
        }
      : null,
    engagementTimeSec: engagement ? { total: num(engagement.totalTime), active: num(engagement.activeTime) } : null,
    averageScrollDepth: scroll ? scroll.averageScrollDepth : null,
    frustrationSignals: {
      deadClick: metricInfo(byName, 'DeadClickCount'),
      rageClick: metricInfo(byName, 'RageClickCount'),
      quickback: metricInfo(byName, 'QuickbackClick'),
      scriptError: metricInfo(byName, 'ScriptErrorCount'),
      errorClick: metricInfo(byName, 'ErrorClickCount'),
      excessiveScroll: metricInfo(byName, 'ExcessiveScroll'),
    },
    topDevices: topN(byName, 'Device'),
    topOS: topN(byName, 'OS'),
    topCountries: topN(byName, 'Country'),
    topReferrers: topN(byName, 'ReferrerUrl'),
    popularPages: (byName.PopularPages || []).slice(0, 5).map((row) => ({ url: row.url, count: num(row.visitsCount) })),
  };
}

// 대상 사이트 url의 호스트명에 맞는 Clarity 프로젝트 토큰(config/clarityProjects.js)이
// 설정되어 있으면 최근 N일(최대 3일) 실측 트래픽/행동 데이터를 가져온다.
// 토큰 미설정이거나 호출 실패 시 null을 반환하며, 호출부는 해당 섹션을 생략하는 것으로
// 처리한다. (경쟁사는 각기 다른 Clarity 프로젝트/토큰이 필요해 이 API로는 조회할 수 없다.)
export async function getClarityInsights({ url, numOfDays = 3 } = {}) {
  const { token, label } = resolveClarityToken(url);
  if (!token) return null;

  const res = await fetch(`${CLARITY_ENDPOINT}?numOfDays=${numOfDays}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Clarity API 오류(${label || '기본'} 프로젝트): ${describeClarityError(res.status)}`);
  const raw = await res.json();
  return summarizeClarityInsights(raw, { numOfDays, projectLabel: label });
}

// 공식 문서(Possible response errors)에 정의된 상태 코드를 사람이 읽을 수 있는 메시지로 변환한다.
// 특히 429는 "프로젝트당 하루 10회" 제한이라 재시도해도 소용없으므로 원인을 명확히 알려준다.
function describeClarityError(status) {
  switch (status) {
    case 401:
      return 'HTTP 401 Unauthorized — CLARITY_API_TOKEN이 없거나 만료/무효합니다.';
    case 403:
      return 'HTTP 403 Forbidden — 이 토큰은 해당 작업 권한이 없습니다.';
    case 400:
      return 'HTTP 400 BadRequest — 요청 파라미터가 올바르지 않습니다.';
    case 429:
      return 'HTTP 429 TooManyRequests — 프로젝트당 하루 10회 호출 제한을 초과했습니다. 내일 다시 시도하세요.';
    default:
      return `HTTP ${status}`;
  }
}
