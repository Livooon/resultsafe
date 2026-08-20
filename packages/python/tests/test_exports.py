import json
from pathlib import Path

import resultsafe


def test_canonical_root_exports_are_exact():
    catalog_path = Path(__file__).resolve().parents[3] / "platform/staging/resultsafe-core-v001/PROJECTION-CATALOG.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    projection = next(
        item for item in catalog["payload"]["items"]
        if item.get("target_key") == "python" and item.get("projection_kind") == "LANGUAGE"
    )
    model_exports = {
        export
        for binding in projection["model_bindings"]
        for export in binding["exports"]
    }
    expected = {
        "NOTHING", "Err", "Failure", "FailureClassification", "FailureJsonValue", "Ok", "Option", "Result", "ResultData", "ResultExtractionError", "ResultLike", "Some",
        "and_then", "err", "expect", "expect_err", "flatten", "is_err", "is_err_and",
        "is_ok", "is_ok_and", "map", "map_err", "match", "ok", "or_else", "tap",
        "tap_err", "to_result_data", "transpose", "unwrap", "unwrap_err", "unwrap_or", "unwrap_or_else",
        "from_result_data", "hydrate_result", "to_failure_data",
    }
    expected.update(model_exports)
    assert set(resultsafe.__all__) == expected
    assert not hasattr(resultsafe, "inspect")
    assert not hasattr(resultsafe, "inspect_err")
