try {
    $r = Invoke-WebRequest -Uri http://localhost:3000/api/docs -Method GET -TimeoutSec 10 -UseBasicParsing
    Write-Output "SUCCESS - StatusCode: $($r.StatusCode)"
    Write-Output "Content-Length: $($r.Content.Length)"
} catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if ($resp) {
        Write-Output "HTTP ERROR - StatusCode: $($resp.StatusCode) ($([int]$resp.StatusCode))"
    } else {
        Write-Output "WEB ERROR: $($_.Exception.Message)"
    }
} catch {
    Write-Output "ERROR: $($_.Exception.GetType().FullName) - $($_.Exception.Message)"
}
