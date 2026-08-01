"""
Tests Backend/routers/train.py's per-user model budget — the fix for the
original MAX_MODELS = 4 being a single GLOBAL cap, where one user's models
could evict another user's models. Manipulates the real MODEL_STORE dict and
calls the real _enforce_user_model_budget()/_user_model_ids().
"""
from datetime import datetime, timedelta

import routers.train as train


def _model(uid, created_at):
    return {"uid": uid, "created_at": created_at, "last_accessed": created_at, "file_path": None}


def setup_function():
    train.MODEL_STORE.clear()


def test_free_user_capped_at_one():
    now = datetime.utcnow()
    train.MODEL_STORE["m1"] = _model("free-uid", now - timedelta(minutes=2))
    train.MODEL_STORE["m2"] = _model("free-uid", now - timedelta(minutes=1))
    train.MODEL_STORE["m3"] = _model("free-uid", now)

    train._enforce_user_model_budget("free-uid", "free")

    remaining = train._user_model_ids("free-uid")
    assert len(remaining) == 1
    assert remaining == ["m3"], "the OLDEST models should be evicted first, newest kept"


def test_pro_user_capped_at_four():
    now = datetime.utcnow()
    for i in range(6):
        train.MODEL_STORE[f"m{i}"] = _model("pro-uid", now + timedelta(seconds=i))

    train._enforce_user_model_budget("pro-uid", "pro")

    remaining = train._user_model_ids("pro-uid")
    assert len(remaining) == 4
    assert remaining == ["m2", "m3", "m4", "m5"], "the 2 oldest should be evicted, 4 newest kept"


def test_evicting_one_user_does_not_touch_another_user_REGRESSION():
    """
    This is the exact bug that shipped: MAX_MODELS=4 was a GLOBAL count
    across every user, so one Pro user's 5th model could evict a
    DIFFERENT user's model. If this test ever fails, that regression is back.
    """
    now = datetime.utcnow()
    # Pro user A already has 4 models (at budget).
    for i in range(4):
        train.MODEL_STORE[f"a{i}"] = _model("pro-user-a", now + timedelta(seconds=i))
    # Pro user B has 1 model.
    train.MODEL_STORE["b0"] = _model("pro-user-b", now)

    # User A trains a 5th model.
    train.MODEL_STORE["a4"] = _model("pro-user-a", now + timedelta(seconds=10))
    train._enforce_user_model_budget("pro-user-a", "pro")

    # User A should have lost their oldest (a0), never touching B.
    assert "a0" not in train.MODEL_STORE
    assert train._user_model_ids("pro-user-a") == ["a1", "a2", "a3", "a4"]

    # User B's model must be completely untouched.
    assert "b0" in train.MODEL_STORE, "REGRESSION: another user's model was evicted"
    assert train._user_model_ids("pro-user-b") == ["b0"]


def test_users_with_models_under_budget_are_left_alone():
    now = datetime.utcnow()
    train.MODEL_STORE["only-one"] = _model("pro-uid-2", now)
    train._enforce_user_model_budget("pro-uid-2", "pro")
    assert train._user_model_ids("pro-uid-2") == ["only-one"]
