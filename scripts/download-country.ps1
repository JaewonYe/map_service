param([Parameter(Mandatory = $true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
# Partial output is promoted by manage.mjs only after this command succeeds.
Invoke-WebRequest -UseBasicParsing -Uri 'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf' -OutFile $OutputPath -ErrorAction Stop
