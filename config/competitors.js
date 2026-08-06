// 필수 비교 대상 경쟁사. 화면 유형별 URL을 못 찾으면 homeUrl로 대체된다.
export const MANDATORY_COMPETITORS = [
  { id: '8fter', name: '8fter', homeUrl: 'https://8fter.co.kr/' },
  { id: 'tamim', name: 'TAMIM', homeUrl: 'https://tamim.shop/' },
  { id: 'andar', name: 'ANDAR', homeUrl: 'https://andar.co.kr/' },
  { id: 'comfortlab', name: 'COMFORTLAB', homeUrl: 'https://www.comfortlab.co.kr/m/' },
  { id: 'skims', name: 'SKIMS', homeUrl: 'https://skims.com/' },
];

// 구조 다이어그램/범례에서 쓰는 섹션 타입 색상. classify.js의 타입 키와 1:1로 맞춘다.
export const BLOCK_TYPES = {
  nav: { label: '내비게이션', color: '#e4e0e3', text: '#5b555c' },
  promo: { label: '프로모션/이벤트 배너', color: '#e3c08c', text: '#5a4620' },
  hero: { label: '히어로/캠페인', color: '#9c3b57', text: '#ffffff' },
  product: { label: '상품 그리드', color: '#d8cfe0', text: '#4a3f57' },
  curate: { label: '세그먼트 큐레이션', color: '#6f9c94', text: '#ffffff' },
  review: { label: '실제 후기 텍스트', color: '#3f7a5c', text: '#ffffff' },
  ugc: { label: 'UGC/인플루언서', color: '#4f7f93', text: '#ffffff' },
  quicklink: { label: '퀵링크 숏컷바', color: '#d98a5f', text: '#ffffff' },
  store: { label: '브랜드 스토리/오프라인 매장', color: '#5a4a6b', text: '#ffffff' },
  footer: { label: '푸터', color: '#201820', text: '#cfc7cd' },
};
