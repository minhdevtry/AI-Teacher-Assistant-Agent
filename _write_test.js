$sw = [System.Diagnostics.Stopwatch]::StartNew()
$body = @{ model = 'qwen3.7-plus'; messages = @(@{ role = 'user'; content = 'Xin chao' }); max_tokens = 100 } | ConvertTo-Json
$result = Invoke-RestMethod -Uri 'http://localhost:3002/v1/chat/completions' -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 120
$sw.Stop()
Write-Host "LLM took: $($sw.ElapsedMilliseconds)ms"
Write-Host ($result | ConvertTo-Json -Depth 5)
