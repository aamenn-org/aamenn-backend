param(
    [string]$Root = (Get-Location).Path,
    [switch]$IncludeGitHistory,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'

$excludedDirectories = @(
    '.git',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.turbo',
    '.cache',
    '.vite',
    'tmp',
    'temp',
    'logs'
)

$excludedExtensions = @(
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.heic', '.heif',
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.ogg',
    '.zip', '.gz', '.tar', '.rar', '.7z', '.pdf', '.woff', '.woff2', '.ttf', '.eot',
    '.lock'
)

$rules = @(
    @{ Severity = 'CRITICAL'; Name = 'Private key block'; Pattern = '-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----' },
    @{ Severity = 'CRITICAL'; Name = 'Generic secret assignment'; Pattern = '(?i)\b(secret|client_secret|app_secret|jwt_secret|hmac_secret|api_secret|private_key|application_key|smtp_pass|password|passwd|pwd|token|access_token|refresh_token)\b\s*[:=]\s*[''\"]?[^\s''\"#]{8,}' },
    @{ Severity = 'CRITICAL'; Name = 'Hardcoded .env style secret'; Pattern = '(?i)^(?!\s*#)\s*[A-Z0-9_]*(SECRET|PASSWORD|PASS|TOKEN|KEY)[A-Z0-9_]*\s*=\s*(?!$|your-|example|placeholder|changeme|change-me|test|dummy|null|undefined|\$\{|<)[^\s#]{8,}' },
    @{ Severity = 'CRITICAL'; Name = 'AWS access key id'; Pattern = '\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ASIA)[A-Z0-9]{16}\b' },
    @{ Severity = 'CRITICAL'; Name = 'Google OAuth secret'; Pattern = '\bGOCSPX-[A-Za-z0-9_-]{20,}\b' },
    @{ Severity = 'CRITICAL'; Name = 'GitHub token'; Pattern = '\bgh[pousr]_[A-Za-z0-9_]{36,}\b' },
    @{ Severity = 'CRITICAL'; Name = 'Slack token'; Pattern = '\bxox[baprs]-[A-Za-z0-9-]{10,}\b' },
    @{ Severity = 'CRITICAL'; Name = 'Stripe secret key'; Pattern = '\bsk_(live|test)_[A-Za-z0-9]{20,}\b' },
    @{ Severity = 'CRITICAL'; Name = 'Paymob secret key'; Pattern = '\begy_sk_(live|test)_[A-Fa-f0-9]{32,}\b' },
    @{ Severity = 'HIGH'; Name = 'Paymob public key'; Pattern = '\begy_pk_(live|test)_[A-Za-z0-9]{20,}\b' },
    @{ Severity = 'HIGH'; Name = 'Cloudflare Turnstile secret'; Pattern = '\b0x4[A-Za-z0-9_-]{20,}\b' },
    @{ Severity = 'HIGH'; Name = 'JWT token'; Pattern = '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b' },
    @{ Severity = 'HIGH'; Name = 'Backblaze B2 application key'; Pattern = '\bK[0-9A-Za-z/+_-]{20,}\b' },
    @{ Severity = 'HIGH'; Name = 'Email app password like Gmail'; Pattern = '\b[a-z]{16}\b' },
    @{ Severity = 'HIGH'; Name = 'PEM/key/cert file reference'; Pattern = '(?i)\b[^\s]+\.(pem|key|p12|pfx|crt)\b' },
    @{ Severity = 'MEDIUM'; Name = 'ngrok URL'; Pattern = 'https?://[A-Za-z0-9-]+\.ngrok(?:-free)?\.app[^\s''\"]*' },
    @{ Severity = 'MEDIUM'; Name = 'Hardcoded localhost production URL'; Pattern = '(?i)(PAYMOB_REDIRECT_URL|CALLBACK_URL|REDIRECT_URL|CORS_ORIGIN).*localhost' },
    @{ Severity = 'MEDIUM'; Name = 'Real email address'; Pattern = '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b' },
    @{ Severity = 'MEDIUM'; Name = 'IBAN / bank account looking value'; Pattern = '\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b' },
    @{ Severity = 'LOW'; Name = 'TODO security marker'; Pattern = '(?i)TODO.*(secret|password|token|key|security|auth)' }
)

$allowListPatterns = @(
    'your-',
    'your_',
    'example',
    'placeholder',
    'changeme',
    'change-me',
    'dummy',
    'abc123',
    'xyz789',
    'some-random',
    'c29tZS1yYW5kb20',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    'U2FsdGVkX1+',
    'test@example.com',
    'noreply@aamenn.com',
    'info@aamenn.com',
    'user@gmail.com',
    'admin@aamenn.com',
    'localhost',
    'your-api.com',
    'your-app.com',
    'your-auth-provider.com',
    'YOUR_DOMAIN',
    'YOUR_INSTANCE',
    'YOUR_PROJECT',
    'process\.env\.',
    'document\.getElementById',
    'configService\.get',
    'this\.configService\.get',
    'this\.secretKey',
    'jwtSecret',
    'redisPassword',
    'response\.data\.',
    'crypto\.randomBytes',
    'nextPageToken',
    'token: string',
    'password: string',
    'data\.accessToken',
    'newMasterKey',
    '<min-',
    '\.interface',
    '\.service',
    '\.controller',
    '\$\{[A-Z0-9_]+\}'
)

function Test-IsExcludedPath {
    param([string]$Path)

    $parts = $Path -split '[\\/]'
    foreach ($part in $parts) {
        if ($excludedDirectories -contains $part) {
            return $true
        }
    }

    $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    return $excludedExtensions -contains $extension
}

function Test-IsAllowedFinding {
    param([string]$Text)

    foreach ($pattern in $allowListPatterns) {
        if ($Text -match $pattern) {
            return $true
        }
    }

    return $false
}

function Get-Entropy {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return 0
    }

    $counts = @{}
    foreach ($char in $Value.ToCharArray()) {
        if (-not $counts.ContainsKey($char)) {
            $counts[$char] = 0
        }
        $counts[$char]++
    }

    $entropy = 0.0
    foreach ($count in $counts.Values) {
        $p = $count / $Value.Length
        $entropy -= $p * [Math]::Log($p, 2)
    }

    return [Math]::Round($entropy, 3)
}

