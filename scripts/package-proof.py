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
repository = json.loads((PUBLIC / "fixtures" / "repository-run.json").read_text(encoding="utf-8"))
assert repository["initial"]["completed"] == 6 and repository["initial"]["failed"] == 0
assert repository["beforeTest"]["status"] == 1
assert repository["afterTest"]["status"] == 0 and repository["afterTest"]["output"] == "ACTIVATION_TEST_OK"
assert repository["release"]["receipt"]["workspace"]["files"] == 2
proof = json.loads((PUBLIC / "proof.json").read_text(encoding="utf-8"))
assert proof["passed"] == proof["total"] == 17
repair = json.loads((PUBLIC / "fixtures" / "repair-run.json").read_text(encoding="utf-8"))
assert repair["initial"]["completed"] == 6 and repair["initial"]["failed"] == 0
assert repair["testBefore"]["status"] == 1
assert repair["testAfter"]["status"] == 0 and repair["testAfter"]["output"] == "ACTIVATION_TEST_OK"
assert repair["artifact"]["repair"]["attempts"] == 2
assert repair["artifact"]["repair"]["trail"][0]["passed"] is False
assert repair["artifact"]["repair"]["trail"][1]["passed"] is True

agent_path = PUBLIC / "fixtures" / "agent-run.json"
agent = json.loads(agent_path.read_text(encoding="utf-8")) if agent_path.exists() else None
if agent is not None:
    assert agent["audit"]["valid"] is True, "the agent run must leave an intact audit chain"
    # Failed attempts are what the repair loop and the rework cycle are for, so a
    # published run may contain them. Two things must never happen: a release
    # published without an independent verdict, and a failed attempt that left
    # changes behind.
    if agent.get("release"):
        assert agent["verdict"] and agent["verdict"]["passed"] >= 1, "a published release must carry an independent verdict"
    if agent.get("repair"):
        assert agent["repair"]["workspaceRestored"] is True, "a failed attempt must leave the workspace exactly as it was"

files: dict[str, bytes] = {
    "README.md": b"""# UNTIL 0.3.0 proof bundle\n\n## Repair cycle: a failing test the builder sees and fixes\n\n`repair-run.json` records a real engine run of the repair loop. The project's own Node test fails before the change (exit 1). The first attempt changes the code but the test still fails; the engine hands the failing output back to the builder, which tries again. The second attempt makes the test pass (exit 0 / ACTIVATION_TEST_OK), a separate role issues an independent verdict and the changed files are packaged into an immutable local release candidate. The per-attempt trail is included. The harness is deterministic on purpose: this proves the control plane and the repair loop, not model intelligence.\n\n## Repository product cycle\n\n`repository-run.json` records a deterministic control-plane run: six role-separated tasks change `src/activation.js`; the real Node regression test moves from exit 1 to exit 0 / ACTIVATION_TEST_OK; six independent acceptance checks pass; two explicitly allowed files are packaged into an immutable local release candidate. This is not production deployment, an LLM-quality test or a business-outcome claim.\n\n`proof.json` contains 17 deterministic proof checks and `tests.json` contains the complete unit/integration test report.\n\n## Same-model comparison\n\n48 real local-model trials: two software versions, selection and held-out suites, UNTIL and single-prompt arms, three repetitions per task. The held-out UNTIL result changed from 0/6 to 6/6 independently accepted JSON artifacts. The current single prompt also accepted 6/6 and was 3.281x faster, using one model call instead of three.\n\nThese are bounded structured-deliverable fixtures, not production code, competitor rankings, business outcomes or a team-replacement study. Local provider charges exclude hardware and electricity. The direct arm accepted 6/6 as well, so the improvement cannot be attributed to the outer loop alone.\n\nCorrection (0.3): the schema generator used for that comparison had a defect in how `required` was accumulated for nested acceptance paths, so the schema sent to the provider was malformed, and the response was not validated locally against it. The acceptance verdicts were computed from the parsed content, so the counts above stand, but the "strict JSON Schema" wording was overstated. The defect is fixed, local schema validation is now mandatory, and this bundle remains the historical record it was.\n\n`comparison.json` contains all summaries and trial metadata. Each trial includes the engine result and raw HTTP response content. `manifest.json` records SHA-256 for every other file.\n\nRe-run with Node.js 24+ and the same local Ollama model using `npm run compare -- --label LABEL --system until|direct --suite selection|heldout --repeat 3`, then `npm run compare:report`. Do not mix new runs with the published historical labels.\n""",
    "LICENSE": (ROOT / "LICENSE").read_bytes(),
    "repair-run.json": (PUBLIC / "fixtures" / "repair-run.json").read_bytes(),
    "repository-run.json": (PUBLIC / "fixtures" / "repository-run.json").read_bytes(),
    "proof.json": (PUBLIC / "proof.json").read_bytes(),
    "tests.json": (PUBLIC / "tests.json").read_bytes(),
    "comparison.json": (PUBLIC / "comparison.json").read_bytes(),
    "protocol.json": (ROOT / "benchmarks" / "live-protocol.json").read_bytes(),
    "tasks.json": (ROOT / "benchmarks" / "live-tasks.json").read_bytes(),
}
if agent is not None:
    files["agent-run.json"] = agent_path.read_bytes()

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
