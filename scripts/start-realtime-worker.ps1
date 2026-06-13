param(
  [string]$ApiKey = "",
  [string]$BaseUrl = "https://api.openai.com/v1",
  [string]$RealtimeBaseUrl = "",
  [string]$SessionPath = "/realtime/sessions",
  [string]$WebrtcPath = "/realtime",
  [string]$SessionUrl = "",
  [string]$WebrtcUrl = "",
  [string]$Model = "gpt-realtime",
  [string]$Voice = "alloy",
  [string]$Environment = "development",
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Convert-SecureStringToPlainText {
  param([System.Security.SecureString]$Value)

  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Add-EnvLine {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return
  }

  $sanitizedValue = $Value.Replace("`r", "").Replace("`n", "")
  $Lines.Add("${Name}=${sanitizedValue}")
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $secureApiKey = Read-Host "Enter OPENAI_API_KEY or third-party provider key" -AsSecureString
  $ApiKey = Convert-SecureStringToPlainText $secureApiKey
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "OPENAI_API_KEY is required."
}

$lines = [System.Collections.Generic.List[string]]::new()
Add-EnvLine $lines "OPENAI_API_KEY" $ApiKey
Add-EnvLine $lines "ENVIRONMENT" $Environment
Add-EnvLine $lines "OPENAI_BASE_URL" $BaseUrl
Add-EnvLine $lines "OPENAI_REALTIME_BASE_URL" $RealtimeBaseUrl
Add-EnvLine $lines "OPENAI_REALTIME_SESSION_PATH" $SessionPath
Add-EnvLine $lines "OPENAI_REALTIME_WEBRTC_PATH" $WebrtcPath
Add-EnvLine $lines "OPENAI_REALTIME_SESSION_URL" $SessionUrl
Add-EnvLine $lines "OPENAI_REALTIME_WEBRTC_URL" $WebrtcUrl
Add-EnvLine $lines "OPENAI_REALTIME_MODEL" $Model
Add-EnvLine $lines "OPENAI_REALTIME_VOICE" $Voice

$devVarsPath = Join-Path (Get-Location) ".dev.vars"
[System.IO.File]::WriteAllLines($devVarsPath, $lines, [System.Text.UTF8Encoding]::new($false))

Write-Host "Wrote Worker runtime variables to .dev.vars"

if ($NoStart) {
  Write-Host "Skipped startup because -NoStart was provided."
  exit 0
}

corepack pnpm dev:worker
