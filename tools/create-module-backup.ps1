param(
  [string]$ModuleRoot = "wildharvest",
  [string]$BackupsRoot = "backups"
)

$ErrorActionPreference = "Stop"

function Get-UniqueBackupName {
  param(
    [string]$BasePath
  )

  if (-not (Test-Path -LiteralPath $BasePath)) {
    return $BasePath
  }

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  return "$BasePath-$timestamp"
}

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $workspaceRoot $ModuleRoot
$backupsPath = Join-Path $workspaceRoot $BackupsRoot
$moduleManifestPath = Join-Path $modulePath "module.json"

if (-not (Test-Path -LiteralPath $modulePath)) {
  throw "Module folder not found: $modulePath"
}

if (-not (Test-Path -LiteralPath $moduleManifestPath)) {
  throw "module.json not found: $moduleManifestPath"
}

New-Item -ItemType Directory -Path $backupsPath -Force | Out-Null

$manifest = Get-Content -LiteralPath $moduleManifestPath -Raw | ConvertFrom-Json
$moduleId = [string]$manifest.id
$moduleVersion = [string]$manifest.version

if ([string]::IsNullOrWhiteSpace($moduleId)) {
  throw "Module id is missing in module.json."
}

if ([string]::IsNullOrWhiteSpace($moduleVersion)) {
  throw "Module version is missing in module.json."
}

$baseBackupName = "$moduleId-v$moduleVersion"
$snapshotPath = Get-UniqueBackupName -BasePath (Join-Path $backupsPath $baseBackupName)
$zipPath = "$snapshotPath.zip"

Copy-Item -LiteralPath $modulePath -Destination $snapshotPath -Recurse -Force

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -LiteralPath $snapshotPath -DestinationPath $zipPath -CompressionLevel Optimal

[pscustomobject]@{
  ModuleId = $moduleId
  Version = $moduleVersion
  Snapshot = $snapshotPath
  Zip = $zipPath
} | ConvertTo-Json -Depth 3
