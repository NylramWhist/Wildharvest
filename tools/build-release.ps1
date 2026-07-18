param(
  [string]$ModuleRoot = "wildharvest",
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$workspaceFull = [System.IO.Path]::GetFullPath($workspaceRoot)
$modulePath = Join-Path $workspaceFull $ModuleRoot
$manifestPath = Join-Path $modulePath "module.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "module.json not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$moduleId = [string]$manifest.id
$moduleVersion = [string]$manifest.version

if ([string]::IsNullOrWhiteSpace($moduleId) -or [string]::IsNullOrWhiteSpace($moduleVersion)) {
  throw "The module manifest must define id and version."
}
if ((Split-Path -Leaf $modulePath) -cne $moduleId) {
  throw "Module folder '$((Split-Path -Leaf $modulePath))' does not exactly match manifest id '$moduleId'."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $workspaceFull "Wildharvest-$moduleVersion.zip"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $workspaceFull $OutputPath
}
$outputFull = [System.IO.Path]::GetFullPath($OutputPath)
$workspacePrefix = $workspaceFull.TrimEnd("\") + "\"
if (-not $outputFull.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release output must stay inside the workspace: $outputFull"
}

$checkScripts = @(
  "check-format.ps1",
  "validate-module.ps1",
  "test-module.ps1"
)
foreach ($scriptName in $checkScripts) {
  $scriptPath = Join-Path $PSScriptRoot $scriptName
  & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath
  if ($LASTEXITCODE -ne 0) {
    throw "Release prerequisite failed: $scriptName"
  }
}

$includeDirectories = @("assets", "lang", "scripts", "styles", "templates")
$includeFiles = @(
  "CHANGELOG.md",
  "COMPATIBILITY.md",
  "LOOT-ENGINES.md",
  "module.json",
  "README.md",
  "RELEASE-CHECKLIST.md",
  "TESTING.md"
)
$optionalFiles = @("LICENSE")

foreach ($relativePath in @($includeDirectories + $includeFiles)) {
  if (-not (Test-Path -LiteralPath (Join-Path $modulePath $relativePath))) {
    throw "Required release path is missing: $relativePath"
  }
}

$tempName = "wildharvest-release-" + [guid]::NewGuid().ToString("N")
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) $tempName
$stagedModule = Join-Path $tempRoot $moduleId
$verificationRoot = Join-Path $tempRoot "verification"

try {
  New-Item -ItemType Directory -Path $stagedModule -Force | Out-Null

  foreach ($directory in $includeDirectories) {
    Copy-Item -LiteralPath (Join-Path $modulePath $directory) -Destination $stagedModule -Recurse -Force
  }
  foreach ($file in $includeFiles) {
    Copy-Item -LiteralPath (Join-Path $modulePath $file) -Destination $stagedModule -Force
  }
  foreach ($file in $optionalFiles) {
    $sourceFile = Join-Path $modulePath $file
    if (Test-Path -LiteralPath $sourceFile) {
      Copy-Item -LiteralPath $sourceFile -Destination $stagedModule -Force
    }
  }

  $outputParent = Split-Path -Parent $outputFull
  New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
  if (Test-Path -LiteralPath $outputFull) {
    Remove-Item -LiteralPath $outputFull -Force
  }
  Compress-Archive -LiteralPath $stagedModule -DestinationPath $outputFull -CompressionLevel Optimal

  New-Item -ItemType Directory -Path $verificationRoot -Force | Out-Null
  Expand-Archive -LiteralPath $outputFull -DestinationPath $verificationRoot -Force
  $expandedModule = Join-Path $verificationRoot $moduleId
  if (-not (Test-Path -LiteralPath (Join-Path $expandedModule "module.json"))) {
    throw "Release ZIP does not contain $moduleId/module.json at its root."
  }

  $expectedFiles = Get-ChildItem -LiteralPath $stagedModule -Recurse -File
  $archiveFiles = Get-ChildItem -LiteralPath $expandedModule -Recurse -File
  $mismatches = @()

  foreach ($file in $expectedFiles) {
    $relativePath = $file.FullName.Substring($stagedModule.Length).TrimStart("\")
    $archiveFile = Join-Path $expandedModule $relativePath
    if (-not (Test-Path -LiteralPath $archiveFile)) {
      $mismatches += "missing:$relativePath"
      continue
    }
    $expectedHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    $archiveHash = (Get-FileHash -LiteralPath $archiveFile -Algorithm SHA256).Hash
    if ($expectedHash -ne $archiveHash) {
      $mismatches += "hash:$relativePath"
    }
  }

  foreach ($file in $archiveFiles) {
    $relativePath = $file.FullName.Substring($expandedModule.Length).TrimStart("\")
    if (-not (Test-Path -LiteralPath (Join-Path $stagedModule $relativePath))) {
      $mismatches += "extra:$relativePath"
    }
    if ($relativePath -match "(^|\\)(tests?|backups?|\.git)(\\|$)" -or
        $relativePath -match "\.(ps1|rar|tmp|zip)$" -or
        $relativePath -eq "package.json") {
      $mismatches += "forbidden:$relativePath"
    }
  }

  if ($mismatches.Count) {
    throw ("Release verification failed: " + ($mismatches -join ", "))
  }

  $releaseManifest = Get-Content -LiteralPath (Join-Path $expandedModule "module.json") -Raw | ConvertFrom-Json
  if (($releaseManifest.id -cne $moduleId) -or ($releaseManifest.version -cne $moduleVersion)) {
    throw "Release manifest identity/version differs from the source manifest."
  }

  $releaseItem = Get-Item -LiteralPath $outputFull
  [pscustomobject]@{
    ModuleId = $moduleId
    Version = $moduleVersion
    Release = $releaseItem.FullName
    Files = $archiveFiles.Count
    Size = $releaseItem.Length
    SHA256 = (Get-FileHash -LiteralPath $releaseItem.FullName -Algorithm SHA256).Hash
    TestsExcluded = -not (Test-Path -LiteralPath (Join-Path $expandedModule "tests"))
    Verified = $true
  } | ConvertTo-Json -Depth 3
} finally {
  $tempFull = [System.IO.Path]::GetFullPath($tempRoot)
  $systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $safeTemp = $tempFull.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
    ((Split-Path -Leaf $tempFull).StartsWith("wildharvest-release-"))
  if ($safeTemp -and (Test-Path -LiteralPath $tempFull)) {
    Remove-Item -LiteralPath $tempFull -Recurse -Force
  } elseif (Test-Path -LiteralPath $tempFull) {
    throw "Refusing unsafe release cleanup path: $tempFull"
  }
}
