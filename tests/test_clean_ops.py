"""
Exercises every operation in Backend/routers/clean.py end-to-end through
real HTTP requests against the real router (mounted in a throwaway FastAPI
app), backed by a real in-memory session created via routers.upload's own
create_session(). Nothing here re-implements clean.py's logic to check
against itself — these are black-box checks against actual responses.

Covers: auth requirement (the fix for the "no auth at all" gap), every
transform's happy path, its main error paths, the undo/promote/export flow,
and the three Pro-gated ops (groupby, custom_formula, extract_regex).
"""
import io
import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import seed_user
import routers.clean as clean
from routers.upload import create_session, DATA_CACHE

app = FastAPI()
app.include_router(clean.router)
client = TestClient(app)

AUTH = {"Authorization": "Bearer fake-token"}
FREE_UID = "test-uid-1"  # matches conftest's fake verify_id_token uid


def make_df():
    return pd.DataFrame({
        "id":        list(range(1, 11)),
        "name":      [" Alice ", "BOB", "carol", "Dave", "  eve", "Frank", "Grace", "Heidi", "Ivan", "Judy"],
        "age":       [25, 30, None, 40, 45, 22, 1000, 35, 29, 31],   # 1 null, 1 outlier
        "category":  ["A", "B", "A", "C", "B", "A", "B", None, "C", "A"],
        "salary":    ["$1,200", "$2,300", "$1,900", None, "$5,000", "$2,100", "$1,800", "$2,600", "$3,000", "$2,200"],
        "signup":    ["2023-01-05", "2023-02-14", "2023-03-01", "2023-04-20", "2023-05-11",
                      "2023-06-30", "2023-07-19", "2023-08-08", "2023-09-27", "2023-10-16"],
        "email":     [f"user{i}@example.com" for i in range(10)],
        "score":     [3.5, 7.2, 5.5, 9.9, 1.1, 4.4, 6.6, 8.8, 2.2, 0.0],
    })


def new_session(plan="free"):
    df = make_df()
    sid = create_session(df.copy(), plan=plan, file_name="test.csv")
    return sid


@pytest.fixture(autouse=True)
def clean_state():
    """Reset CLEAN_STORE and DATA_CACHE between tests so ops don't leak
    across sessions (these are module-level dicts, not covered by the
    fake_db fixture, which only resets Firestore)."""
    clean.CLEAN_STORE.clear()
    DATA_CACHE.clear()
    yield
    clean.CLEAN_STORE.clear()
    DATA_CACHE.clear()


def free_user():
    seed_user(FREE_UID, plan="free")


def pro_user():
    seed_user(FREE_UID, plan="pro")


# ── auth requirement (the actual fix under test) ─────────────────────────────

def test_missing_auth_rejected_on_every_route():
    sid = new_session()
    routes = [
        ("get",  f"/clean/{sid}/summary", None),
        ("post", f"/clean/{sid}/fill_missing", {"column": "age", "strategy": "mean"}),
        ("post", f"/clean/{sid}/drop_column", {"column": "id"}),
        ("post", f"/clean/{sid}/drop_duplicates", {}),
        ("post", f"/clean/{sid}/undo", {}),
        ("post", f"/clean/{sid}/promote", {}),
        ("get",  f"/clean/{sid}/export", None),
    ]
    for method, url, body in routes:
        res = getattr(client, method)(url, json=body) if body is not None else getattr(client, method)(url)
        assert res.status_code == 401, f"{method.upper()} {url} should require auth, got {res.status_code}"


def test_invalid_token_rejected():
    # conftest's fake verify_id_token accepts any string, so this specifically
    # checks the "missing Bearer prefix" path, which get_current_user rejects
    # before ever calling verify_id_token.
    sid = new_session()
    res = client.get(f"/clean/{sid}/summary", headers={"Authorization": "NotBearer xyz"})
    assert res.status_code == 401


# ── summary / unknown session ────────────────────────────────────────────────

def test_summary_unknown_session_404():
    free_user()
    res = client.get("/clean/does-not-exist/summary", headers=AUTH)
    assert res.status_code == 404


def test_summary_happy_path():
    free_user()
    sid = new_session()
    res = client.get(f"/clean/{sid}/summary", headers=AUTH)
    assert res.status_code == 200
    d = res.json()
    assert d["row_count"] == 10
    assert "age" in d["summary"]
    assert d["summary"]["age"]["count"] == 9  # one null


# ── fill_missing ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("strategy", ["mean", "median", "mode", "zero", "ffill", "bfill", "drop"])
def test_fill_missing_all_strategies(strategy):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/fill_missing", json={"column": "age", "strategy": strategy}, headers=AUTH)
    assert res.status_code == 200, res.text
    assert res.json()["filled_count"] == 1


