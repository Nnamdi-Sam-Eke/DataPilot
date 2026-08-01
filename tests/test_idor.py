"""
Tests Backend/utils/auth.py's require_owns_key() — the fix for the IDOR
where any authenticated user could read/write/delete another user's B2
file or model just by knowing (or guessing) their storage_key.
"""
import pytest
from fastapi import HTTPException
from utils.auth import require_owns_key


def test_owner_can_access_their_own_key():
    require_owns_key("users/uid-123/uploads/dataset.csv", "uid-123")  # should not raise


def test_stranger_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        require_owns_key("users/uid-123/uploads/dataset.csv", "uid-456")
    assert exc_info.value.status_code == 403


def test_key_with_no_namespace_at_all_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        require_owns_key("uploads/dataset.csv", "uid-123")
    assert exc_info.value.status_code == 403


def test_prefix_lookalike_is_rejected():
    """
    'users/uid-123-evil/...' starts with the string 'users/uid-123' but is
    NOT actually namespaced under uid-123 — guards against a naive
    startswith() bypass via a crafted neighboring uid.
    """
    with pytest.raises(HTTPException):
        require_owns_key("users/uid-123-evil/uploads/x.csv", "uid-123")
