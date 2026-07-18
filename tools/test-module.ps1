$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $workspaceRoot "wildharvest"
$testPath = Join-Path $moduleRoot "tests\module-core-tests.mjs"
$foundryExe = "C:\Program Files\Foundry Virtual Tabletop\Foundry Virtual Tabletop.exe"
if (-not (Test-Path -LiteralPath $foundryExe)) {
  throw "Foundry executable not found: $foundryExe"
}

if (-not (Test-Path -LiteralPath $testPath)) {
  throw "Canonical module tests not found: $testPath"
}

$runner = Join-Path $env:TEMP ("run-foundry-node-" + [guid]::NewGuid().ToString("N") + ".cmd")
$runnerContent = "@echo off`r`nset ELECTRON_RUN_AS_NODE=1`r`n`"$foundryExe`" %*`r`n"
try {
  Set-Content -LiteralPath $runner -Value $runnerContent -Encoding ASCII
  & $runner $testPath
  if ($LASTEXITCODE -ne 0) {
    throw "Regression tests failed."
  }
} finally {
  if (Test-Path -LiteralPath $runner) {
    Remove-Item -LiteralPath $runner -Force
  }
}
