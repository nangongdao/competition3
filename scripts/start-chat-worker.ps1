param(
  [string]$ApiKey = "",
  [string]$BaseUrl = "https://api.openai.com/v1",
  [string]$ChatBaseUrl = "",
  [string]$ChatCompletionsPath = "/chat/completions",
  [string]$ChatCompletionsUrl = "",
  [string]$ChatModel = "",
  [ValidateSet("max_tokens", "max_completion_tokens", "none")]
  [string]$ChatTokenLimitParameter = "max_tokens",
  [ValidateSet("enabled", "disabled")]
  [string]$ChatVisionInput = "enabled",
  [string]$TranscriptionsPath = "/audio/transcriptions",
  [string]$TranscriptionsUrl = "",
  [string]$TranscriptionModel = "whisper-1",
  [string]$TranscriptionLanguage = "zh",
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

if ([string]::IsNullOrWhiteSpace($ChatModel)) {
  $ChatModel = Read-Host "Enter OPENAI_CHAT_MODEL"
}

if ([string]::IsNullOrWhiteSpace($ChatModel)) {
  throw "OPENAI_CHAT_MODEL is required for Chat Completions mode."
}

$lines = [System.Collections.Generic.List[string]]::new()
Add-EnvLine $lines "OPENAI_API_KEY" $ApiKey
Add-EnvLine $lines "ENVIRONMENT" $Environment
Add-EnvLine $lines "OPENAI_PROVIDER_MODE" "chat"
Add-EnvLine $lines "OPENAI_BASE_URL" $BaseUrl
Add-EnvLine $lines "OPENAI_CHAT_BASE_URL" $ChatBaseUrl
Add-EnvLine $lines "OPENAI_CHAT_COMPLETIONS_PATH" $ChatCompletionsPath
Add-EnvLine $lines "OPENAI_CHAT_COMPLETIONS_URL" $ChatCompletionsUrl
Add-EnvLine $lines "OPENAI_CHAT_MODEL" $ChatModel
Add-EnvLine $lines "OPENAI_CHAT_TOKEN_LIMIT_PARAMETER" $ChatTokenLimitParameter
Add-EnvLine $lines "OPENAI_CHAT_VISION_INPUT" $ChatVisionInput
Add-EnvLine $lines "OPENAI_TRANSCRIPTIONS_PATH" $TranscriptionsPath
Add-EnvLine $lines "OPENAI_TRANSCRIPTIONS_URL" $TranscriptionsUrl
Add-EnvLine $lines "OPENAI_TRANSCRIPTION_MODEL" $TranscriptionModel
Add-EnvLine $lines "OPENAI_TRANSCRIPTION_LANGUAGE" $TranscriptionLanguage

$devVarsPath = Join-Path (Get-Location) ".dev.vars"
[System.IO.File]::WriteAllLines($devVarsPath, $lines, [System.Text.UTF8Encoding]::new($false))

Write-Host "Wrote Worker runtime variables to .dev.vars"

if ($NoStart) {
  Write-Host "Skipped startup because -NoStart was provided."
  exit 0
}

corepack pnpm dev:worker
