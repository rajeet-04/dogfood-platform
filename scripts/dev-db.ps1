param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"
$PgBin = "D:\dogfood-tools\pg\pgsql\bin"
$env:Path = "$PgBin;$env:Path"
$PgData = "D:\dogfood-tools\pgdata"
$Log = "D:\dogfood-tools\pg.log"
$PgHost = "127.0.0.1"
$Port = 5432
$User = "dogfood"

switch ($Action) {
  "start" {
    if (-not (Test-Path "$PgData\PG_VERSION")) {
      Write-Error "PostgreSQL data dir not initialized. Run: initdb -D $PgData -U $User -A trust -E UTF8 --no-locale"
    }
    & pg_isready -h $PgHost -p $Port -U $User | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Output "DOGFOOD Postgres is already running on $PgHost`:$Port."
    }
    else {
      Write-Output "Starting DOGFOOD Postgres on $PgHost`:$Port (this takes a few seconds)..."
      & pg_ctl -D $PgData -l $Log -o "-p $Port -h $PgHost" -w start
      Start-Sleep -Seconds 2
    }
    $s = & pg_isready -h $PgHost -p $Port -U $User
    Write-Output "CHECK: $s"
    if ($LASTEXITCODE -eq 0) {
      Write-Output "SUCCESS - Postgres is up. You can close this window any time."
    }
    else {
      Write-Error "Postgres did not start. Check $Log for details."
    }
  }
  "stop" {
    & pg_ctl -D $PgData stop
  }
  "status" {
    $s = & pg_isready -h $PgHost -p $Port -U $User
    Write-Output "CHECK: $s"
  }
}