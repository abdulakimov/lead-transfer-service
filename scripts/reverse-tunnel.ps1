$ErrorActionPreference = "Stop"

npx wait-on tcp:127.0.0.1:3000 tcp:127.0.0.1:3001

while ($true) {
  ssh -NT `
    -o ServerAliveInterval=30 `
    -o ServerAliveCountMax=3 `
    -R 127.0.0.1:18080:127.0.0.1:3000 `
    -R 127.0.0.1:18081:127.0.0.1:3001 `
    zakovat-vps

  Start-Sleep -Seconds 2
}