def test_fill_missing_unknown_column():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/fill_missing", json={"column": "nope", "strategy": "mean"}, headers=AUTH)
    assert res.status_code == 400


def test_fill_missing_unknown_strategy():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/fill_missing", json={"column": "age", "strategy": "bogus"}, headers=AUTH)
    assert res.status_code == 400


def test_fill_missing_no_missing_values_is_a_noop():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/fill_missing", json={"column": "id", "strategy": "mean"}, headers=AUTH)
    assert res.status_code == 200
    assert res.json()["filled_count"] == 0


def test_fill_missing_mean_on_non_numeric_falls_back_to_mode():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/fill_missing", json={"column": "category", "strategy": "mean"}, headers=AUTH)
    assert res.status_code == 200
    assert "fallback to mode" in res.json()["used_strategy"]


def test_fill_all_missing():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/fill_all_missing",
                       json={"strategies": {"age": "mean", "salary": "zero", "category": "mode"}}, headers=AUTH)
    assert res.status_code == 200
    assert res.json()["total_filled"] >= 2  # salary is still string here, "zero" -> "" not counted as numeric but still fills


# ── drop_column / rename_column ──────────────────────────────────────────────

def test_drop_column():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/drop_column", json={"column": "id"}, headers=AUTH)
    assert res.status_code == 200
    res2 = client.get(f"/clean/{sid}/summary", headers=AUTH)
    assert "id" not in res2.json()["columns"]


def test_drop_column_unknown():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/drop_column", json={"column": "nope"}, headers=AUTH)
    assert res.status_code == 400


def test_rename_column():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/rename_column", json={"old_name": "age", "new_name": "years"}, headers=AUTH)
    assert res.status_code == 200
    res2 = client.get(f"/clean/{sid}/summary", headers=AUTH)
    assert "years" in res2.json()["columns"]


def test_rename_column_to_existing_name_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/rename_column", json={"old_name": "age", "new_name": "id"}, headers=AUTH)
    assert res.status_code == 400


# ── drop_duplicates / drop_duplicates_subset ─────────────────────────────────

def test_drop_duplicates():
    free_user()
    df = make_df()
    df = pd.concat([df, df.iloc[[0]]], ignore_index=True)  # add exact duplicate row
    sid = create_session(df, plan="free", file_name="dupe.csv")
    res = client.post(f"/clean/{sid}/drop_duplicates", headers=AUTH)
    assert res.status_code == 200
    assert "Removed 1 duplicate" in res.json()["message"]


def test_drop_duplicates_subset():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/drop_duplicates_subset", json={"subset": ["category"], "keep": "first"}, headers=AUTH)
    assert res.status_code == 200


def test_drop_duplicates_subset_empty_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/drop_duplicates_subset", json={"subset": [], "keep": "first"}, headers=AUTH)
    assert res.status_code == 400


def test_drop_duplicates_subset_unknown_column():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/drop_duplicates_subset", json={"subset": ["nope"], "keep": "first"}, headers=AUTH)
    assert res.status_code == 400


# ── cast_column ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("dtype", ["int", "float", "str", "datetime", "bool"])
def test_cast_column(dtype):
    free_user()
    sid = new_session()
    col = "signup" if dtype == "datetime" else "score"
    res = client.post(f"/clean/{sid}/cast_column", json={"column": col, "dtype": dtype}, headers=AUTH)
    assert res.status_code == 200, res.text


def test_cast_column_unknown_dtype():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/cast_column", json={"column": "score", "dtype": "bogus"}, headers=AUTH)
    assert res.status_code == 400


# ── encode_column (free — see accuracy discussion) ───────────────────────────

def test_encode_column_label():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/encode_column", json={"column": "category", "strategy": "label"}, headers=AUTH)
    assert res.status_code == 200
    assert "mapping" in res.json()


def test_encode_column_onehot():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/encode_column", json={"column": "category", "strategy": "onehot"}, headers=AUTH)
    assert res.status_code == 200
    assert len(res.json()["created_columns"]) >= 3  # A, B, C, Missing


def test_encode_column_ignore():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/encode_column", json={"column": "category", "strategy": "ignore"}, headers=AUTH)
    assert res.status_code == 200


# ── cap_outliers ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("method,action", [("iqr", "cap"), ("iqr", "remove"), ("zscore", "cap"), ("zscore", "remove")])
def test_cap_outliers(method, action):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/cap_outliers",
                       json={"column": "age", "method": method, "action": action, "threshold": 1.5}, headers=AUTH)
    assert res.status_code == 200, res.text
    assert res.json()["affected_rows"] >= 1  # the 1000 outlier should be caught by both methods


