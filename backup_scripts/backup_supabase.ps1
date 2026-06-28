# --- CONFIG ---
$DB_URL = $env:SUPABASE_DB_URL

if (-not $DB_URL) {
    Write-Error "SUPABASE_DB_URL environment variable is not set."
    exit 1
}

$BACKUP_DIR = "$HOME\supabase_backups"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"

# --- SETUP ---
New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null

# --- DUMP ---
Write-Host "Backing up schema..."
pg_dump $DB_URL --schema-only --no-owner --no-acl -f "$BACKUP_DIR\schema_$TIMESTAMP.sql"

Write-Host "Backing up data..."
pg_dump $DB_URL --data-only --no-owner --no-acl -f "$BACKUP_DIR\data_$TIMESTAMP.sql"

Write-Host "Backing up full dump..."
pg_dump $DB_URL --no-owner --no-acl -f "$BACKUP_DIR\full_$TIMESTAMP.sql"

Write-Host "Done. Files saved to $BACKUP_DIR"