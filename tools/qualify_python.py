from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
STAGING = ROOT / "platform/staging/resultsafe-core-v001"
EXPECTED_NEGATIVE_DIAGNOSTICS = {
    "negative_callback.py": ['4:27: error: "int" has no attribute "nonexistent"  [attr-defined]'],
    "negative_method_callback.py": [
        '4:26: error: "int" has no attribute "nonexistent"  [attr-defined]',
        '4:26: error: "T" has no attribute "nonexistent"  [attr-defined]',
    ],
    "negative_result.py": ['3:28: error: Incompatible types in assignment (expression has type "Some[int]", variable has type "Ok[int] | Err[str]")  [assignment]'],
    "negative_transpose.py": ['3:11: error: Argument 1 to "transpose" has incompatible type "Ok[int]"; expected "Ok[Some[Never] | _Nothing] | Err[Never]"  [arg-type]'],
    "negative_method_transpose.py": ['3:1: error: Invalid self argument "Ok[int]" to attribute function "transpose" with type "Callable[[Ok[Some[U] | _Nothing]], Some[Ok[U]] | _Nothing]"  [misc]'],
}


def run(*args: str, cwd: Path = ROOT, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    command = [sys.executable, *args]
    print("+", " ".join(command), flush=True)
    return subprocess.run(command, cwd=cwd, env=env, text=True, check=False)


def projection_surface() -> tuple[list[str], list[str], list[str], list[dict[str, str]], str, int, str, int]:
    contract = json.loads((STAGING / "CONTRACT-IR.json").read_text(encoding="utf-8"))
    catalog = json.loads((STAGING / "PROJECTION-CATALOG.json").read_text(encoding="utf-8"))
    operations = contract["payload"]["operations"]
    applicable = {key: operation for key, operation in operations.items() if "python" in operation["projection_applicability"]}
    projection = next(item for item in catalog["payload"]["items"] if item.get("target_key") == "python" and item.get("projection_kind") == "LANGUAGE")
    bindings = projection["operation_bindings"]
    by_operation = {binding["operation_key"]: binding for binding in bindings}
    if len(applicable) != 23 or len(bindings) != 23 or len(by_operation) != 23 or set(by_operation) != set(applicable):
        raise RuntimeError(f"expected exact coverage of 23 Python operations, found {len(applicable)} applicable and {len(bindings)} bindings")
    if projection["contract_ir_ref"] != contract["document_ref"] or projection["contract_ir_revision"] != contract["document_revision"]:
        raise RuntimeError("Python projection is not revision-bound to the current Contract IR")
    for key, operation in applicable.items():
        method_required = operation["surface_contract"]["instance_method"] != "FORBIDDEN"
        if method_required != ("method_name" in by_operation[key]):
            raise RuntimeError(f"{key} has an incorrect Python method binding")
    modules = [binding["module_name"] for binding in bindings]
    methods = [binding["method_name"] for binding in bindings if "method_name" in binding]
    if len(methods) != 21:
        raise RuntimeError(f"expected 21 Python Result methods, found {len(methods)}")
    model_exports = [export for binding in projection["model_bindings"] for export in binding["exports"]]
    matrix = json.loads((STAGING / "CAUSE-EXIT-CONFORMANCE-MATRIX.json").read_text(encoding="utf-8"))
    model_cells = [cell for cell in matrix["payload"]["cells"] if cell["target_key"] == "python"]
    matrix_bindings = {
        "ExitSuccess" if cell["variant"] == "Success" else "ExitFailure" if cell["variant"] == "Failure" else cell["variant"]
        for cell in model_cells
    }
    if len(model_cells) != 8 or not matrix_bindings.issubset(model_exports):
        raise RuntimeError("Python Cause/Exit catalog exports do not cover the eight conformance-matrix variants")
    return modules, methods, model_exports, model_cells, contract["document_ref"], contract["document_revision"], projection["record_ref"], projection["record_revision"]


def logical_wheel_digest(path: Path) -> str:
    """Compare names and bytes, deliberately excluding ZIP timestamps and ordering."""
    import hashlib

    digest = hashlib.sha256()
    with zipfile.ZipFile(path) as archive:
        for name in sorted(archive.namelist()):
            digest.update(name.encode("utf-8") + b"\0")
            digest.update(hashlib.sha256(archive.read(name)).digest())
    return digest.hexdigest()


def main() -> int:
    modules, methods, model_exports, model_cells, contract_ref, contract_revision, projection_ref, projection_revision = projection_surface()
    print(
        f"Qualifying 23 Python module function/constructor surfaces and 21 Result method surfaces; "
        f"Contract IR {contract_ref} revision {contract_revision}; projection {projection_ref} revision {projection_revision}",
        flush=True,
    )
    failures: list[str] = []
    if run("-m", "pytest", "packages/python/tests").returncode != 0:
        failures.append("pytest runtime and laws")
    if run("-m", "mypy", "--strict", "packages/python/src", "packages/python/typing/positive.py").returncode != 0:
        failures.append("strict mypy package and positive fixture")

    for fixture in sorted((ROOT / "packages/python/typing").glob("negative_*.py")):
        command = [sys.executable, "-m", "mypy", "--strict", "--no-pretty", "--show-column-numbers", str(fixture)]
        print("+", " ".join(command), "(expected failure)", flush=True)
        typing_env = os.environ.copy()
        typing_env["MYPYPATH"] = str(ROOT / "packages/python/src")
        completed = subprocess.run(command, cwd=ROOT, env=typing_env, text=True, capture_output=True)
        print(completed.stdout, end="")
        print(completed.stderr, end="", file=sys.stderr)
        actual = [line.split(f"{fixture.name}:", 1)[1] for line in completed.stdout.splitlines() if f"{fixture.name}:" in line and ": error:" in line]
        expected = EXPECTED_NEGATIVE_DIAGNOSTICS[fixture.name]
        if completed.returncode == 0 or actual != expected:
            failures.append(f"negative mypy fixture diagnostic mismatch: {fixture.name}; expected {expected!r}, actual {actual!r}")

    with tempfile.TemporaryDirectory(prefix="resultsafe-python-") as temporary:
        temp = Path(temporary)
        wheel_dirs = [temp / "wheel-a", temp / "wheel-b"]
        build_env = os.environ.copy()
        build_env["SOURCE_DATE_EPOCH"] = "946684800"
        for wheel_dir in wheel_dirs:
            wheel_dir.mkdir()
        builds = [run("-m", "build", "--wheel", "--outdir", str(wheel_dir), env=build_env) for wheel_dir in wheel_dirs]
        wheel_sets = [list(wheel_dir.glob("resultsafe-*.whl")) for wheel_dir in wheel_dirs]
        wheels = wheel_sets[0]
        built_ok = all(item.returncode == 0 for item in builds) and all(len(items) == 1 for items in wheel_sets)
        if not built_ok:
            failures.append(f"isolated wheel build expected one wheel, found {len(wheels)}")
        else:
            if logical_wheel_digest(wheel_sets[0][0]) != logical_wheel_digest(wheel_sets[1][0]):
                failures.append("repeated wheel logical/content reproducibility after timestamp normalization")
            target = temp / "target"
            installed = run("-m", "pip", "install", "--no-deps", "--target", str(target), str(wheels[0]))
            if installed.returncode != 0:
                failures.append("isolated wheel install")
        transport_exports = ("from_result_data", "hydrate_result", "to_result_data")
        exports = tuple(dict.fromkeys((
            "NOTHING", "Err", "Failure", "FailureClassification", "FailureJsonValue", "Ok", "Option", "Result", "ResultData", "ResultExtractionError", "ResultLike", "Some",
            *modules, *transport_exports, "to_failure_data", *model_exports,
        )))
        matrix_variants = tuple(
            (
                cell["model_key"],
                cell["variant"],
                "ExitSuccess" if cell["variant"] == "Success" else "ExitFailure" if cell["variant"] == "Failure" else cell["variant"],
            )
            for cell in model_cells
        )
        smoke = (
            "import importlib.metadata, importlib.resources, resultsafe; "
            "assert resultsafe.unwrap(resultsafe.Ok(7)) == 7; "
            "assert resultsafe.Ok(7).unwrap() == 7; "
            "assert resultsafe.map(resultsafe.Ok(7), str) == resultsafe.Ok(7).map(str); "
            "assert resultsafe.ok(resultsafe.Err('x')) is resultsafe.NOTHING; "
            "assert all(callable(getattr(resultsafe, name)) for name in " + repr(tuple(modules)) + "); "
            "assert all(callable(getattr(resultsafe.Ok(1), name)) for name in " + repr(tuple(methods)) + "); "
            "assert all(callable(getattr(resultsafe.Err('e'), name)) for name in " + repr(tuple(methods)) + "); "
            "assert resultsafe.Ok(resultsafe.Ok(1)).flatten() == resultsafe.Ok(1); "
            "assert resultsafe.Ok(resultsafe.Some(1)).transpose() == resultsafe.Some(resultsafe.Ok(1)); "
            "assert resultsafe.Err('e').expect_err('unused') == 'e'; "
            "assert resultsafe.from_result_data(resultsafe.to_result_data(resultsafe.Ok(1))).unwrap() == 1; "
            "assert resultsafe.result_to_exit(resultsafe.Err('e')) == resultsafe.ExitFailure(resultsafe.Fail('e')); "
            "assert resultsafe.exit_to_cause_result(resultsafe.ExitFailure(resultsafe.Empty())) == resultsafe.Err(resultsafe.Empty()); "
            "assert resultsafe.exit_to_result(resultsafe.ExitFailure(resultsafe.Fail('e')), lambda cause: 'collapsed') == resultsafe.Err('collapsed'); "
            "failure = resultsafe.Failure(schema_version='1.0.0', code='urn:example:installed'); "
            "causes = (resultsafe.Empty(), resultsafe.Fail('e'), resultsafe.Die(failure), resultsafe.Interrupt(failure), resultsafe.Sequential(resultsafe.Empty(), resultsafe.Fail('e')), resultsafe.Parallel(resultsafe.Fail('a'), resultsafe.Fail('b'))); "
            "exits = (resultsafe.ExitSuccess(1), *(resultsafe.ExitFailure(cause) for cause in causes)); "
            "assert all(isinstance(resultsafe.exit_to_cause_result(exit_value), (resultsafe.Ok, resultsafe.Err)) for exit_value in exits); "
            "assert all(isinstance(resultsafe.exit_to_result(exit_value, repr), (resultsafe.Ok, resultsafe.Err)) for exit_value in exits); "
            "assert resultsafe.result_to_exit(resultsafe.Ok(1)) == resultsafe.ExitSuccess(1); "
            f"assert {{binding for _, _, binding in {matrix_variants!r}}} <= set(resultsafe.__all__); "
            f"assert set(resultsafe.__all__) == set({exports!r}); "
            "requirements = importlib.metadata.metadata('resultsafe').get_all('Requires-Dist') or (); "
            "assert all('extra == \"dev\"' in requirement for requirement in requirements); "
            "assert importlib.resources.files('resultsafe').joinpath('py.typed').is_file(); "
            "print(len(resultsafe.__all__))"
        )
        if built_ok and installed.returncode == 0:
            smoke_env = os.environ.copy()
            smoke_env["PYTHONPATH"] = str(target)
            if run("-I", "-c", f"import sys; sys.path.insert(0, {str(target)!r}); {smoke}", cwd=temp, env=smoke_env).returncode != 0:
                failures.append("isolated wheel operation-surface and metadata smoke")

    if failures:
        print("Python qualification FAIL: " + "; ".join(failures), file=sys.stderr)
        return 1
    print("Python qualification PASS: 23 module surfaces, 21 method surfaces, runtime, strict typing, and repeated normalized wheel checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
