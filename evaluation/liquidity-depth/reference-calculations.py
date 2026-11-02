#!/usr/bin/env python3
"""Transparent arithmetic for numeric fixtures; not an evaluator or human review."""
import hashlib
import json
from decimal import Decimal as D, ROUND_FLOOR, ROUND_CEILING
from pathlib import Path

buy_cost = D(100) * 2 + D(150) * D("2.10")
sell_proceeds = D(80) * 5 + D(20) * D("4.50")
cp_output = D(1000) * 10000 / 110000
fee_output = D(1000) * (D(10000) * D("0.997")) / (100000 + D(10000) * D("0.997"))
budget_output = D(50) + D(500) / 11
results = {
    "buy-vwap": {"cost_usdc": buy_cost, "vwap": buy_cost / 250, "impact_percent": (buy_cost / 250 / 2 - 1) * 100},
    "sell-side": {"proceeds_usdc": sell_proceeds, "vwap": sell_proceeds / 100, "deterioration_percent": (1 - sell_proceeds / 100 / 5) * 100},
    "spread-midpoint": {"spread_bps": (D(101) - 99) / ((D(101) + 99) / 2) * 10000},
    "insufficient-book": {"visible_units": 10 + 5, "visible_cost_usdc": 10 * 100 + 5 * 110, "unpriced_units": 20 - 15},
    "constant-product": {"output": cp_output, "gross_average": D(10000) / cp_output, "average_impact_percent": (D(10000) / cp_output / 100 - 1) * 100},
    "base-units": {"output": D(250000000) / 10**6, "average": D(1000) / (D(250000000) / 10**6)},
    "quote-freshness": {"age_seconds": 12 * 60, "policy_limit_seconds": 300},
    "fee-accounting": {"swap_average": D(202) / 100, "economic_cost": 202 + 3},
    "inclusive-band": {"cutoff": D(10) * D("1.01"), "band_usdc": 40 * D(10) + 20 * D("10.10"), "all_asks_usdc": 40 * D(10) + 20 * D("10.10") + 100 * D("10.20")},
    "constant-product-fee": {"output": fee_output, "gross_average": D(10000) / fee_output},
    "minimum-output-tolerance": {"output_reduction_percent": (D(200) - 198) / 200 * 100},
    "recipient-transfer-tax": {"net_output": 500 * D("0.98"), "net_average": D(1000) / (500 * D("0.98"))},
    "quote-currency-usd": {"usdc_price": D(1000) / 500, "usd_price": D(1000) * D("0.97") / 500},
    "multihop-final-output": {"output": 160, "average": D(1000) / 160},
    "realized-versus-minimum": {"average": D(1000) / 980, "impact_percent": (D(1000) / 980 - 1) * 100},
    "quote-budget-fill": {"output": budget_output, "average": D(1000) / budget_output},
    "untrusted-pool-metadata": {"quoted_size_average": D(100) / 50},
}
root = Path(__file__).resolve().parent
cases = json.loads((root / "cases.json").read_text())
by_id = {item["id"]: item for item in cases}
def calculate(expression):
    if isinstance(expression, str):
        result = D(expression)
        assert result.is_finite(), "Reference inputs must be finite"
        return result
    assert isinstance(expression, list) and expression, "Malformed arithmetic expression"
    operation, *args = expression
    values = [calculate(arg) for arg in args]
    if operation in ("floor", "ceil"):
        assert len(values) == 1
        return values[0].to_integral_value(rounding=ROUND_FLOOR if operation == "floor" else ROUND_CEILING)
    assert len(values) == 2
    a, b = values
    if operation == "add": return a + b
    if operation == "sub": return a - b
    if operation == "mul": return a * b
    if operation == "div": return a / b
    raise AssertionError(f"Unsupported arithmetic operation: {operation}")

for item in cases:
    if "calculations" not in item:
        continue
    assert item["id"] not in results, "Duplicate reference calculation"
    results[item["id"]] = {}
    for metric, reference in item["calculations"].items():
        value = calculate(reference["expression"])
        assert abs(value - D(reference["expected"])) <= D(reference["tolerance"]), f"{item['id']}: {metric} reference differs"
        results[item["id"]][metric] = value
assert set(results) <= set(by_id), "A calculated fixture is missing from cases.json"
rows = [json.loads(line) for line in (root / "pairs.jsonl").read_text().splitlines()]
assert len(rows) == len(cases), "Regenerate pairs.jsonl first"
assert all(all(row[k] == case[k] for k in ("prompt", "chosen", "rejected")) for row, case in zip(rows, cases))
print(json.dumps({
    "dataset_sha256": hashlib.sha256((root / "pairs.jsonl").read_bytes()).hexdigest(),
    "scope": "Arithmetic for stated synthetic assumptions. Compare these outputs to the prompts and labels during review; this is not automatic semantic verification.",
    "calculated_cases": len(results),
    "results": results,
    "requires_nonarithmetic_review": [item["id"] for item in cases if item["id"] not in results],
}, indent=2, default=str))
