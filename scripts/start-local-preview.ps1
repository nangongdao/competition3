param(
  [ValidateSet("worker", "vite")]
  [string]$Mode = "worker",
  [switch]$NoOpen,
  [switch]$Force,
  [int]$OpenTimeoutSeconds = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-CommandAvailable {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "Required command not found on PATH: $Name"
  }
}

function Escape-SingleQuotedString {
  param([string]$Value)

  return $Value.Replace("'", "''")
}

function ConvertTo-EncodedPowerShellCommand {
  param([string]$Command)

  $bytes = [System.Text.Encoding]::Unicode.GetBytes($Command)
  return [Convert]::ToBase64String($bytes)
}

function Test-RunningProcess {
  param([int]$TargetProcessId)

  $process = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
  return $null -ne $process
}

function Get-PreviewState {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Wait-ForPreviewUrl {
  param(
    [string]$Url,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
      return $true
    }
    catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repoRoot ".local-preview"
$statePath = Join-Path $stateDir "preview-state.json"
$logPath = Join-Path $stateDir "preview.log"
$stopScriptPath = Join-Path $PSScriptRoot "stop-local-preview.ps1"

Push-Location $repoRoot

try {
  Assert-CommandAvailable "node"
  Assert-CommandAvailable "corepack"
  Assert-CommandAvailable "powershell.exe"
  $powerShellPath = (Get-Command "powershell.exe").Source

  if (-not (Test-Path -LiteralPath "package.json")) {
    throw "package.json was not found. Run this script from the repository checkout."
  }

  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

  $existingState = Get-PreviewState $statePath
  if ($null -ne $existingState) {
    $existingProcessId = [int]$existingState.pid
    if (Test-RunningProcess $existingProcessId) {
      if (-not $Force) {
        Write-Host "A local preview is already running."
        Write-Host "Mode: $($existingState.mode)"
        Write-Host "URL:  $($existingState.url)"
        Write-Host "PID:  $existingProcessId"
        Write-Host ""
        Write-Host "Stop it with:"
        Write-Host ".\scripts\stop-local-preview.ps1"
        Write-Host ""
        Write-Host "Or restart it with:"
        Write-Host ".\scripts\start-local-preview.ps1 -Force"
        exit 0
      }

      & $stopScriptPath -Quiet
    }
    else {
      Remove-Item -LiteralPath $statePath -Force
    }
  }

  $command = "corepack pnpm dev:worker"
  $url = "http://localhost:8787"
  if ($Mode -eq "vite") {
    $command = "corepack pnpm dev"
    $url = "http://localhost:5173"
  }

  if (Test-Path -LiteralPath $logPath) {
    Remove-Item -LiteralPath $logPath -Force
  }

  $repoLiteral = Escape-SingleQuotedString $repoRoot
  $logLiteral = Escape-SingleQuotedString $logPath
  $launchCommand = @"
Set-Location -LiteralPath '$repoLiteral'
`$ErrorActionPreference = 'Continue'
$command *> '$logLiteral'
exit `$LASTEXITCODE
"@
  $encodedCommand = ConvertTo-EncodedPowerShellCommand $launchCommand

  $process = Start-Process `
    -FilePath $powerShellPath `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedCommand) `
    -WindowStyle Hidden `
    -PassThru

  Start-Sleep -Seconds 2
  if (-not (Test-RunningProcess $process.Id)) {
    throw "Local preview process exited early. Check log: $logPath"
  }

  $state = [ordered]@{
    pid = $process.Id
    mode = $Mode
    url = $url
    command = $command
    logPath = $logPath
    startedAt = (Get-Date).ToString("o")
  }
  $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

  Write-Host "Local preview started."
  Write-Host "Mode: $Mode"
  Write-Host "URL:  $url"
  Write-Host "PID:  $($process.Id)"
  Write-Host "Log:  $logPath"

  if (-not $NoOpen) {
    Write-Host "Waiting for preview URL..."
    $isReady = Wait-ForPreviewUrl $url $OpenTimeoutSeconds
    if (-not $isReady) {
      Write-Warning "Preview URL did not respond within $OpenTimeoutSeconds seconds. Opening it anyway; check the log if it is still loading."
    }

    Start-Process $url
  }

  Write-Host ""
  Write-Host "Stop it with:"
  Write-Host ".\scripts\stop-local-preview.ps1"
}
finally {
  Pop-Location
}
