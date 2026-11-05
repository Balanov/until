"""Package the published live trials without databases or synthetic measurements."""
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "app" / "public"
OUTPUT = PUBLIC / "until-proof.zip"
comparison = json.loads((PUBLIC / "comparison.json").read_text(encoding="utf-8"))
assert comparison["format"] == "until-comparison/v1"
assert len(comparison["trials"]) == 48

files: dict[str, bytes] = {
    "README.md": b"""# UNTIL 0.2.0 live comparison\n\n48 real local-model trials: two software versions, selection and held-out suites, UNTIL and single-prompt arms, three repetitions per task.\n\nThe held-out UNTIL result changed from 0/6 to 6/6 independently accepted JSON artifacts. The current single prompt also accepted 6/6 and was 3.281x faster, using one model call instead of three.\n\nThese are bounded structured-deliverable fixtures, not production code, competitor rankings, business outcomes or a team-replacement study. Local provider charges exclude hardware and electricity. Both current arms received strict JSON schemas; the improvement cannot be attributed to the outer loop alone.\n\n`comparison.json` contains all summaries and trial metadata. Each trial includes the engine result and the raw HTTP response content. `manifest.json` records SHA-256 for every other file.\n\nRe-run with Node.js 24+ and the same local Ollama model using `npm run compare -- --label LABEL --system until|direct --suite selection|heldout --repeat 3`, then `npm run compare:report`. Do not mix new runs with the published historical labels.\n""",
    "LICENSE": (ROOT / "LICENSE").read_bytes(),
    "comparison.json": (PUBLIC / "comparison.json").read_bytes(),
    "protocol.json": (ROOT / "benchmarks" / "live-protocol.json").read_bytes(),
    "tasks.json": (ROOT / "benchmarks" / "live-tasks.json").read_bytes(),
}

for trial in comparison["trials"]:
    relative = PurePosixPath(trial["trace"])
    assert not relative.is_absolute() and ".." not in relative.parts
    directory = PUBLIC.joinpath(*relative.parts)
    result_bytes = (directory / "result.json").read_bytes()
    result = json.loads(result_bytes)
    responses = (directory / "responses.jsonl").read_bytes()
    assert result["accepted"] == trial["accepted"]
    assert result["system"] == trial["system"]
    assert sha256(responses).hexdigest() == trial["rawResponsesSha256"]
    assert len([line for line in responses.splitlines() if line.strip()]) == trial["modelCalls"]
    if trial["system"] == "until" and trial["accepted"]:
        assert result["audit"]["valid"] is True
        assert sha256(result["artifact"]["content"].encode()).hexdigest() == result["artifact"]["hash"]
        assert result["release"]["receipt"]["hash"] == result["artifact"]["hash"]
    files[f"trials/{relative.as_posix()}/result.json"] = result_bytes
    files[f"trials/{relative.as_posix()}/responses.jsonl"] = responses

manifest = {
    "format": "until-proof-bundle/v1",
    "trialCount": len(comparison["trials"]),
    "files": {name: {"bytes": len(content), "sha256": sha256(content).hexdigest()} for name, content in sorted(files.items())},
}
files["manifest.json"] = json.dumps(manifest, indent=2, ensure_ascii=False).encode() + b"\n"
with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, content in sorted(files.items()):
        info = zipfile.ZipInfo(f"until-proof/{name}", date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, content)
with zipfile.ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
    recorded = json.loads(archive.read("until-proof/manifest.json"))
    for name, expected in recorded["files"].items():
        content = archive.read(f"until-proof/{name}")
        assert len(content) == expected["bytes"]
        assert sha256(content).hexdigest() == expected["sha256"]
print(json.dumps({"output": str(OUTPUT), "trials": 48, "files": len(files), "bytes": OUTPUT.stat().st_size, "sha256": sha256(OUTPUT.read_bytes()).hexdigest(), "readBackVerified": True}, indent=2))