def test_cap_outliers_non_numeric_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/cap_outliers", json={"column": "category", "method": "iqr", "action": "cap"}, headers=AUTH)
    assert res.status_code == 400


# ── string_op ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("op", ["trim", "lower", "upper", "title", "strip_special"])
def test_string_op(op):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/string_op", json={"column": "name", "operation": op}, headers=AUTH)
    assert res.status_code == 200


def test_string_op_unknown():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/string_op", json={"column": "name", "operation": "bogus"}, headers=AUTH)
    assert res.status_code == 400


# ── filter_rows ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("op,val", [
    ("eq", "A"), ("ne", "A"), ("contains", "A"), ("startswith", "A"), ("endswith", "A"),
    ("isnull", None), ("notnull", None),
])
def test_filter_rows_categorical(op, val):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/filter_rows", json={"column": "category", "operator": op, "value": val, "keep": True}, headers=AUTH)
    assert res.status_code == 200, res.text


@pytest.mark.parametrize("op", ["gt", "lt", "gte", "lte"])
def test_filter_rows_numeric(op):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/filter_rows", json={"column": "score", "operator": op, "value": "5", "keep": True}, headers=AUTH)
    assert res.status_code == 200, res.text


def test_filter_rows_non_numeric_value_on_numeric_column_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/filter_rows", json={"column": "score", "operator": "gt", "value": "not-a-number", "keep": True}, headers=AUTH)
    assert res.status_code == 400


def test_filter_rows_unknown_column():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/filter_rows", json={"column": "nope", "operator": "eq", "value": "x", "keep": True}, headers=AUTH)
    assert res.status_code == 400


# ── find_replace ──────────────────────────────────────────────────────────────

def test_find_replace_specific_column():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/find_replace",
                       json={"column": "category", "find_value": "A", "replace_value": "Alpha", "regex": False}, headers=AUTH)
    assert res.status_code == 200
    assert res.json()["message"].startswith("Replaced")


def test_find_replace_all_columns():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/find_replace",
                       json={"find_value": "None", "replace_value": "N/A", "regex": False}, headers=AUTH)
    assert res.status_code == 200


def test_find_replace_regex():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/find_replace",
                       json={"column": "email", "find_value": r"@.*", "replace_value": "", "regex": True}, headers=AUTH)
    assert res.status_code == 200


def test_find_replace_bad_regex():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/find_replace",
                       json={"column": "email", "find_value": "(unclosed", "replace_value": "", "regex": True}, headers=AUTH)
    assert res.status_code == 422


def test_find_replace_to_null_sentinel():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/find_replace",
                       json={"column": "category", "find_value": "A", "replace_value": "null", "regex": False}, headers=AUTH)
    assert res.status_code == 200


# ── normalize ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("method", ["minmax", "zscore"])
def test_normalize(method):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/normalize", json={"column": "score", "method": method}, headers=AUTH)
    assert res.status_code == 200, res.text


def test_normalize_non_numeric_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/normalize", json={"column": "category", "method": "minmax"}, headers=AUTH)
    assert res.status_code == 400


def test_normalize_zero_variance_rejected():
    free_user()
    df = make_df()
    df["const"] = 5
    sid = create_session(df, plan="free", file_name="const.csv")
    res = client.post(f"/clean/{sid}/normalize", json={"column": "const", "method": "zscore"}, headers=AUTH)
    assert res.status_code == 400


# ── extract_date_parts ────────────────────────────────────────────────────────

def test_extract_date_parts():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/extract_date_parts",
                       json={"column": "signup", "parts": ["year", "month", "day", "weekday", "quarter"]}, headers=AUTH)
    assert res.status_code == 200
    assert len(res.json()["message"]) > 0


def test_extract_date_parts_no_valid_parts():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/extract_date_parts", json={"column": "signup", "parts": ["bogus"]}, headers=AUTH)
    assert res.status_code == 400


# ── bin_column ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("method", ["equal_width", "equal_freq"])
def test_bin_column(method):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/bin_column", json={"column": "score", "n_bins": 3, "method": method}, headers=AUTH)
    assert res.status_code == 200, res.text


def test_bin_column_non_numeric_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/bin_column", json={"column": "category", "n_bins": 3}, headers=AUTH)
    assert res.status_code == 400


# ── derived_column ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("op", ["add", "subtract", "multiply", "divide"])
def test_derived_column_two_col_ops(op):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/derived_column",
                       json={"new_col_name": "result", "col_a": "score", "col_b": "id", "operation": op}, headers=AUTH)
    assert res.status_code == 200, res.text


