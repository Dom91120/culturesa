# Renomme RésaGo -> CultuRézo et resago -> culturezo dans tous les fichiers texte
# du projet. À exécuter UNE FOIS après la copie depuis resago.
#
# Usage :
#   .\scripts\rename_to_culturezo.ps1            # dry-run : affiche ce qui changerait
#   .\scripts\rename_to_culturezo.ps1 -Apply     # applique réellement les modifs
#
# Encodage : lecture et écriture en UTF-8 sans BOM (pour préserver "é" dans CultuRézo).

param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

# Racine = parent du dossier du script (le projet culturezo)
$root = Split-Path -Parent $PSScriptRoot
Write-Host "Racine du projet : $root"

# Extensions de fichiers texte à traiter
$exts = @('.php','.sql','.md','.js','.css','.html','.htm','.json','.txt','.conf','.example')
# Fichiers spéciaux (sans extension classique)
$specialNames = @('.htaccess','.gitignore')

# Patterns de remplacement (ordre = important : le plus spécifique d'abord)
# Note : on construit les chaînes accentuées avec [char]0xE9 ('é') car Windows PowerShell 5.1
# lit les .ps1 en codepage local (CP1252) si le fichier n'a pas de BOM UTF-8. Sans cette
# astuce, 'RésaGo' littéral dans le script devient 'RÃ©saGo' à l'exécution et ne match rien.
$eAcute = [char]0xE9
$patterns = @(
    @{ From = "R${eAcute}saGo";    To = "CultuR${eAcute}zo" },
    @{ From = 'resago';            To = 'culturezo' }
)

# Encodage UTF-8 sans BOM (sinon Windows PowerShell 5.1 ajoute un BOM par défaut)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$files = Get-ChildItem -Path $root -Recurse -File | Where-Object {
    ($exts -contains $_.Extension) -or ($specialNames -contains $_.Name)
}

$mode = if ($Apply) { 'APPLY' } else { 'DRY-RUN' }
Write-Host "Mode : $mode"
Write-Host "Fichiers candidats : $($files.Count)"
Write-Host ''

$totalChanges = 0
$modifiedFiles = @()

foreach ($f in $files) {
    $content = [System.IO.File]::ReadAllText($f.FullName, $utf8NoBom)
    $orig = $content
    $fileChanges = 0
    foreach ($p in $patterns) {
        # -creplace = case-sensitive (on ne veut PAS toucher "Resago" ou "RESAGO" hypothétiques)
        $matches = [regex]::Matches($content, [regex]::Escape($p.From))
        if ($matches.Count -gt 0) {
            $fileChanges += $matches.Count
            $content = $content -creplace [regex]::Escape($p.From), $p.To
        }
    }
    if ($content -ne $orig) {
        $rel = $f.FullName.Substring($root.Length + 1)
        Write-Host ("  {0,4} remplacements  {1}" -f $fileChanges, $rel)
        $totalChanges += $fileChanges
        $modifiedFiles += $f.FullName
        if ($Apply) {
            [System.IO.File]::WriteAllText($f.FullName, $content, $utf8NoBom)
        }
    }
}

Write-Host ''
Write-Host "Total : $totalChanges remplacements dans $($modifiedFiles.Count) fichiers"
if (-not $Apply) {
    Write-Host ''
    Write-Host "Aucune modification écrite (dry-run). Relancer avec -Apply pour appliquer."
}
