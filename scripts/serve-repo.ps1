# Delar Gulnux-repot med en VirtualBox-VM. Med NAT når gästen värdens localhost på 10.0.2.2.
#   powershell -ExecutionPolicy Bypass -File scripts\serve-repo.ps1
# Hämta sedan i VM:en med:  curl -s http://10.0.2.2:8000 | tar xz
param([int]$Port = 8000)
$ErrorActionPreference = "Stop"

$repo = Split-Path $PSScriptRoot -Parent
$tgz = Join-Path $env:TEMP "gulnux.tgz"
tar -czf $tgz --exclude .git --exclude result -C (Split-Path $repo -Parent) (Split-Path $repo -Leaf)
if ($LASTEXITCODE) { throw "tar misslyckades" }
$bytes = [IO.File]::ReadAllBytes($tgz)

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "Kör i VM:en:  curl -s http://10.0.2.2:$Port | tar xz"
Write-Host "Avsluta med Ctrl+C"
try {
  while ($true) {
    if (-not $listener.Pending()) { Start-Sleep -Milliseconds 200; continue }
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $request = New-Object byte[] 4096
    [void]$stream.Read($request, 0, $request.Length)
    $header = [Text.Encoding]::ASCII.GetBytes(
      "HTTP/1.0 200 OK`r`nContent-Type: application/gzip`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n")
    $stream.Write($header, 0, $header.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $client.Close()
    Write-Host "Skickade gulnux.tgz ($($bytes.Length) byte)"
  }
} finally {
  $listener.Stop()
}