@pytest.mark.parametrize("op", ["abs", "log", "sqrt", "round"])
def test_derived_column_single_col_ops(op):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/derived_column",
                       json={"new_col_name": "result", "col_a": "score", "operation": op}, headers=AUTH)
    assert res.status_code == 200, res.text


def test_derived_column_concat():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/derived_column",
                       json={"new_col_name": "combo", "col_a": "name", "col_b": "category", "operation": "concat"}, headers=AUTH)
    assert res.status_code == 200


def test_derived_column_two_col_op_missing_col_b_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/derived_column",
                       json={"new_col_name": "result", "col_a": "score", "operation": "add"}, headers=AUTH)
    assert res.status_code == 400


def test_derived_column_empty_name_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/derived_column",
                       json={"new_col_name": "  ", "col_a": "score", "operation": "abs"}, headers=AUTH)
    assert res.status_code == 400


# ── parse_number ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("fmt", ["auto", "currency", "comma_separated"])
def test_parse_number_currency_style(fmt):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/parse_number", json={"column": "salary", "format": fmt}, headers=AUTH)
    assert res.status_code == 200, res.text


def test_parse_number_percentage():
    free_user()
    df = make_df()
    df["pct"] = ["10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%"]
    sid = create_session(df, plan="free", file_name="pct.csv")
    res = client.post(f"/clean/{sid}/parse_number", json={"column": "pct", "format": "percentage"}, headers=AUTH)
    assert res.status_code == 200
    assert res.json().get("used_strategy") is None  # sanity: response shape as expected (message-only)


def test_parse_number_accounting_negatives():
    free_user()
    df = make_df()
    df["amt"] = ["(100)", "200", "(300)", "400", "500", "600", "700", "800", "900", "1000"]
    sid = create_session(df, plan="free", file_name="amt.csv")
    res = client.post(f"/clean/{sid}/parse_number", json={"column": "amt", "format": "auto"}, headers=AUTH)
    assert res.status_code == 200


# ── split_column ──────────────────────────────────────────────────────────────

def test_split_column_auto_names():
    free_user()
    df = make_df()
    df["full"] = ["John Smith"] * 10
    sid = create_session(df, plan="free", file_name="full.csv")
    res = client.post(f"/clean/{sid}/split_column", json={"column": "full", "delimiter": " "}, headers=AUTH)
    assert res.status_code == 200
    assert len(res.json()["created_columns"]) == 2


def test_split_column_custom_names_and_drop_original():
    free_user()
    df = make_df()
    df["full"] = ["John Smith"] * 10
    sid = create_session(df, plan="free", file_name="full2.csv")
    res = client.post(f"/clean/{sid}/split_column",
                       json={"column": "full", "delimiter": " ", "new_col_names": ["first", "last"], "drop_original": True},
                       headers=AUTH)
    assert res.status_code == 200
    assert res.json()["dropped_original"] is True


def test_split_column_empty_delimiter_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/split_column", json={"column": "name", "delimiter": ""}, headers=AUTH)
    assert res.status_code == 400


# ── create_flag ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("op,val", [
    ("contains", "a"), ("startswith", "A"), ("endswith", "e"), ("regex", "^A"),
])
def test_create_flag_string_ops(op, val):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/create_flag",
                       json={"new_col_name": "flag", "column": "category", "operator": op, "value": val}, headers=AUTH)
    assert res.status_code == 200, res.text


@pytest.mark.parametrize("op", ["eq", "ne", "gt", "lt", "gte", "lte"])
def test_create_flag_numeric_ops(op):
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/create_flag",
                       json={"new_col_name": "flag", "column": "score", "operator": op, "value": "5"}, headers=AUTH)
    assert res.status_code == 200, res.text


def test_create_flag_missing_name_rejected():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/create_flag",
                       json={"new_col_name": "", "column": "score", "operator": "gt", "value": "5"}, headers=AUTH)
    assert res.status_code == 400


# ── Pro-gated: groupby, custom_formula, extract_regex ────────────────────────

def test_groupby_blocked_for_free():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/groupby",
                       json={"group_by": ["category"], "agg_column": "score", "agg_func": "mean"}, headers=AUTH)
    assert res.status_code == 403
    assert "Pro plan" in res.json()["detail"]


def test_groupby_works_for_pro():
    pro_user()
    sid = new_session(plan="pro")
    res = client.post(f"/clean/{sid}/groupby",
                       json={"group_by": ["category"], "agg_column": "score", "agg_func": "mean"}, headers=AUTH)
    assert res.status_code == 200, res.text
    assert "new_column" in res.json()


