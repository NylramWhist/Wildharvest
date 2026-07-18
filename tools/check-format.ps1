$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$extensions = @(".css", ".hbs", ".js", ".json", ".md", ".ps1")
$files = @(
  Get-ChildItem -LiteralPath (Join-Path $workspaceRoot "wildharvest") -Recurse -File
  Get-ChildItem -LiteralPath (Join-Path $workspaceRoot "tools") -File
  Get-ChildItem -LiteralPath $workspaceRoot -File
) | Where-Object {
  ($extensions -contains $_.Extension.ToLowerInvariant()) -or
  ($_.Name -in @(".editorconfig", ".gitignore"))
} | Sort-Object -Property FullName -Unique

$strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
$violations = @()

foreach ($file in $files) {
  $relativePath = $file.FullName.Substring($workspaceRoot.Length).TrimStart("\")
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)

  try {
    $text = $strictUtf8.GetString($bytes)
  } catch {
    $violations += "$relativePath is not valid UTF-8"
    continue
  }

  if ($text.Contains([char]0)) {
    $violations += "$relativePath contains a NUL character"
  }
  if ($text -match "(?m)[ \t]+$") {
    $violations += "$relativePath contains trailing whitespace"
  }
  if (($bytes.Length -gt 0) -and ($bytes[$bytes.Length - 1] -ne 10)) {
    $violations += "$relativePath does not end with a newline"
  }
}

if ($violations.Count) {
  throw ("Format check failed:`n- " + ($violations -join "`n- "))
}

Write-Output "FORMAT_OK files=$($files.Count)"
