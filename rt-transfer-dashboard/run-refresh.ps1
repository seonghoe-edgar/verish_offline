# RT 대시보드 일일 자동 갱신 - Windows 작업 스케줄러에서 이 스크립트를 실행합니다.
# 1) PlayMD에서 데이터를 새로 받아 rt_dashboard.html / rt-transfer-dashboard-web/index.html 갱신
# 2) 갱신된 파일만 골라서 git commit + push -> Vercel이 push를 감지해 자동 재배포
$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $PSScriptRoot

node refresh.cjs *> "$PSScriptRoot\last-run.log"

Set-Location $repoRoot
git add "rt-transfer-dashboard/data.json" "rt-transfer-dashboard/rt_dashboard.html" "rt-transfer-dashboard-web/index.html" *>> "rt-transfer-dashboard\last-run.log"

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Add-Content "rt-transfer-dashboard\last-run.log" "no data change, skipping commit/push"
} else {
  $dateStr = Get-Date -Format "yyyy-MM-dd HH:mm"
  git commit -m "RT dashboard daily data refresh - $dateStr" *>> "rt-transfer-dashboard\last-run.log"
  git push origin HEAD *>> "rt-transfer-dashboard\last-run.log"
}
