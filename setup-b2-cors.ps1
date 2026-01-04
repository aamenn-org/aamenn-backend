# Setup B2 CORS Rules
# This script applies CORS configuration to your B2 bucket

Write-Host "Setting up B2 CORS rules..." -ForegroundColor Cyan

# Check if B2 CLI is installed
$b2Installed = Get-Command b2 -ErrorAction SilentlyContinue

if (-not $b2Installed) {
    Write-Host "❌ B2 CLI not found. Installing..." -ForegroundColor Yellow
    Write-Host "Run: pip install b2sdk" -ForegroundColor Yellow
    Write-Host "Or download from: https://www.backblaze.com/b2/docs/quick_command_line.html" -ForegroundColor Yellow
    exit 1
}

# Load environment variables
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

$keyId = $env:B2_APPLICATION_KEY_ID
$key = $env:B2_APPLICATION_KEY
$bucketName = $env:B2_BUCKET_NAME

if (-not $keyId -or -not $key -or -not $bucketName) {
    Write-Host "❌ Missing B2 credentials in .env file" -ForegroundColor Red
    exit 1
}

Write-Host "Authorizing with B2..." -ForegroundColor Cyan
b2 authorize-account $keyId $key

Write-Host "Applying CORS rules to bucket: $bucketName" -ForegroundColor Cyan
b2 update-bucket --corsRules (Get-Content b2-cors-rules.json -Raw) $bucketName allPublic

Write-Host "✅ CORS rules applied successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Your bucket now allows uploads from:" -ForegroundColor Cyan
Write-Host "  - http://localhost:3000" -ForegroundColor White
Write-Host "  - http://localhost:5173" -ForegroundColor White
Write-Host "  - http://127.0.0.1:5173" -ForegroundColor White
Write-Host "  - https://yourdomain.com (update this in b2-cors-rules.json)" -ForegroundColor White
