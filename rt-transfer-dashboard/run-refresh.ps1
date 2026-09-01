# RT 대시보드 일일 자동 갱신 - Windows 작업 스케줄러에서 이 스크립트를 실행합니다.
# 1) PlayMD에서 데이터를 새로 받아 애월/신제주 + 플래그십(도산/안국/명동/성수) 두 대시보드 모두 갱신
# 2) 갱신된 파일만 골라서 git commit + push -> Vercel이 push를 감지해 각자 자동 재배포
#
# 2026-09-01: 8/28~9/1 나흘간 배포가 멈춰있던 원인 발견 — $ErrorActionPreference="Stop" 상태에서
# git이 stderr로 찍는 "LF will be replaced by CRLF" 같은 무해한 경고까지 NativeCommandError로 승격되어
# git add 직후 스크립트 전체가 죽었음. repo에 `git config core.safecrlf false`로 경고 자체를 없앴고,
# 아래에서도 git 구간은 $ErrorActionPreference="Continue"로 두고 $LASTEXITCODE로만 성패를 판단하도록 변경.
Start-Sleep -Seconds 20
$repoRoot = Resolve-Path "$PSScriptRoot\.."
$logPath = "$PSScriptRoot\last-run.log"

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node refresh.cjs *> $logPath

Set-Location "$repoRoot\rt-transfer-dashboard-flagship"
node refresh.cjs *>> $logPath
$ErrorActionPreference = "Continue"

Set-Location $repoRoot
$pathsToAdd = @(
  "rt-transfer-dashboard/data.json", "rt-transfer-dashboard/rt_dashboard.html", "rt-transfer-dashboard-web/index.html",
  "rt-transfer-dashboard-flagship/data.json", "rt-transfer-dashboard-flagship/rt_dashboard.html", "rt-transfer-dashboard-flagship-web/index.html"
)
git add $pathsToAdd *>> $logPath

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Add-Content $logPath "no data change, skipping commit/push"
} else {
  $dateStr = Get-Date -Format "yyyy-MM-dd HH:mm"
  git commit -m "RT dashboard daily data refresh - $dateStr" *>> $logPath
  if ($LASTEXITCODE -ne 0) {
    Add-Content $logPath "ERROR: git commit failed, exit $LASTEXITCODE"
  } else {
    git push origin HEAD *>> $logPath
    if ($LASTEXITCODE -ne 0) {
      Add-Content $logPath "ERROR: git push failed, exit $LASTEXITCODE"
    }
  }
}