function Add-Finding {
    param(
        [System.Collections.Generic.List[object]]$Findings,
        [string]$Severity,
        [string]$Rule,
        [string]$File,
        [int]$LineNumber,
        [string]$Line,
        [string]$Match
    )

    if (Test-IsAllowedFinding -Text $Line) {
        return
    }

    $Findings.Add([pscustomobject]@{
        Severity = $Severity
        Rule = $Rule
        File = $File
        LineNumber = $LineNumber
        Match = $Match
        Line = $Line.Trim()
    }) | Out-Null
}

function Scan-File {
    param(
        [string]$FilePath,
        [System.Collections.Generic.List[object]]$Findings
    )

    $relativePath = Resolve-Path -Path $FilePath -Relative
    $lineNumber = 0

    try {
        foreach ($line in [System.IO.File]::ReadLines($FilePath)) {
            $lineNumber++

            foreach ($rule in $rules) {
                $matches = [regex]::Matches($line, $rule.Pattern)
                foreach ($match in $matches) {
                    Add-Finding -Findings $Findings -Severity $rule.Severity -Rule $rule.Name -File $relativePath -LineNumber $lineNumber -Line $line -Match $match.Value
                }
            }

            if ($line -notmatch '(?i)(secret|password|passwd|pwd|token|key|credential|api|auth|private|hmac|signature)\s*[:=]') {
                continue
            }

            if ($line -match '(?i)(process\.env|configService\.get|this\.configService\.get|import\.meta\.env)') {
                continue
            }

            $candidateMatches = [regex]::Matches($line, '(?<![A-Za-z0-9])[A-Za-z0-9/+_=.-]{32,}(?![A-Za-z0-9])')
            foreach ($candidate in $candidateMatches) {
                $value = $candidate.Value
                if ($value -match '^[0-9.]+$') { continue }
                if ($value -match '^[-A-Za-z0-9]+\.(com|org|net|dev|app|io)$') { continue }
                if (Test-IsAllowedFinding -Text $value) { continue }

                $entropy = Get-Entropy -Value $value
                if ($entropy -ge 4.2) {
                    Add-Finding -Findings $Findings -Severity 'HIGH' -Rule "High entropy string ($entropy)" -File $relativePath -LineNumber $lineNumber -Line $line -Match $value
                }
            }
        }
    } catch {
        $Findings.Add([pscustomobject]@{
            Severity = 'LOW'
            Rule = 'Unreadable file'
            File = $relativePath
            LineNumber = 0
            Match = ''
            Line = $_.Exception.Message
        }) | Out-Null
    }
}

