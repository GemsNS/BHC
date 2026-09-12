<#
.SYNOPSIS
  Install (or remove) the BHC Lead Scout as a Windows Scheduled Task that runs 24/7 on this PC.

.DESCRIPTION
  Registers a task named "BHC Lead Scout" that starts at logon for the current user and runs
    cmd /c npm run scout -- --daemon
  in the repo folder. The task restarts itself if the process dies and has no time limit,
  so the scout keeps scanning Kijiji / Craigslist / Reddit / web (and Facebook Marketplace
  once you have saved an ops session with `npm run scout -- --login`).

  Before running this, put these in <repo>\.env (never commit them):
    BHC_BASE_URL=https://bhcontracting.ca
    ADS_INBOUND_SECRET=<same value as the server>
    SCOUT_RUNNER_NAME=Owner PC
  Optional: SCOUT_PLATFORMS, SCOUT_INTERVAL_MIN, SCOUT_SWEEP_MIN, FB_SESSION_STATE.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\install-lead-scout.ps1
  powershell -ExecutionPolicy Bypass -File deploy\windows\install-lead-scout.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [string]$RepoPath = "",
  [string]$TaskName = "BHC Lead Scout"
)

$ErrorActionPreference = "Stop"

if (-not $RepoPath) {
  # deploy\windows\install-lead-scout.ps1 -> repo root is two levels up
  $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

if ($Uninstall) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $existing) {
    Write-Host "Task '$TaskName' is not installed."
  } else {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed task '$TaskName'."
  }
  return
}

if (-not (Test-Path (Join-Path $RepoPath "package.json"))) {
  throw "package.json not found in '$RepoPath' — pass -RepoPath <folder containing package.json>."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -eq $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if ($null -eq $npm) { throw "npm was not found on PATH. Install Node.js 22 first." }

$envFile = Join-Path $RepoPath ".env"
$hasSecret = $false
$hasBase = $false
if (Test-Path $envFile) {
  $envText = Get-Content $envFile -Raw
  if ($envText -match "(?m)^\s*ADS_INBOUND_SECRET\s*=\s*\S") { $hasSecret = $true }
  if ($envText -match "(?m)^\s*BHC_BASE_URL\s*=\s*\S") { $hasBase = $true }
}
if (-not $hasSecret) { Write-Warning "ADS_INBOUND_SECRET is not set in $envFile — the CRM will reject results until it is." }
if (-not $hasBase) { Write-Warning "BHC_BASE_URL is not set in $envFile — defaulting to http://127.0.0.1:3000. Set BHC_BASE_URL=https://bhcontracting.ca for production." }

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c npm run scout -- --daemon" -WorkingDirectory $RepoPath
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "BHC CRM lead scout: scans Kijiji/Craigslist/Reddit/web for homeowner job requests and posts them to the CRM. Managed by deploy\windows\install-lead-scout.ps1." | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Installed and started task '$TaskName' (runs at logon, restarts on failure, no time limit)."
Write-Host "  Repo:   $RepoPath"
Write-Host "  Check:  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "  Stop:   Stop-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Remove: powershell -ExecutionPolicy Bypass -File deploy\windows\install-lead-scout.ps1 -Uninstall"
Write-Host "  Test:   npm run scout -- --dry-run   (scrapes without posting)"
Write-Host "  Watch:  Admin -> Automation -> Lead scout in the CRM shows this runner's heartbeat."
