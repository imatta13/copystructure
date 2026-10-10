param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$repository = "imatta13/copystructure"
$assetName = "CopyStructure-bundle.zip"
$headers = @{ "User-Agent" = "CopyStructure-Installer" }

try {
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$repository/releases/latest"
    $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    if ($null -eq $asset) {
        throw "El release $($release.tag_name) no contiene $assetName."
    }

    $archivePath = Join-Path $OutputDirectory $assetName
    $bundleDirectory = Join-Path $OutputDirectory "bundle"
    Write-Output "Ultima version publicada: $($release.tag_name)"
    Invoke-WebRequest -Headers $headers -Uri $asset.browser_download_url -OutFile $archivePath -UseBasicParsing
    Expand-Archive -LiteralPath $archivePath -DestinationPath $bundleDirectory -Force
    Set-Content -LiteralPath (Join-Path $bundleDirectory "BUNDLE-VERSION.txt") -Value $release.tag_name -NoNewline -Encoding ascii
} catch {
    Write-Error $_
    exit 1
}
