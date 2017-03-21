# optimize all pngs recursively from the root directory

Param(
	[string]$Root
)

$files = Get-ChildItem $Root -Recurse -Filter *.png
foreach ($f in $files) {
    & optipng -o9 --strip all $f.FullName
}