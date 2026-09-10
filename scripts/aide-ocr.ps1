# OCR d'un dossier d'images via le moteur integre a Windows.
# Sortie : un JSON par image, { mots: [ { texte, x, y, w, h } ] }
param(
    [Parameter(Mandatory = $true)][string]$InputDir,
    [Parameter(Mandatory = $true)][string]$OutFile
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

# Le francais d'abord : les noms portent des accents.
$lang = [Windows.Globalization.Language]::new('fr-FR')
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if ($null -eq $engine) { throw 'aucun moteur OCR' }

$all = @{}
$files = Get-ChildItem -Path $InputDir -Include *.jpg, *.png -File -Recurse
$i = 0
foreach ($f in $files) {
    $i++
    Write-Host ("[{0}/{1}] {2}" -f $i, $files.Count, $f.Name)
    try {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])
        $stream = Await ($file.OpenAsync('Read')) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

        $words = New-Object System.Collections.ArrayList
        foreach ($line in $result.Lines) {
            foreach ($w in $line.Words) {
                $r = $w.BoundingRect
                [void]$words.Add([ordered]@{
                    texte = $w.Text
                    ligne = $line.Text
                    x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height
                })
            }
        }
        $all[$f.Name] = @{
            largeur = [int]$decoder.PixelWidth
            hauteur = [int]$decoder.PixelHeight
            mots    = $words
        }
        $stream.Dispose()
    } catch {
        Write-Host ("  echec: " + $_.Exception.Message)
        $all[$f.Name] = @{ erreur = $_.Exception.Message }
    }
}

$all | ConvertTo-Json -Depth 8 -Compress | Out-File -FilePath $OutFile -Encoding utf8
Write-Host ("Ecrit: " + $OutFile)
