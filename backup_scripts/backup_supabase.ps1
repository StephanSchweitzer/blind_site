# Supabase logical backup (schema, data, and a full dump).
#
# Requires SUPABASE_DB_URL pointing at a SESSION connection — NOT the transaction
# pooler. pg_dump needs session-level features that pgbouncer's transaction mode
# (port 6543) does not provide, so a 6543 URL can never work here:
#
#   works : postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
#   fails : ...:6543/postgres?pgbouncer=true&connection_limit=2
#
# Prisma-only query parameters (pgbouncer, connection_limit, schema) are stripped
# automatically — libpq does not understand them, and a lost "?" turns the whole
# query string into part of the database name.

# Deliberately NOT "Stop": in Windows PowerShell, a native command writing to
# stderr raises NativeCommandError, which under Stop would abort the whole run at
# the first failed dump. We want all three attempted, then one honest verdict —
# so failures are detected through $LASTEXITCODE instead.
$ErrorActionPreference = "Continue"

function Fail($message) {
    Write-Host $message -ForegroundColor Red
    exit 1
}

$DB_URL = $env:SUPABASE_DB_URL

if (-not $DB_URL) {
    Fail "SUPABASE_DB_URL environment variable is not set."
}

# --- VALIDATE ---------------------------------------------------------------
# Strip Prisma's query parameters; pg_dump/libpq reject them.
if ($DB_URL -match '\?') {
    $DB_URL = $DB_URL -replace '\?.*$', ''
    Write-Host "Note: stripped query parameters from the connection URL (pg_dump does not accept them)."
}

$parsed = $null
try { $parsed = [System.Uri]$DB_URL } catch {
    Fail "SUPABASE_DB_URL is not a valid URI. Expected postgresql://user:password@host:5432/postgres"
}

if ($parsed.Port -eq 6543) {
    Fail @"
SUPABASE_DB_URL points at port 6543, the transaction pooler (pgbouncer).
pg_dump cannot dump through it. Use the session connection on port 5432:
  postgresql://postgres.<ref>:<password>@$($parsed.Host):5432/postgres
"@
}

# Never print the URL itself — it carries the password.
Write-Host "Target: $($parsed.Host):$($parsed.Port)$($parsed.AbsolutePath)"

$BACKUP_DIR = "$HOME\supabase_backups"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null

# --- DUMP -------------------------------------------------------------------
# Each dump is checked: a backup script that reports success after a failed dump
# is worse than no backup script, because it is trusted before a migration.
$failed = @()

function Invoke-Dump {
    param([string]$Label, [string[]]$ExtraArgs, [string]$OutFile)

    Write-Host "Backing up $Label..."
    & pg_dump --dbname=$DB_URL --no-owner --no-acl @ExtraArgs -f $OutFile

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "$Label FAILED (pg_dump exit code $LASTEXITCODE)"
        $script:failed += $Label
        if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
        return
    }
    if (-not (Test-Path $OutFile)) {
        Write-Warning "$Label FAILED (no output file)"
        $script:failed += $Label
        return
    }
    $size = (Get-Item $OutFile).Length
    if ($size -eq 0) {
        Write-Warning "$Label FAILED (empty file)"
        Remove-Item $OutFile -Force
        $script:failed += $Label
        return
    }
    Write-Host ("  ok - {0:N1} MB" -f ($size / 1MB))
}

Invoke-Dump -Label "schema" -ExtraArgs @("--schema-only") -OutFile "$BACKUP_DIR\schema_$TIMESTAMP.sql"
Invoke-Dump -Label "data"   -ExtraArgs @("--data-only")   -OutFile "$BACKUP_DIR\data_$TIMESTAMP.sql"
Invoke-Dump -Label "full"   -ExtraArgs @()                -OutFile "$BACKUP_DIR\full_$TIMESTAMP.sql"

# --- REPORT -----------------------------------------------------------------
if ($failed.Count -gt 0) {
    Fail "BACKUP INCOMPLETE - failed: $($failed -join ', '). Do NOT rely on this run."
}

Write-Host "Done. All three dumps verified non-empty in $BACKUP_DIR" -ForegroundColor Green
exit 0
