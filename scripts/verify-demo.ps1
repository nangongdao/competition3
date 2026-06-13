param(
  [switch]$RunInstall,
  [switch]$SkipQuality,
  [switch]$SkipBuild,
  [switch]$RequireProviderConfig,
  [string]$WorkerUrl = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)

  Write-Host ""
  Write-Host "== $Message =="
}

function Assert-CommandAvailable {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "Required command not found on PATH: $Name"
  }

  Write-Host "Found ${Name}: $($command.Source)"
}

function Invoke-CheckedCommand {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList
  )

  Write-Host "Running: $FilePath $($ArgumentList -join ' ')"
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
  }
}

function Get-DevVars {
  param([string]$Path)

  $vars = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $vars
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmedLine = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmedLine) -or $trimmedLine.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmedLine.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $name = $trimmedLine.Substring(0, $separatorIndex).Trim()
    $value = $trimmedLine.Substring($separatorIndex + 1).Trim()
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $vars[$name] = $value
    }
  }

  return $vars
}

function Get-DevVarValue {
  param(
    [hashtable]$Vars,
    [string]$Name
  )

  if ($Vars.ContainsKey($Name)) {
    return [string]$Vars[$Name]
  }

  return ""
}

function Assert-NodeVersion {
  $nodeVersion = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to read Node.js version."
  }

  $majorText = $nodeVersion.TrimStart("v").Split(".")[0]
  $major = [int]$majorText
  if ($major -lt 24) {
    throw "Node.js 24+ is required. Found $nodeVersion."
  }

  Write-Host "Node.js version: $nodeVersion"
}

function Test-ProviderConfig {
  param(
    [hashtable]$Vars,
    [bool]$ShouldRequireProviderConfig
  )

  $apiKey = Get-DevVarValue $Vars "OPENAI_API_KEY"
  $providerMode = Get-DevVarValue $Vars "OPENAI_PROVIDER_MODE"
  $chatModel = Get-DevVarValue $Vars "OPENAI_CHAT_MODEL"
  $realtimeModel = Get-DevVarValue $Vars "OPENAI_REALTIME_MODEL"
  $effectiveProviderMode = $providerMode

  if ([string]::IsNullOrWhiteSpace($apiKey)) {
    $message = ".dev.vars does not contain OPENAI_API_KEY. No-key smoke tests are still valid, but live model calls will return configuration errors."
    if ($ShouldRequireProviderConfig) {
      throw $message
    }
    Write-Warning $message
    return
  }

  if ([string]::IsNullOrWhiteSpace($providerMode)) {
    Write-Warning "OPENAI_PROVIDER_MODE is not set. The Worker will fall back to its default provider mode."
    $effectiveProviderMode = "chat"
  }
  elseif ($providerMode -ne "chat" -and $providerMode -ne "realtime") {
    $message = "OPENAI_PROVIDER_MODE is '$providerMode'. Expected 'chat' or 'realtime'."
    if ($ShouldRequireProviderConfig) {
      throw $message
    }
    Write-Warning $message
  }

  if ($effectiveProviderMode -eq "chat" -and [string]::IsNullOrWhiteSpace($chatModel)) {
    $message = "OPENAI_PROVIDER_MODE=chat requires OPENAI_CHAT_MODEL for live Chat Completions demo calls."
    if ($ShouldRequireProviderConfig) {
      throw $message
    }
    Write-Warning $message
  }
  elseif ($effectiveProviderMode -eq "realtime" -and [string]::IsNullOrWhiteSpace($realtimeModel)) {
    Write-Warning "OPENAI_PROVIDER_MODE=realtime has no OPENAI_REALTIME_MODEL set; the Worker default may be used."
  }

  Write-Host ".dev.vars provider mode: $effectiveProviderMode"
  Write-Host "Provider key present: yes"
}

function Test-WorkerEndpoint {
  param([string]$BaseUrl)

  if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    Write-Host "Skipped Worker HTTP checks because -WorkerUrl was not provided."
    return
  }

  $normalizedBaseUrl = $BaseUrl.TrimEnd("/")
  $healthUrl = "$normalizedBaseUrl/api/health"
  $providerConfigUrl = "$normalizedBaseUrl/api/provider/config"

  Write-Host "Checking Worker health endpoint: $healthUrl"
  $healthResponse = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 10
  if ($healthResponse.StatusCode -ne 200) {
    throw "Worker health check returned HTTP $($healthResponse.StatusCode)."
  }

  Write-Host "Checking provider config endpoint: $providerConfigUrl"
  $providerResponse = Invoke-WebRequest -UseBasicParsing -Uri $providerConfigUrl -TimeoutSec 10
  if ($providerResponse.StatusCode -ne 200) {
    throw "Provider config check returned HTTP $($providerResponse.StatusCode)."
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  Write-Step "Toolchain"
  Assert-CommandAvailable "node"
  Assert-CommandAvailable "corepack"
  Assert-NodeVersion
  Invoke-CheckedCommand "corepack" @("pnpm", "--version")

  Write-Step "Project files"
  if (-not (Test-Path -LiteralPath "package.json")) {
    throw "package.json was not found. Run this script from the repository checkout."
  }
  if (-not (Test-Path -LiteralPath "docs/design.md")) {
    throw "docs/design.md was not found."
  }
  if (-not (Test-Path -LiteralPath "docs/roadmap.md")) {
    throw "docs/roadmap.md was not found."
  }
  Write-Host "Required project files are present."

  Write-Step "Provider configuration"
  $devVars = Get-DevVars ".dev.vars"
  Test-ProviderConfig $devVars ([bool]$RequireProviderConfig)

  if ($RunInstall) {
    Write-Step "Dependencies"
    Invoke-CheckedCommand "corepack" @("pnpm", "install", "--frozen-lockfile")
  }
  else {
    Write-Host "Skipped dependency install. Pass -RunInstall to run pnpm install --frozen-lockfile."
  }

  if (-not $SkipQuality) {
    Write-Step "Quality gates"
    Invoke-CheckedCommand "corepack" @("pnpm", "lint")
    Invoke-CheckedCommand "corepack" @("pnpm", "typecheck")
    Invoke-CheckedCommand "corepack" @("pnpm", "test")
  }
  else {
    Write-Host "Skipped lint/typecheck/test because -SkipQuality was provided."
  }

  if (-not $SkipBuild) {
    Write-Step "Production build"
    Invoke-CheckedCommand "corepack" @("pnpm", "build")
  }
  else {
    Write-Host "Skipped build because -SkipBuild was provided."
  }

  Write-Step "Worker checks"
  Test-WorkerEndpoint $WorkerUrl

  Write-Host ""
  Write-Host "Demo readiness checks completed."
}
finally {
  Pop-Location
}