function Scan-GitHistory {
    param([System.Collections.Generic.List[object]]$Findings)

    $patterns = @('secret', 'password', 'passwd', 'pwd', 'token', 'key', 'env', 'credential', 'private')
    foreach ($pattern in $patterns) {
        $logLines = git log --all --oneline --grep=$pattern 2>$null
        foreach ($logLine in $logLines) {
            $Findings.Add([pscustomobject]@{
                Severity = 'MEDIUM'
                Rule = "Suspicious commit message: $pattern"
                File = 'GIT_HISTORY'
                LineNumber = 0
                Match = $logLine
                Line = $logLine
            }) | Out-Null
        }
    }
}

$resolvedRoot = (Resolve-Path -Path $Root).Path
Set-Location $resolvedRoot

$findings = [System.Collections.Generic.List[object]]::new()

$gitFiles = git ls-files --cached --others --exclude-standard 2>$null
if (-not $gitFiles) {
    $gitFiles = Get-ChildItem -Path $resolvedRoot -Recurse -Force -File |
        Where-Object { -not (Test-IsExcludedPath -Path $_.FullName) } |
        ForEach-Object { Resolve-Path -Path $_.FullName -Relative }
}

$files = @($gitFiles |
    ForEach-Object { Join-Path $resolvedRoot $_ } |
    Where-Object { (Test-Path $_ -PathType Leaf) -and -not (Test-IsExcludedPath -Path $_) })

$dangerousFileNames = $files |
    ForEach-Object { Get-Item $_ } |
    Where-Object { $_.Name -match '^(\.env|\.env\..+|id_rsa|id_dsa|id_ecdsa|id_ed25519)$|\.(pem|key|p12|pfx)$' } |
    Where-Object { $_.Name -notin @('.env.example', '.env.sample', '.env.template') }

foreach ($file in $dangerousFileNames) {
    $relativePath = Resolve-Path -Path $file.FullName -Relative
    $findings.Add([pscustomobject]@{
        Severity = 'CRITICAL'
        Rule = 'Sensitive file present'
        File = $relativePath
        LineNumber = 0
        Match = $file.Name
        Line = 'Sensitive file should not be committed or shipped publicly.'
    }) | Out-Null
}

foreach ($file in $files) {
    Scan-File -FilePath $file -Findings $findings
}

if ($IncludeGitHistory) {
    Scan-GitHistory -Findings $findings
}

$severityOrder = @{ CRITICAL = 0; HIGH = 1; MEDIUM = 2; LOW = 3 }
$sortedFindings = $findings | Sort-Object @{ Expression = { $severityOrder[$_.Severity] } }, File, LineNumber, Rule -Unique

if ($Json) {
    $sortedFindings | ConvertTo-Json -Depth 4
    exit
}

Write-Host "Security scan root: $resolvedRoot" -ForegroundColor Cyan
Write-Host "Files scanned: $($files.Count)" -ForegroundColor Cyan
Write-Host "Findings: $($sortedFindings.Count)" -ForegroundColor Cyan
Write-Host ''

$grouped = $sortedFindings | Group-Object Severity | Sort-Object { $severityOrder[$_.Name] }
foreach ($group in $grouped) {
    $color = switch ($group.Name) {
        'CRITICAL' { 'Red' }
        'HIGH' { 'Yellow' }
        'MEDIUM' { 'Magenta' }
        default { 'Gray' }
    }
    Write-Host "[$($group.Name)] $($group.Count) finding(s)" -ForegroundColor $color
    foreach ($finding in $group.Group) {
        Write-Host "  - $($finding.Rule): $($finding.File):$($finding.LineNumber)" -ForegroundColor $color
        if ($finding.Match) {
            Write-Host "    Match: $($finding.Match)" -ForegroundColor DarkGray
        }
        Write-Host "    Line: $($finding.Line)" -ForegroundColor DarkGray
    }
    Write-Host ''
}

if (($sortedFindings | Where-Object { $_.Severity -in @('CRITICAL', 'HIGH') }).Count -gt 0) {
    Write-Host 'Scan failed: critical/high risk findings detected.' -ForegroundColor Red
    exit 1
}

Write-Host 'Scan passed: no critical/high risk findings detected.' -ForegroundColor Green
