#!/usr/bin/env python3
"""Run the reviewed, hash-pinned upstream data gate. No model or network calls."""
import argparse
import hashlib
import importlib.util
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

COMMIT = "5fa5d68bbcf76aaa2093c5d0578f53462bc0e36e"
SOURCE_SHA256 = "537174609914de0a23a72c488fc508bad63cf4982949019e57540864c9c3b3c3"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--trainer", type=Path, required=True, help="Pinned upstream wide_runtime/train_adapter.py")
parser.add_argument("--out", type=Path, help="Save the audit report")
args = parser.parse_args()
actual = hashlib.sha256(args.trainer.read_bytes()).hexdigest()
if actual != SOURCE_SHA256:
    parser.error("Upstream source hash differs from the reviewed version; review a new version explicitly")

spec = importlib.util.spec_from_file_location("arcadian_pinned_trainer", args.trainer)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
pairs_path = Path(__file__).resolve().parent / "pairs.jsonl"
body = pairs_path.read_bytes()
rows = module.read_pairs_jsonl(pairs_path)
report = {
    "checked_at": datetime.now(timezone.utc).isoformat(),
    "intent_id": "LIQUIDITY_DEPTH_VERIFY_GENERAL",
    "dataset_sha256": hashlib.sha256(body).hexdigest(),
    "source_commit": COMMIT,
    "source_url": f"https://github.com/telegraphprotocol/telegraph-wasm-baseline/blob/{COMMIT}/wide_runtime/train_adapter.py",
    "source_sha256": actual,
    "python_version": platform.python_version(),
    "numpy_version": module.np.__version__,
    "gate": module.gate_dataset(rows, module.Hyperparams()),
    "scope": "Official dataset gate only. No training, semantic validation, hidden test or network eligibility check.",
}
rendered = json.dumps(report, indent=2, allow_nan=False) + "\n"
if args.out:
    args.out.write_text(rendered, encoding="utf-8")
print(rendered, end="")
sys.exit(0 if report["gate"]["ok"] else 1)
