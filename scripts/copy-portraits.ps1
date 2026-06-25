<#
.SYNOPSIS
    Copy family photos/videos from a source folder into media/portraits,
    renaming each copy to the person's catalog id.

.DESCRIPTION
    Reads a media map (JSON) whose `media_catalog[]` entries each carry an `id`,
    a `photos[]` list and a `video[]` list of file names. For every entry the
    script copies the referenced files out of -Input into -Output, renaming the
    copy to match the id:

        first photo  -> <id><ext>            (e.g. p-0021.jpg) — the portrait
        extra photos -> <id>-2<ext>, <id>-3<ext>, ...
        first video  -> <id><ext>            (e.g. p-0021.mp4)
        extra videos -> <id>-2<ext>, ...

    Photos and videos are numbered independently, so a single photo + single
    video both land on the bare id (different extensions, no collision).

    Source files are only ever READ. The script never renames, moves or alters
    anything inside -Input.

    File names in the map may omit their extension; the script resolves the
    real file on disk (matching `<name>.*`) and preserves the actual extension.

    When -FamilyJson is given, the script then back-fills the person records:
    for each catalog id, if that person is missing a `portrait` (or
    `portraitVideo`), it inserts the bare-id file name (e.g. "p-0026.jpg" /
    "p-0026.mp4"). Existing values are never overwritten. The edit is a
    minimal in-place text insertion — the rest of family.json (formatting,
    line endings, Cyrillic text) is left byte-for-byte unchanged.

    With -Cleanup, every existing `portrait` / `portraitVideo` field is first
    stripped from ALL people (not just the catalog's) before back-filling, so
    the resulting family.json carries only the media described by the current
    map. Like the back-fill, the strip is a minimal in-place text edit; the
    rest of the file is left untouched.

.PARAMETER Input
    Source folder holding the original media files.

.PARAMETER Output
    Destination folder for the renamed copies. Created if it does not exist.

.PARAMETER Map
    Path to the JSON media map (the `media_catalog` document).

.PARAMETER FamilyJson
    Optional path to family.json. When supplied, missing `portrait` /
    `portraitVideo` fields are back-filled for the catalog's people.

.PARAMETER Cleanup
    Before back-filling, strip every existing `portrait` / `portraitVideo`
    field from all people in family.json, so the file ends up with only the
    media described by the current map. Requires -FamilyJson.

.PARAMETER Force
    Overwrite existing destination files. Without it, existing files are skipped.

.PARAMETER WhatIf
    Show what would be copied / edited without writing anything.

.EXAMPLE
    ./copy-portraits.ps1 `
        -Input  "C:\real photos" `
        -Output "C:\Code\family-tree\media\portraits" `
        -Map    "C:\real photos\photo-map.json"
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Aliased to -Input; the real name avoids PowerShell's $Input automatic variable.
    [Parameter(Mandatory = $true)]
    [Alias('Input')]
    [string] $InputPath,

    [Parameter(Mandatory = $true)]
    [string] $Output,

    [Parameter(Mandatory = $true)]
    [string] $Map,

    [string] $FamilyJson,

    [switch] $Cleanup,

    [switch] $Force
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InputPath -PathType Container)) {
    throw "Source folder not found: $InputPath"
}
if (-not (Test-Path -LiteralPath $Map -PathType Leaf)) {
    throw "Map file not found: $Map"
}
if ($FamilyJson -and -not (Test-Path -LiteralPath $FamilyJson -PathType Leaf)) {
    throw "family.json not found: $FamilyJson"
}
if ($Cleanup -and -not $FamilyJson) {
    throw "-Cleanup requires -FamilyJson (there is nothing to clean without it)."
}

if (-not (Test-Path -LiteralPath $Output -PathType Container)) {
    Write-Host "Creating output folder: $Output"
    New-Item -ItemType Directory -Path $Output -Force | Out-Null
}

$catalog = (Get-Content -LiteralPath $Map -Raw -Encoding UTF8 | ConvertFrom-Json).media_catalog
if (-not $catalog) {
    throw "No 'media_catalog' array found in map: $Map"
}

# Resolve a map entry's file name to an actual file in the source folder.
# Tries the literal name first, then falls back to '<name>.*' (handles names
# stored without an extension). Returns $null if nothing matches.
function Resolve-SourceFile {
    param([string] $Name)

    $literal = Join-Path $InputPath $Name
    if (Test-Path -LiteralPath $literal -PathType Leaf) {
        return Get-Item -LiteralPath $literal
    }

    $found = @(Get-ChildItem -LiteralPath $InputPath -File -Filter "$Name.*" -ErrorAction SilentlyContinue)
    if ($found.Count -ge 1) {
        if ($found.Count -gt 1) {
            Write-Warning "Multiple files match '$Name.*'; using '$($found[0].Name)'."
        }
        return $found[0]
    }

    return $null
}

# Copy one source file to '<id>[-n]<ext>' in the output folder.
function Copy-One {
    param(
        [System.IO.FileInfo] $Source,
        [string]             $Id,
        [int]                $Index   # 1 = bare id, >1 = '-N' suffix
    )

    $suffix = if ($Index -le 1) { '' } else { "-$Index" }
    $destName = "$Id$suffix$($Source.Extension)"
    $destPath = Join-Path $Output $destName

    if ((Test-Path -LiteralPath $destPath) -and -not $Force) {
        Write-Host "  skip (exists): $destName"
        return $false
    }

    if ($PSCmdlet.ShouldProcess($destPath, "Copy '$($Source.Name)'")) {
        Copy-Item -LiteralPath $Source.FullName -Destination $destPath -Force
        Write-Host "  $($Source.Name)  ->  $destName"
        return $true
    }
    return $false
}

$copied = 0
$skipped = 0
$missing = @()

# Bare-id (index 1) destination file names per id — these are what family.json
# references as the portrait / portraitVideo. Captured whether the file was
# freshly copied or already present, so back-fill works on re-runs too.
$portraitFor = @{}
$videoFor = @{}

foreach ($entry in $catalog) {
    $id = $entry.id
    if ([string]::IsNullOrWhiteSpace($id)) {
        Write-Warning "Entry without an 'id' skipped."
        continue
    }

    Write-Host "$id ($($entry.full_name))"

    # Photos and videos are numbered independently.
    foreach ($group in @(
        @{ Files = @($entry.photos); Kind = 'photo' },
        @{ Files = @($entry.video);  Kind = 'video' }
    )) {
        $n = 0
        foreach ($name in $group.Files) {
            if ([string]::IsNullOrWhiteSpace($name)) { continue }
            $n++

            $src = Resolve-SourceFile -Name $name
            if ($null -eq $src) {
                Write-Warning "  missing $($group.Kind): $name"
                $missing += [pscustomobject]@{ Id = $id; Kind = $group.Kind; Name = $name }
                continue
            }

            if ($n -eq 1) {
                $bareName = "$id$($src.Extension)"
                if ($group.Kind -eq 'photo') { $portraitFor[$id] = $bareName }
                else { $videoFor[$id] = $bareName }
            }

            if (Copy-One -Source $src -Id $id -Index $n) { $copied++ } else { $skipped++ }
        }
    }
}

Write-Host ""
Write-Host "Done. Copied: $copied  Skipped: $skipped  Missing: $($missing.Count)"
if ($missing.Count -gt 0) {
    Write-Host "Missing source files:"
    $missing | Format-Table -AutoSize | Out-String | Write-Host
}

if (-not $FamilyJson) {
    return
}

# --- Back-fill family.json portrait / portraitVideo --------------------------
Write-Host ""
Write-Host "Back-filling portraits in $FamilyJson"

$famPath = (Resolve-Path -LiteralPath $FamilyJson).Path
$famText = [System.IO.File]::ReadAllText($famPath)
$eol = if ($famText -match "`r`n") { "`r`n" } else { "`n" }

# --- Optional cleanup: strip existing portrait fields from ALL people --------
# Runs before the back-fill so family.json ends up holding only the media the
# current map describes. Like the back-fill, this is a minimal text edit (the
# values are plain file names, never containing quotes), so the rest of the
# file — formatting, line endings, Cyrillic text — stays byte-for-byte intact.
#
# Assumptions this text-only approach relies on (true for the actual data):
#   * No OTHER field's value is a property-shaped string on its own line, e.g.
#     a biography line reading exactly `"portrait": "x.jpg"`. Such a line would
#     be matched and stripped; person bios never contain that.
#   * `portrait`/`portraitVideo` is never the SOLE property of an object (no
#     comma on either side) — every person also has at least `id` and `name`,
#     so one of the two comma forms below always applies.
$removed = 0
if ($Cleanup) {
    # One evaluator strips the match and counts it, so each form is a single
    # compiled pass over the text (no separate count-then-replace scan). The
    # strip is in-memory only; what actually happened is reported once at the
    # end, after ShouldProcess resolves, so -WhatIf / declined -Confirm stay
    # honest.
    $strip = { param($m) $script:removed++; '' }
    foreach ($prop in @('portrait', 'portraitVideo')) {
        # Trailing-comma form (the common case — property has siblings after it):
        #   "portrait": "p-0021.jpg",  ->  (whole line removed)
        $trailing = "(?m)^[ \t]*`"$prop`"[ \t]*:[ \t]*`"[^`"]*`"[ \t]*,[ \t]*\r?\n"
        # Last-property form (no trailing comma): drop the preceding comma too so
        # the object stays valid.
        #   ... ,\n  "portrait": "p-0021.jpg"  ->  (comma + property removed)
        $last = ",\r?\n[ \t]*`"$prop`"[ \t]*:[ \t]*`"[^`"]*`""

        $famText = [regex]::Replace($famText, $trailing, $strip)
        $famText = [regex]::Replace($famText, $last, $strip)
    }
}

