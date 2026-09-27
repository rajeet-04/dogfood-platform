param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"
$PgBin = "D:\dogfood-tools\pg\pgsql\bin"
$PgData = "D:\dogfood-tools\pgdata"
$Log = "D:\dogfood-tools\pg.log"
$Host = "127.0.0.1"
$Port = 5432
$User = "dogfood"

function Pg-Cmd($Name, $Args) {
  & (Join-Path $PgBin $Name) @Args 2>&1
}

switch ($Action) {
  "start" {
    if (-not (Test-Path "$PgData\PG_VERSION")) {
      Write-Error "PostgreSQL data dir not initialized. Run: initdb -D $PgData -U $User -A trust -E UTF8 --no-locale"
    }
    $ready = pg_isready -h $Host -p $Port
    if ($LASTEXITCODE -eq 0) {
      Write-Output "already running on $Host`:$Port"
    }
    else {
      Pg-Cmd "pg_ctl" @("-D", $PgData, "-l", $Log, "-o", "-p $Port -h $Host", "start") | Out-Null
      Start-Sleep -Seconds 3
      Pg-Cmd "pg_isready" @("-h", $Host, "-p", $Port, "-U", $User)
    }
  }
  "stop" {
    Pg-Cmd "pg_ctl" @("-D", $PgData, "stop")
  }
  "status" {
    Pg-Cmd "pg_isready" @("-h", $Host, "-p", $Port, "-U", $User)
  }
}