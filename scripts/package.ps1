# Package Permafeed for the Chrome Web Store.
#
# Produces dist/permafeed-<version>.zip containing only what the store needs
# (manifest, icons, source, license) - no docs, dev files, or personal notes.
#
# Entry paths use forward slashes (the ZIP spec requirement); PowerShell's
# Compress-Archive uses backslashes, which can make Chrome fail to find nested
# files, so we build the archive with .NET directly.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/package.ps1

$ErrorActionPreference = 'Stop'
$root = (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$dist = Join-Path $root 'dist'
$zipPath = Join-Path $dist "permafeed-$version.zip"

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Only the runtime files. Everything else (README, .github, plan.md, etc.) stays out.
$files = @()
$files += Get-Item (Join-Path $root 'manifest.json')
$files += Get-Item (Join-Path $root 'LICENSE')
$files += Get-ChildItem -Recurse -File (Join-Path $root 'src')
$files += Get-ChildItem -Recurse -File (Join-Path $root 'icons')

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$prefix = ((Get-Item $root).FullName.TrimEnd('\')) + '\'
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($prefix.Length) -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
}
finally {
  $zip.Dispose()
}

$sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host "Packaged Permafeed v$version -> dist/permafeed-$version.zip ($sizeKb KB)"
