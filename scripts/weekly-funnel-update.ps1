# 매주 월요일 11:00에 Windows 작업 스케줄러가 실행하는 스크립트.
# 퍼널 스냅샷을 만들고, 변경이 있으면 커밋/푸시해서 Vercel 재배포를 트리거한다.
# 실패(예: Cafe24 refresh_token 만료) 시 update-log.txt에 사유를 남긴다.

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\DEEPDIVE\Desktop\projects\verish_offline"

$logFile = "funnel-dashboard-web\update-log.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] 시작" | Out-File -Append -Encoding utf8 $logFile

try {
    npx tsx scripts/funnel-dashboard-snapshot.ts *>> $logFile
    if ($LASTEXITCODE -ne 0) {
        throw "funnel-dashboard-snapshot.ts 실패 (exit $LASTEXITCODE) - 로그 마지막 줄 참고. Cafe24 refresh_token이 만료됐다면 `npm run cafe24-setup`으로 재인증 필요."
    }

    git add funnel-dashboard-web/public/data
    $changes = git status --porcelain -- funnel-dashboard-web/public/data

    if ($changes) {
        $history = Get-Content funnel-dashboard-web/public/data/weekly-summary.json -Raw | ConvertFrom-Json
        $latestWeek = $history[$history.Count - 1]
        $msg = "Weekly funnel snapshot: $($latestWeek.weekStart) ~ $($latestWeek.weekEnd)"

        git commit -m $msg *>> $logFile
        git push *>> $logFile

        "[$timestamp] 완료: $msg" | Out-File -Append -Encoding utf8 $logFile
    } else {
        "[$timestamp] 변경 없음 - 커밋 생략" | Out-File -Append -Encoding utf8 $logFile
    }
} catch {
    "[$timestamp] 실패: $($_.Exception.Message)" | Out-File -Append -Encoding utf8 $logFile
}
