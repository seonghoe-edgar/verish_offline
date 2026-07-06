# 베리시 경쟁사 구조·전환 진단 도구

베리시(자사) 모바일 웹 페이지 URL을 넣으면 8fter·TAMIM·ANDAR·COMFORTLAB·SKIMS(필수 경쟁사)와 구조·전환 관점에서 비교한 리포트를 자동 생성합니다. 사용자가 URL을 여러 개 추가로 넣어 비교 대상을 늘릴 수도 있습니다.

## 빠른 시작

```bash
npm install
node bin/analyze.mjs --url="https://m.verish.me/" --type="홈" --name="Verish"
```

실행하면 `reports/<브랜드명>-<화면유형>-<날짜>/` 폴더에 4개 파일이 생성됩니다.

| 파일 | 내용 |
|---|---|
| `report.html` | 구조 다이어그램 + 실제 이미지 갤러리 + 지표 + (있다면) SWO/AB플랜이 포함된 완결 리포트. 브라우저로 열면 됩니다. |
| `report.md` | 같은 내용의 마크다운 버전 |
| `analysis-prompt.md` | 강점/약점/기회, A/B 플랜을 생성하기 위해 Claude에게 보낼 프롬프트 (실제 수집 데이터 기반) |
| `raw-data.json` | 수집·분류된 원본 데이터 (디버깅/재사용용) |

## 옵션

```
--url=<필수>        분석할 베리시 페이지 URL
--type=<기본값 홈>   화면 유형 라벨 (홈 / PDP / 카테고리 등) — 현재는 라벨로만 쓰이고,
                    경쟁사는 항상 각 브랜드의 홈 URL로 비교합니다 (아래 "한계" 참고)
--name=<선택>       리포트에 표시할 자사 브랜드명 (기본: URL 호스트명)
--extra=<선택>      추가로 비교할 URL, 쉼표로 구분 (예: --extra="https://a.com,https://b.com")
--analysis=<선택>   analysis-prompt.md를 Claude에 붙여넣어 받은 JSON 응답을 파일로 저장한 뒤 경로 지정
```

## 강점/약점/기회, A/B 플랜을 채우는 방법 (2가지)

정성 분석(왜 강점인지, 어떤 실험을 해야 하는지)은 규칙 기반으로 만들 수 없어서 두 가지 경로를 지원합니다.

**방법 A — API 키 자동 연동**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."   # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
node bin/analyze.mjs --url="https://m.verish.me/" --type="홈"
```
키가 설정되어 있으면 실행 중 자동으로 Claude API를 호출해 리포트의 04·05·06 섹션을 채웁니다.

**방법 B — API 키 없이 수동 연동**
1. 먼저 실행: `node bin/analyze.mjs --url=... --type=홈` (SWO/AB 섹션은 비워진 채로 생성됨)
2. 생성된 `analysis-prompt.md` 내용을 Claude(이 대화창 등)에 붙여넣고 JSON 응답을 받음
3. 그 JSON을 파일로 저장 (예: `reports/.../analysis.json`)
4. 다시 실행: `node bin/analyze.mjs --url=... --type=홈 --analysis="reports/.../analysis.json"`

## 실측 트래픽·행동 데이터 연동 (Microsoft Clarity)

자사 사이트의 Microsoft Clarity 프로젝트에서 최근 3일 실측 데이터(세션수, 체류시간, Dead/Rage Click 등 좌절 신호, 인기 페이지)를 가져와 리포트 04번 섹션에 표시하고, 강점·약점 AI 분석의 근거로도 함께 사용합니다. 경쟁사는 각자의 Clarity 프로젝트라 조회 대상에서 제외됩니다.

베리시는 국내(`verish.me`)와 해외(`verishshop.com`) Clarity 프로젝트가 분리되어 있어, `--url`로 넣은 도메인에 따라 알맞은 토큰을 자동으로 선택합니다 (`config/clarityProjects.js`에서 도메인-토큰 매핑을 관리).

```bash
export CLARITY_API_TOKEN="eyJ..."          # 국내(verish.me), PowerShell: $env:CLARITY_API_TOKEN="eyJ..."
export CLARITY_API_TOKEN_GLOBAL="eyJ..."   # 해외(verishshop.com), PowerShell: $env:CLARITY_API_TOKEN_GLOBAL="eyJ..."

node bin/analyze.mjs --url="https://m.verish.me/" --type="홈"        # 국내 토큰 사용
node bin/analyze.mjs --url="https://verishshop.com/" --type="홈"     # 해외 토큰 사용
```

Clarity 대시보드 → Settings → Data Export에서 프로젝트별로 발급받은 토큰을 사용하세요. 토큰은 코드에 하드코딩하지 말고 항상 환경변수로만 전달하세요. 하루 프로젝트당 요청 횟수 제한(10회)이 있으니 반복 실행 시 유의하세요.

## 어떻게 동작하는가

1. **수집 (`src/collect.js`)** — 각 URL을 헤드리스 브라우저 없이 직접 fetch(모바일 UA)해서 HTML을 파싱. 내비게이션 링크, 헤딩/문단 텍스트, 이미지 URL(src/data-src/srcset 전부)을 추출합니다.
2. **분류 (`src/classify.js`)** — 추출된 텍스트를 키워드 휴리스틱으로 `nav/promo/hero/product/curate/review/ugc/footer` 8가지 구조 타입에 매핑해 섹션 순서를 근사합니다. 완벽하지 않으니 리포트의 구조 다이어그램은 참고용입니다.
3. **이미지 (`src/images.js`)** — 분류된 이미지 중 히어로/상품 위주로 최대 3장을 실제로 다운로드해 base64로 리포트에 직접 임베드합니다 (외부 이미지 로드 없이 리포트 파일 하나로 완결).
4. **분석 (`src/promptBuilder.js`, `src/anthropic.js`)** — 수집된 실데이터로 프롬프트를 만들고, 가능하면 Claude API로 강점/약점/기회·A/B플랜·KPI를 생성합니다.
5. **렌더링 (`src/reportTemplate.js`)** — 위 모든 데이터를 HTML/Markdown 리포트로 렌더링합니다.

## 한계 / 다음 단계

- **경쟁사는 항상 홈 URL로 비교합니다.** PDP·카테고리 등 다른 화면 유형을 지정해도 경쟁사 쪽은 자동으로 대응 화면을 찾아주지 않습니다 (브랜드마다 상품 매칭 로직이 필요해 범위 밖으로 뒀습니다). PDP 대 PDP로 비교하려면 `--extra`에 경쟁사 PDP URL을 직접 넣어주세요.
- **JS로 늦게 그려지는 히어로 슬라이더**는 정적 fetch로 못 잡을 수 있습니다 (예: 베리시 메인 슬라이드). 이 경우 이미지 갤러리는 상품 이미지로 대체됩니다.
- **구조 분류는 키워드 휴리스틱**입니다. 오분류가 보이면 `src/classify.js`의 `RULES`를 다듬어주세요.
- **웹 배포**: 지금은 로컬 CLI입니다. 다음 단계로 `bin/analyze.mjs`의 로직을 API 라우트(예: Next.js `app/api/analyze/route.js`)로 옮기고, 프런트에 URL/화면유형 입력 폼을 붙이면 그대로 웹 서비스로 확장할 수 있도록 `src/`를 프레임워크 비의존적으로 분리해뒀습니다.
