# Recovery test for NFR-003 (Test Plan: TC-Rel-01). RUN IN A WINDOWS POWERSHELL OPENED AS ADMINISTRATOR.
# Stops the MySQL service for a short time, records how the API behaves, restarts MySQL and
# measures how long the API takes to recover WITHOUT restarting the Node server.
# Run: powershell -ExecutionPolicy Bypass -File .\recovery-test.ps1
param(
  [string]$ServiceName = "MySQL80",
  [int]$BeforeSec = 15,
  [int]$DownSec = 20,
  [int]$AfterMaxSec = 120
)

$Base    = "http://localhost:5000"
$Log     = "recovery-run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt"
$dataUrl = "$Base/api/attendance?classId=5&date=2026-09-01"

function Write-Both($text, $color = "White") {
  Write-Host $text -ForegroundColor $color
  Add-Content -Path $Log -Value $text
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Both "This window is not running as Administrator. Close it and open Windows PowerShell (Admin)." "Red"
  exit 1
}

# Log in BEFORE stopping MySQL (logging in needs the database)
try {
  $loginBody = @{ email = "teacher1@example.com"; password = "TeacherPass2026" } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$Base/api/auth/login" -ContentType "application/json" -Body $loginBody
  $h = @{ Authorization = "Bearer $($login.token)" }
} catch {
  Write-Both "Could not log in. Is the server running on $Base ?" "Red"
  exit 1
}

function Probe($url, $headers) {
  try {
    $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 5
    return [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    return 0
  }
}

$script:prev = ""
function Sample($phase) {
  $hc = Probe "$Base/api/health" @{}
  $dc = Probe $dataUrl $h
  $key = "$hc/$dc"
  if ($key -ne $script:prev) {
    Write-Both ("{0}  [{1}]  health={2}  attendance-records={3}" -f (Get-Date -Format "HH:mm:ss"), $phase, $hc, $dc)
    $script:prev = $key
  }
  return @{ Health = $hc; Data = $dc }
}

Write-Both "Recovery test started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), service $ServiceName"
Write-Both "A line is printed whenever the HTTP codes change (0 = no answer)."
$stopped = $false
$firstBad = $null; $healthBack = $null; $dataBack = $null; $tStart = $null

try {
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt $BeforeSec) { [void](Sample "healthy"); Start-Sleep -Seconds 1 }

  Write-Both ("{0}  >>> stopping MySQL service" -f (Get-Date -Format "HH:mm:ss")) "Yellow"
  Stop-Service -Name $ServiceName -Force
  $stopped = $true
  $t1 = Get-Date
  while (((Get-Date) - $t1).TotalSeconds -lt $DownSec) {
    $s = Sample "mysql stopped"
    if (-not $firstBad -and $s.Health -ne 200) { $firstBad = Get-Date }
    Start-Sleep -Seconds 1
  }

  Write-Both ("{0}  >>> starting MySQL service" -f (Get-Date -Format "HH:mm:ss")) "Yellow"
  Start-Service -Name $ServiceName
  $stopped = $false
  $tStart = Get-Date
  $t2 = Get-Date
  while (((Get-Date) - $t2).TotalSeconds -lt $AfterMaxSec) {
    $s = Sample "mysql started"
    if (-not $healthBack -and $s.Health -eq 200) { $healthBack = Get-Date }
    if (-not $dataBack -and $s.Data -eq 200) { $dataBack = Get-Date }
    if ($healthBack -and $dataBack) { break }
    Start-Sleep -Seconds 1
  }
} finally {
  if ($stopped -or ((Get-Service -Name $ServiceName).Status -ne 'Running')) {
    Start-Service -Name $ServiceName
    Write-Both "Safety: the script restarted the MySQL service." "Yellow"
  }
}

Write-Both ("-" * 64)
if ($firstBad) { Write-Both "Health check reported the outage while MySQL was stopped: yes" } else { Write-Both "Health check never reported an outage (unexpected)" "Red" }
if ($healthBack) { Write-Both ("Health check healthy again {0:N1} s after MySQL was started" -f ($healthBack - $tStart).TotalSeconds) "Green" } else { Write-Both "Health check did NOT recover within $AfterMaxSec s" "Red" }
if ($dataBack)   { Write-Both ("Attendance records served again {0:N1} s after MySQL was started" -f ($dataBack - $tStart).TotalSeconds) "Green" } else { Write-Both "Attendance records did NOT recover within $AfterMaxSec s" "Red" }
if ($firstBad -and $healthBack) { Write-Both ("Total time the API reported unavailable: {0:N1} s (the Node server was not restarted)" -f ($healthBack - $firstBad).TotalSeconds) }
Write-Both "Log saved to: $Log"