# Parse to find which people are actually missing each field (robust against
# property order); the text edit below is what preserves formatting. After a
# -Cleanup pass the fields are already gone, so the back-fill repopulates them.
$people = ($famText | ConvertFrom-Json).people
$hasPortrait = @{}
$hasVideo = @{}
foreach ($p in $people) {
    $hasPortrait[$p.id] = -not [string]::IsNullOrWhiteSpace($p.portrait)
    $hasVideo[$p.id] = -not [string]::IsNullOrWhiteSpace($p.portraitVideo)
}

$inserted = 0
foreach ($id in @($portraitFor.Keys) + @($videoFor.Keys) | Select-Object -Unique) {
    if (-not $hasPortrait.ContainsKey($id)) {
        Write-Warning "  no person '$id' in family.json — skipped"
        continue
    }

    $newProps = @()
    if ($portraitFor.ContainsKey($id) -and -not $hasPortrait[$id]) {
        $newProps += @{ Key = 'portrait'; Value = $portraitFor[$id] }
    }
    if ($videoFor.ContainsKey($id) -and -not $hasVideo[$id]) {
        $newProps += @{ Key = 'portraitVideo'; Value = $videoFor[$id] }
    }
    if ($newProps.Count -eq 0) { continue }

    # Insert the new property lines right after this person's "id" line,
    # reusing its indentation. The id line always ends with a comma and is
    # followed by more properties, so a trailing comma stays valid.
    $pattern = "(?m)^(?<indent>[ \t]*)`"id`":[ \t]*`"$([regex]::Escape($id))`"[ \t]*,?[ \t]*\r?\n"
    $replaced = $false
    $famText = [regex]::Replace($famText, $pattern, {
            param($m)
            $script:replaced = $true
            $indent = $m.Groups['indent'].Value
            $block = ($newProps | ForEach-Object { "$indent`"$($_.Key)`": `"$($_.Value)`"," }) -join $eol
            return $m.Value + $block + $eol
        }, 1)

    if (-not $replaced) {
        Write-Warning "  could not locate the `"id`" line for '$id' — skipped"
        continue
    }

    foreach ($np in $newProps) {
        Write-Host "  $id += $($np.Key): $($np.Value)"
    }
    $inserted += $newProps.Count
}

# Both the cleanup strip and the back-fill mutate $famText in memory; the file
# is written once if either changed something.
$changes = $inserted + $removed
$summary = "removed $removed, inserted $inserted field(s)"

if ($changes -eq 0) {
    Write-Host "No family.json changes needed."
}
elseif ($PSCmdlet.ShouldProcess($famPath, "Update portrait fields ($summary)")) {
    [System.IO.File]::WriteAllText($famPath, $famText, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "Updated family.json ($summary)."
}
else {
    Write-Host "What if: would update family.json ($summary)."
}
