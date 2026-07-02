$sw = [System.Diagnostics.Stopwatch]::StartNew()
$headers = @{ 'Authorization' = 'Bearer key3' }
$body = @{ model = 'qwen3.7-plus'; messages = @(@{ role = 'user'; content = 'dang co nhung lop hoc nao/' }); max_tokens = 500 } | ConvertTo-Json
$result = Invoke-RestMethod -Uri 'http://localhost:3002/v1/chat/completions' -Method POST -Body $body -ContentType 'application/json' -Headers $headers -TimeoutSec 180
$sw.Stop()
Write-Host "LLM took: $($sw.ElapsedMilliseconds)ms"
Write-Host ($result | ConvertTo-Json -Depth 5)