def test_custom_formula_blocked_for_free():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/custom_formula",
                       json={"new_col_name": "x", "formula": "score * 2"}, headers=AUTH)
    assert res.status_code == 403
    assert "Pro plan" in res.json()["detail"]


def test_custom_formula_works_for_pro():
    pro_user()
    sid = new_session(plan="pro")
    res = client.post(f"/clean/{sid}/custom_formula",
                       json={"new_col_name": "x", "formula": "score * 2"}, headers=AUTH)
    assert res.status_code == 200, res.text


def test_custom_formula_malicious_still_rejected_for_pro():
    """Pro status should never bypass the AST safety whitelist."""
    pro_user()
    sid = new_session(plan="pro")
    res = client.post(f"/clean/{sid}/custom_formula",
                       json={"new_col_name": "x", "formula": "__import__('os').system('echo pwned')"}, headers=AUTH)
    assert res.status_code == 422


def test_extract_regex_blocked_for_free():
    free_user()
    sid = new_session()
    res = client.post(f"/clean/{sid}/extract_regex",
                       json={"column": "email", "pattern": r"@(\w+)\."}, headers=AUTH)
    assert res.status_code == 403
    assert "Pro plan" in res.json()["detail"]


def test_extract_regex_works_for_pro():
    pro_user()
    sid = new_session(plan="pro")
    res = client.post(f"/clean/{sid}/extract_regex",
                       json={"column": "email", "pattern": r"@(\w+)\."}, headers=AUTH)
    assert res.status_code == 200, res.text
    assert len(res.json()["created_columns"]) >= 1


def test_extract_regex_bad_pattern_rejected_for_pro():
    pro_user()
    sid = new_session(plan="pro")
    res = client.post(f"/clean/{sid}/extract_regex",
                       json={"column": "email", "pattern": "("}, headers=AUTH)
    assert res.status_code == 422


# ── undo ──────────────────────────────────────────────────────────────────────

def test_undo_reverts_last_op():
    free_user()
    sid = new_session()
    client.post(f"/clean/{sid}/drop_column", json={"column": "id"}, headers=AUTH)
    res = client.post(f"/clean/{sid}/undo", headers=AUTH)
    assert res.status_code == 200
    res2 = client.get(f"/clean/{sid}/summary", headers=AUTH)
    assert "id" in res2.json()["columns"]


def test_undo_with_nothing_to_undo():
    free_user()
    sid = new_session()
    client.get(f"/clean/{sid}/summary", headers=AUTH)  # initializes CLEAN_STORE without any op
    res = client.post(f"/clean/{sid}/undo", headers=AUTH)
    assert res.status_code == 400


def test_undo_unknown_session():
    free_user()
    res = client.post("/clean/does-not-exist/undo", headers=AUTH)
    assert res.status_code == 404


def test_undo_multiple_steps():
    free_user()
    sid = new_session()
    client.post(f"/clean/{sid}/drop_column", json={"column": "id"}, headers=AUTH)
    client.post(f"/clean/{sid}/drop_column", json={"column": "score"}, headers=AUTH)
    client.post(f"/clean/{sid}/undo", headers=AUTH)
    res = client.get(f"/clean/{sid}/summary", headers=AUTH)
    cols = res.json()["columns"]
    assert "score" in cols and "id" not in cols


# ── promote ───────────────────────────────────────────────────────────────────

def test_promote_creates_new_session_and_removes_old():
    free_user()
    sid = new_session()
    client.post(f"/clean/{sid}/drop_column", json={"column": "id"}, headers=AUTH)
    res = client.post(f"/clean/{sid}/promote", headers=AUTH)
    assert res.status_code == 200, res.text
    d = res.json()
    assert d["original_removed"] is True
    assert sid not in DATA_CACHE
    assert d["new_session_id"] in DATA_CACHE
    assert "id" not in d["columns"]


# ── export ────────────────────────────────────────────────────────────────────

def test_export_csv():
    free_user()
    sid = new_session()
    res = client.get(f"/clean/{sid}/export", headers=AUTH)
    assert res.status_code == 200
    assert "attachment" in res.headers["content-disposition"]
    body = res.content.decode()
    assert "name" in body.splitlines()[0]  # header row present


def test_export_reflects_prior_ops():
    free_user()
    sid = new_session()
    client.post(f"/clean/{sid}/drop_column", json={"column": "id"}, headers=AUTH)
    res = client.get(f"/clean/{sid}/export", headers=AUTH)
    header = res.content.decode().splitlines()[0]
    assert "id" not in header.split(",")