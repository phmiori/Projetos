# Converte para WAV de verdade os sons das pastas "sounds" que são outro formato (MP3, M4A, MP4...)
# com a extensão só trocada para .wav. Usa o conversor do próprio Windows; não precisa instalar nada.
# Uso: dois cliques em converter-sons.bat.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime] | Out-Null

$work = Join-Path $env:TEMP "mundo-de-blocos-sons"
New-Item -ItemType Directory $work -Force | Out-Null
$folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($work)) ([Windows.Storage.StorageFolder])

$pastas = @("sounds", "dist\MundoDeBlocos\sounds") | Where-Object { Test-Path $_ }
$convertidos = 0; $falhas = 0
foreach ($pasta in $pastas) {
    foreach ($f in Get-ChildItem "$pasta\*.wav") {
        $head = [byte[]]::new(4)
        $s = [System.IO.File]::OpenRead($f.FullName); [void]$s.Read($head, 0, 4); $s.Close()
        if ([System.Text.Encoding]::ASCII.GetString($head) -eq "RIFF") { continue } # já é WAV

        Write-Host "Convertendo $($f.FullName)..."
        try {
            Copy-Item $f.FullName "$work\entrada.bin" -Force
            $in = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync("$work\entrada.bin")) ([Windows.Storage.StorageFile])
            $out = Await ($folder.CreateFileAsync("saida.wav", [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
            $profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateWav([Windows.Media.MediaProperties.AudioEncodingQuality]::High)
            $profile.Video = $null
            $prep = Await ((New-Object Windows.Media.Transcoding.MediaTranscoder).PrepareFileTranscodeAsync($in, $out, $profile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
            if (-not $prep.CanTranscode) { throw "o Windows não conseguiu ler esse arquivo ($($prep.FailureReason))" }
            $task = $asTaskAction.MakeGenericMethod([double]).Invoke($null, @($prep.TranscodeAsync()))
            $task.Wait(-1) | Out-Null
            if ((Get-Item "$work\saida.wav").Length -lt 100) { throw "a conversão saiu vazia" }
            Copy-Item "$work\saida.wav" $f.FullName -Force
            $convertidos++
        } catch {
            Write-Host "  Falhou: $_" -ForegroundColor Red
            $falhas++
        }
    }
}
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
if ($convertidos -eq 0 -and $falhas -eq 0) { Write-Host "Todos os sons já estão em WAV. Nada a fazer." }
else { Write-Host "Pronto: $convertidos convertido(s), $falhas com falha. No jogo, use Configurações > Recarregar sons." }
