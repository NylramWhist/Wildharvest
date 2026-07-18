$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $workspaceRoot "wildharvest"
$foundryExe = "C:\Program Files\Foundry Virtual Tabletop\Foundry Virtual Tabletop.exe"
if (-not (Test-Path -LiteralPath $foundryExe)) {
  throw "Foundry executable not found: $foundryExe"
}

if (-not (Test-Path -LiteralPath (Join-Path $moduleRoot "module.json"))) {
  throw "Canonical module source not found: $moduleRoot"
}

$runner = Join-Path $env:TEMP ("run-foundry-node-" + [guid]::NewGuid().ToString("N") + ".cmd")
$runnerContent = "@echo off`r`nset ELECTRON_RUN_AS_NODE=1`r`n`"$foundryExe`" %*`r`n"
try {
  Set-Content -LiteralPath $runner -Value $runnerContent -Encoding ASCII

  $jsErrors = @()
  Get-ChildItem -LiteralPath (Join-Path $moduleRoot "scripts") -Recurse -File -Filter "*.js" | ForEach-Object {
    & $runner --check $_.FullName
    if ($LASTEXITCODE -ne 0) {
      $jsErrors += $_.FullName
    }
  }
  if ($jsErrors.Count) {
    throw ("JS syntax failures: " + ($jsErrors -join ", "))
  }

  $jsonErrors = @()
  Get-ChildItem -LiteralPath $moduleRoot -Recurse -File -Filter "*.json" | ForEach-Object {
    try {
      $null = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
    } catch {
      $jsonErrors += $_.FullName
    }
  }
  if ($jsonErrors.Count) {
    throw ("JSON parse failures: " + ($jsonErrors -join ", "))
  }

  Write-Output "VALIDATION_OK"
} finally {
  if (Test-Path -LiteralPath $runner) {
    Remove-Item -LiteralPath $runner -Force
  }
}
