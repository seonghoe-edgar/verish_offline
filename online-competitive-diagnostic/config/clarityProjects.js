// 자사가 운영하는 Clarity 프로젝트(도메인)별 API 토큰 매핑.
// --url로 넣은 대상 사이트의 호스트명과 매칭되는 프로젝트의 토큰을 사용한다.
// 매칭되는 게 없으면 기본값인 CLARITY_API_TOKEN(국내)으로 폴백한다.
export const CLARITY_PROJECTS = [
  { id: 'kr', label: '국내(KR)', hostPattern: /(^|\.)verish\.me$/i, tokenEnv: 'CLARITY_API_TOKEN' },
  { id: 'global', label: '해외(Global)', hostPattern: /(^|\.)verishshop\.com$/i, tokenEnv: 'CLARITY_API_TOKEN_GLOBAL' },
];

export const DEFAULT_CLARITY_TOKEN_ENV = 'CLARITY_API_TOKEN';
