# Performance test for NFR-001 / NFR-002 (Test Plan: TC-Perf-01, TC-Perf-02).
# Needs: server running, seed data loaded (docs/qa/perf/seed-perf-data.sql), teacher1 assigned to the PERF-A class.
# Run: powershell -ExecutionPolicy Bypass -File .\run-performance-tests.ps1 -ClassId 5
param(
  [int]$ClassId = 5,
  [int]$Iterations = 30,
  [int]$ThresholdMs = 3000
)

if ($Iterations -gt 45) { $Iterations = 45 }   # the PATCH test uses seeded dates 0..44 days back

$Base         = "http://localhost:5000"
$TeacherEmail = "teacher1@example.com"
$TeacherPass  = "TeacherPass2026"
$Log          = "perf-run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt"
$inv          = [Globalization.CultureInfo]::InvariantCulture
$seedStart    = [datetime]::ParseExact("2026-09-01", "yyyy-MM-dd", $inv)   # newest seeded date
$postStart    = [datetime]::ParseExact("2027-01-01", "yyyy-MM-dd", $inv)   # dates with no records yet

function Write-Both($text, $color = "White") {
  Write-Host $text -ForegroundColor $color
  Add-Content -Path $Log -Value $text
}

try {
  $loginBody = @{ email = $TeacherEmail; password = $TeacherPass } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$Base/api/auth/login" -ContentType "application/json" -Body $loginBody
  $script:Token = $login.token
} catch {
  Write-Both "Could not log in. Is the server running on $Base ?" "Red"
  exit 1
}

function Invoke-Timed($method, $path, $body) {
  $headers = @{ Authorization = "Bearer $script:Token" }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $status = 0
  try {
    if ($body) {
      $r = Invoke-WebRequest -Method $method -Uri "$Base$path" -Headers $headers -ContentType "application/json" -Body $body -UseBasicParsing
    } else {
      $r = Invoke-WebRequest -Method $method -Uri "$Base$path" -Headers $headers -UseBasicParsing
    }
    $status = [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
  }
  $sw.Stop()
  return @{ Ms = $sw.Elapsed.TotalMilliseconds; Status = $status }
}

function Get-Stats($times) {
  $s = @($times | Sort-Object)
  $n = $s.Count
  $idx = [math]::Ceiling(0.95 * $n) - 1
  return @{
    Min = $s[0]
    Avg = ($s | Measure-Object -Average).Average
    P95 = $s[$idx]
    Max = $s[$n - 1]
  }
}

$script:pass = 0
$script:fail = 0

function Run-Group($id, $name, $expStatus, $warmIdx, [scriptblock]$make) {
  foreach ($w in $warmIdx) { $q = & $make $w; [void](Invoke-Timed $q.Method $q.Path $q.Body) }   # warm-up, not counted
  $times = @()
  $failed = 0
  $firstBad = ""
  for ($i = 0; $i -lt $Iterations; $i++) {
    $q = & $make $i
    $r = Invoke-Timed $q.Method $q.Path $q.Body
    $times += $r.Ms
    if ($r.Status -ne $expStatus) { $failed++; if (-not $firstBad) { $firstBad = "HTTP " + $r.Status } }
  }
  $st = Get-Stats $times
  $ok = ($failed -eq 0) -and ($st.P95 -le $ThresholdMs)
  if ($ok) { $script:pass++; $label = "PASS"; $color = "Green" } else { $script:fail++; $label = "FAIL"; $color = "Red" }
  Write-Both ("[{0}] {1}  {2}" -f $label, $id, $name) $color
  Write-Both ("       n={0}  min {1:N0} ms  avg {2:N0} ms  p95 {3:N0} ms  max {4:N0} ms  failed requests {5} {6}" -f $Iterations, $st.Min, $st.Avg, $st.P95, $st.Max, $failed, $firstBad)
}

Write-Both "SAMS performance test run - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Both "Class id $ClassId, $Iterations timed requests per test, target: 95th percentile <= $ThresholdMs ms, sequential single user"
Write-Both ("-" * 78)

# The 60 student ids of the performance class
$rows = Invoke-RestMethod -Uri "$Base/api/attendance?classId=$ClassId&date=2026-09-01" -Headers @{ Authorization = "Bearer $script:Token" }
$studentIds = @($rows | ForEach-Object { $_.studentId })
if ($studentIds.Count -eq 0) { Write-Both "No students found for class $ClassId. Did the seed script run?" "Red"; exit 1 }
Write-Both "Students in class: $($studentIds.Count)"

function New-Body($date, $status) {
  $recs = @($studentIds | ForEach-Object { @{ studentId = $_; status = $status } })
  return (@{ classId = $ClassId; date = $date; records = $recs } | ConvertTo-Json -Depth 4 -Compress)
}

# TC-Perf-01: attendance updates (NFR-001)
Run-Group "TC-Perf-01a" "Mark attendance, whole class (POST)" 201 @(200, 201) {
  param($i)
  $d = $postStart.AddDays($i).ToString("yyyy-MM-dd", $inv)
  @{ Method = "POST"; Path = "/api/attendance"; Body = (New-Body $d "present") }
}
Run-Group "TC-Perf-01b" "Edit attendance, whole class incl. audit rows (PATCH)" 200 @(50, 51) {
  param($i)
  $d = $seedStart.AddDays(-$i).ToString("yyyy-MM-dd", $inv)
  @{ Method = "PATCH"; Path = "/api/attendance"; Body = (New-Body $d "absent") }
}

# TC-Perf-02: record and dashboard access (NFR-002)
Run-Group "TC-Perf-02a" "View attendance by class and date (GET)" 200 @(0, 1) {
  param($i)
  $d = $seedStart.AddDays(-$i).ToString("yyyy-MM-dd", $inv)
  @{ Method = "GET"; Path = "/api/attendance?classId=$ClassId&date=$d"; Body = $null }
}
Run-Group "TC-Perf-02b" "Teacher dashboard with percentages (GET)" 200 @(0, 1) {
  param($i)
  @{ Method = "GET"; Path = "/api/attendance/dashboard?classId=$ClassId"; Body = $null }
}

Write-Both ("-" * 78)
Write-Both ("Passed: {0}   Failed: {1}   Total: {2}" -f $script:pass, $script:fail, ($script:pass + $script:fail))
Write-Both "Log saved to: $Log"