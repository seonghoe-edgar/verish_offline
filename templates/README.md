# 타운홀 디자인 템플릿

`townhall-template.pptx` — 타운홀/사내 발표 자료 요청 시 기본으로 사용하는 서식.

## 팔레트 출처

[베리시 스토어 Align Session](https://docs.google.com/presentation/d/1QDlnuiOiQT7NTtCfCjU-pbDMtfNtVw_dRpCaJKovnP0/edit) 덱에서 추출한 색.

| 용도 | 색상 |
|---|---|
| 배경 (다크) | `#000000` |
| 배경 (라이트) | `#FFFFFF` |
| 포인트 (인디고) | `#4A5CF5` |
| 포인트 보조 (라벤더, 다크 배경용) | `#AEB8F4` |
| 카드/섹션 배경 | `#F4F5FA` |
| 헤딩 텍스트 (라이트 배경) | `#20242E` |
| 본문 텍스트 (라이트 배경) | `#4A4F5C` |

## 레이아웃 구성 (12슬라이드)

커버 → 목차(원형 허브) → Welcome → 소개(이미지+비전 뱃지) → 4열 아이콘 피처 → 도넛 차트 2종 → 케이스 스터디 → 풀블리드 이미지 오버레이 → 3열 스냅샷 링차트 → 다크 비즈니스(체크리스트+막대그래프) → 팀 소개 → 클로징

이미지 자리는 실제 사진 대신 플레이스홀더 카드(아이콘)로 남겨둠 — 실제 사진으로 교체해서 사용.

## 재생성 방법

`townhall-generator/build.js`가 원본 생성 스크립트. 슬라이드별 텍스트/수치/차트 데이터를 바꾸고 싶으면 이 파일을 수정한 뒤 실행:

```bash
cd templates/townhall-generator
npm install pptxgenjs react react-dom react-icons sharp
node build.js
```

`../townhall-template.pptx` 위치에 결과물을 쓰도록 `build.js`의 `writeFile` 경로를 맞춰서 사용.
