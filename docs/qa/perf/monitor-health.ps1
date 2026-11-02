# Availability monitor for NFR-003 (Test Plan: TC-Rel-01).
# Run: powershell -ExecutionPolicy Bypass -File .\monitor-health.ps1 -DurationSec 120
param(
  [int]$IntervalSec = 2,
  [int]$DurationSec = 120
)

$Url = "http://localhost:5000/api/health"
$Log = "availability-run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt"

function Write-Both($text, $color = "White") {
  Write-Host $text -ForegroundColor $color
  Add-Content -Path $Log -Value $text
}

function Test-Health {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    return ([int]$r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

$total = 0
$up = 0
$state = $null
$downSince = $null
$longestDown = 0.0
$outages = 0
$start = Get-Date

Write-Both "Availability monitor started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'): polling $Url every $IntervalSec s for $DurationSec s"

while (((Get-Date) - $start).TotalSeconds -lt $DurationSec) {
  $ok = Test-Health
  $now = Get-Date
  $total++
  if ($ok) { $up++ }
  if ($state -ne $ok) {
    if ($ok -and $state -eq $false) {
      $secs = ($now - $downSince).TotalSeconds
      $outages++
      if ($secs -gt $longestDown) { $longestDown = $secs }
      Write-Both ("{0}  UP    (back after {1:N1} s down)" -f $now.ToString("HH:mm:ss"), $secs) "Green"
    } elseif ($ok) {
      Write-Both ("{0}  UP" -f $now.ToString("HH:mm:ss")) "Green"
    } else {
      $downSince = $now
      Write-Both ("{0}  DOWN" -f $now.ToString("HH:mm:ss")) "Red"
    }
    $state = $ok
  }
  Start-Sleep -Seconds $IntervalSec
}

$avail = 0
if ($total -gt 0) { $avail = 100.0 * $up / $total }
Write-Both ("-" * 60)
Write-Both ("Polls: {0}   Up: {1}   Down: {2}" -f $total, $up, ($total - $up))
Write-Both ("Availability over this window: {0:N2} %   (monthly target: 99.5 %)" -f $avail)
Write-Both ("Outages: {0}   Longest outage: {1:N1} s (resolution = polling interval)" -f $outages, $longestDown)
if ($state -eq $false) { Write-Both "Still DOWN when the window ended." "Red" }
Write-Both "Log saved to: $Log"