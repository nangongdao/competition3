param(
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DescendantProcessIds {
  param([int]$ParentProcessId)

  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentProcessId" -ErrorAction SilentlyContinue)
  foreach ($child in $children) {
    $childProcessId = [int]$child.ProcessId
    Get-DescendantProcessIds -ParentProcessId $childProcessId
    $childProcessId
  }
}

function Stop-ProcessIfRunning {
  param([int]$TargetProcessId)

  $process = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    return
  }

  Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repoRoot ".local-preview"
$statePath = Join-Path $stateDir "preview-state.json"

if (-not (Test-Path -LiteralPath $statePath)) {
  if (-not $Quiet) {
    Write-Host "No tracked local preview is running."
    Write-Host "If you started the project manually, close that terminal window or press Ctrl+C in it."
  }
  exit 0
}

$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
$trackedProcessId = [int]$state.pid
$logPath = [string]$state.logPath

$processIds = @()
$processIds += Get-DescendantProcessIds -ParentProcessId $trackedProcessId
$processIds += $trackedProcessId
$processIds = @($processIds | Select-Object -Unique)

foreach ($processId in $processIds) {
  Stop-ProcessIfRunning -TargetProcessId ([int]$processId)
}

Remove-Item -LiteralPath $statePath -Force

if (-not $Quiet) {
  Write-Host "Stopped local preview."
  Write-Host "Previous mode: $($state.mode)"
  Write-Host "Previous URL:  $($state.url)"
  Write-Host "Log:           $logPath"
}
