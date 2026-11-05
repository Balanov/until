from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
source = root / "app" / "dist"
target = root / "until-site.zip"
if not source.is_dir():
    raise SystemExit("app/dist is missing; run npm run site:build first")
with ZipFile(target, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(source.rglob("*")):
        if file.is_file():
            archive.write(file, file.relative_to(source).as_posix())
print(f"{target} {target.stat().st_size} bytes")
