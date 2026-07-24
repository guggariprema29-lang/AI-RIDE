# Start a local static file server for the frontend.
# Run this from PowerShell inside the frontend folder.

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)
python -m http.server 8080 --bind 127.0.0.1
