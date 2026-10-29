# Runs the API test cases for issues #5 and #9 and writes a timestamped log.
# BEFORE running: server must be running, and in MySQL run:  DELETE FROM attendance;
# Uses synthetic test accounts only.

$Base         = "http://localhost:5000"
$TeacherEmail = "teacher1@example.com"
$TeacherPass  = "TeacherPass2026"
$StudentEmail = "student99@example.com"
$StudentPass  = "StudentPass2026"

$Url = "$Base/api/attendance"
$Log = "attendance-test-run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt"

function Write-Both($text, $color = "White") {
  Write-Host $text -ForegroundColor $color
  Add-Content -Path $Log -Value $text
}

function Get-Token($email, $password) {
  $body = @{ email = $email; password = $password } | ConvertTo-Json
  $r = Invoke-RestMethod -Method Post -Uri "$Base/api/auth/login" -ContentType "application/json" -Body $body
  return $r.token
}

function Call-Api($body, $token) {
  $headers = @{}
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  try {
    $resp = Invoke-WebRequest -Method Post -Uri $Url -Headers $headers -ContentType "application/json" -Body $body -UseBasicParsing
    return @{ Status = [int]$resp.StatusCode; Body = $resp.Content }
  } catch {
    $r = $_.Exception.Response
    if ($null -eq $r) { return @{ Status = 0; Body = $_.Exception.Message } }
        return @{ Status = [int]$r.StatusCode; Body = $_.ErrorDetails.Message }
  }
}

$script:pass = 0
$script:fail = 0

function Run-Test($id, $name, $body, $token, $expStatus, $expText) {
  $r = Call-Api $body $token
  $ok = ($r.Status -eq $expStatus) -and ($r.Body -like "*$expText*")
  if ($ok) { $script:pass++; $label = "PASS"; $color = "Green" } else { $script:fail++; $label = "FAIL"; $color = "Red" }
  Write-Both ("[{0}] {1}  {2}" -f $label, $id, $name) $color
  Write-Both ("       expected: HTTP {0} containing '{1}'" -f $expStatus, $expText)
  Write-Both ("       actual  : HTTP {0} {1}" -f $r.Status, $r.Body)
}

Write-Both "SAMS attendance API test run - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Both "Endpoint: POST $Url"
Write-Both ("-" * 70)

try {
  $teacher = Get-Token $TeacherEmail $TeacherPass
  $student = Get-Token $StudentEmail $StudentPass
} catch {
  Write-Both "Could not log in. Is the server running and are the test accounts created?" "Red"
  exit 1
}

# 1. Authentication and authorisation
Run-Test "TC-ATT-01" "No token" '{"classId":1,"date":"2026-10-29","records":[{"studentId":1,"status":"present"}]}' $null 401 "Authentication required"
Run-Test "TC-ATT-02" "Student role" '{"classId":1,"date":"2026-10-29","records":[{"studentId":1,"status":"present"}]}' $student 403 ""
Run-Test "TC-ATT-03" "Class not assigned" '{"classId":2,"date":"2026-10-29","records":[{"studentId":1,"status":"present"}]}' $teacher 403 "not assigned"
Run-Test "TC-ATT-04" "Class does not exist" '{"classId":999,"date":"2026-10-29","records":[{"studentId":1,"status":"present"}]}' $teacher 403 "not assigned"

# 2. Validation
Run-Test "TC-ATT-05" "Invalid status 'late'" '{"classId":1,"date":"2026-10-29","records":[{"studentId":1,"status":"late"}]}' $teacher 400 "status must be"
Run-Test "TC-ATT-06" "Impossible date 2026-13-45" '{"classId":1,"date":"2026-13-45","records":[{"studentId":1,"status":"present"}]}' $teacher 400 "date must be"
Run-Test "TC-ATT-07" "Wrong date format" '{"classId":1,"date":"29-10-2026","records":[{"studentId":1,"status":"present"}]}' $teacher 400 "date must be"
Run-Test "TC-ATT-08" "Empty records" '{"classId":1,"date":"2026-10-29","records":[]}' $teacher 400 "non-empty array"
Run-Test "TC-ATT-09" "Same student twice" '{"classId":1,"date":"2026-10-29","records":[{"studentId":1,"status":"present"},{"studentId":1,"status":"absent"}]}' $teacher 400 "twice"
Run-Test "TC-ATT-10" "Missing classId" '{"date":"2026-10-29","records":[{"studentId":1,"status":"present"}]}' $teacher 400 "classId"

# 3. Enrolment
Run-Test "TC-ATT-11" "Student not enrolled" '{"classId":1,"date":"2026-10-29","records":[{"studentId":99,"status":"present"}]}' $teacher 400 "not enrolled"
Run-Test "TC-ATT-12" "One enrolled, one not" '{"classId":1,"date":"2026-10-29","records":[{"studentId":1,"status":"present"},{"studentId":99,"status":"absent"}]}' $teacher 400 "not enrolled"

# 4. Saving and duplicates
Run-Test "TC-ATT-13" "First save" '{"classId":1,"date":"2026-10-29","records":[{"studentId":1,"status":"present"},{"studentId":2,"status":"absent"}]}' $teacher 201 "Attendance saved"
Run-Test "TC-ATT-14" "Exact repeat rejected" '{"classId":1,"date":"2026-10-29","records":[{"studentId":1,"status":"present"},{"studentId":2,"status":"absent"}]}' $teacher 409 "already exists"
Run-Test "TC-ATT-15" "Different date allowed" '{"classId":1,"date":"2026-10-30","records":[{"studentId":1,"status":"present"},{"studentId":2,"status":"present"}]}' $teacher 201 "Attendance saved"
Run-Test "TC-ATT-16" "One student, new date" '{"classId":1,"date":"2026-10-31","records":[{"studentId":1,"status":"present"}]}' $teacher 201 "Attendance saved"
Run-Test "TC-ATT-17" "Partial overlap rejected" '{"classId":1,"date":"2026-10-31","records":[{"studentId":1,"status":"present"},{"studentId":2,"status":"absent"}]}' $teacher 409 "already exists"

Write-Both ("-" * 70)
Write-Both ("Passed: {0}   Failed: {1}   Total: {2}" -f $script:pass, $script:fail, ($script:pass + $script:fail))
Write-Both "TC-ATT-18 (database check) is manual: run the SELECT from the evidence file in MySQL."
Write-Both "Log saved to: $Log"