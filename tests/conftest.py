"""
Shared test setup.

These tests import your REAL Backend/ code unmodified — they don't
re-implement any logic to check against itself. What's faked is only the
outside world your code talks to:

  - firebase_admin (Firestore + Auth)   -> in-memory fake, no GCP project needed
  - src/services/flutterwave            -> stubbed, no live Flutterwave calls

That means:
  - You do NOT need real Firebase credentials to run this suite.
  - You do NOT need real Flutterwave keys to run this suite (payment
    verification itself is stubbed — see test_webhook_signature.py for
    exactly what that does and doesn't prove).
  - Nothing here makes a real network call.

Run with:  pytest -v   (from the repo root, with this tests/ folder present)
"""
import sys
import types
from pathlib import Path
from datetime import datetime, timezone

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "Backend"

# Backend/*.py does `from utils.auth import ...` (not `from Backend.utils...`),
# i.e. it expects to run with Backend/ itself on sys.path — same as when
# uvicorn runs main.py from inside Backend/ in production.
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(REPO_ROOT))


# ── Fake firebase_admin ──────────────────────────────────────────────────────
# In-memory Firestore substitute, supporting arbitrary nesting
# (collection/document/collection/document/...) since quota.py uses a
# subcollection path: users/{uid}/counters/insights.
# Reset between tests via the `fake_db` fixture below so tests can't leak
# state into each other.
class _Store:
    def __init__(self):
        self.data = {}  # path tuple (e.g. ("users", uid, "counters", "insights")) -> dict

    def reset(self):
        self.data.clear()


_STORE = _Store()


class _DocSnap:
    def __init__(self, key):
        self._key = key
        self.exists = key in _STORE.data

    def to_dict(self):
        return dict(_STORE.data.get(self._key, {})) if self.exists else None


class _DocRef:
    def __init__(self, key):
        self._key = key  # full path tuple to this document

    def get(self, transaction=None):
        return _DocSnap(self._key)

    def set(self, data, merge=False):
        if merge and self._key in _STORE.data:
            _STORE.data[self._key].update(data)
        else:
            _STORE.data[self._key] = dict(data)

    def collection(self, name):
        return _CollectionRef(self._key + (name,))


class _CollectionRef:
    def __init__(self, path):
        self._path = path  # path tuple to this collection
        self._wheres = []

    def document(self, doc_id):
        return _DocRef(self._path + (doc_id,))

    def where(self, field, op, value):
        # Only supports the single equality filter payments-history queries
        # use (user_id == X). Good enough for these tests; extend if you add
        # tests that need more.
        clone = _CollectionRef(self._path)
        clone._wheres = self._wheres + [(field, op, value)]
        return clone

    def order_by(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def stream(self):
        results = []
        for path, doc in _STORE.data.items():
            # direct children of this collection: path = self._path + (doc_id,)
            if len(path) != len(self._path) + 1 or path[: len(self._path)] != self._path:
                continue
            if all(doc.get(f) == v for f, _, v in self._wheres):
                results.append(_DocSnap(path))
        return iter(results)


class _FakeTransaction:
    """Mimics the subset of google.cloud.firestore.Transaction that
    quota.py's @firestore.transactional function uses: transaction.set(ref, data, merge=...).
    Not a real transaction (no isolation/retry) — fine for these tests since
    nothing here exercises concurrent writers.
    """

    def set(self, ref, data, merge=False):
        ref.set(data, merge=merge)

    def get(self, ref):
        return ref.get()


class _FakeFirestoreClient:
    def collection(self, path):
        return _CollectionRef((path,))

    def transaction(self):
        return _FakeTransaction()


def _transactional(fn):
    # firestore.transactional normally retries with a real Transaction
    # object; our fake just calls straight through since _DocRef.set/get
    # don't need real transaction semantics for these tests.
    def wrapper(transaction):
        return fn(transaction)
    return wrapper


fake_firestore_module = types.ModuleType("firebase_admin.firestore")
fake_firestore_module.SERVER_TIMESTAMP = "__SERVER_TIMESTAMP__"
fake_firestore_module.transactional = _transactional
fake_firestore_module.client = lambda: _FakeFirestoreClient()


class _Query:
    DESCENDING = "DESCENDING"
    ASCENDING = "ASCENDING"


fake_firestore_module.Query = _Query


fake_auth_module = types.ModuleType("firebase_admin.auth")


class _FakeUserRecord:
    def __init__(self, uid):
        self.uid = uid


# Overridden per-test via monkeypatch when a test needs a specific
# uid/email mapping (see fixtures below).
fake_auth_module.get_user_by_email = lambda email: _FakeUserRecord(uid="test-uid-1")
fake_auth_module.verify_id_token = lambda token: {"uid": "test-uid-1", "email": "test@example.com"}


fake_firebase_admin_module = types.ModuleType("firebase_admin")
fake_firebase_admin_module._apps = ["already-initialized-for-tests"]
fake_firebase_admin_module.initialize_app = lambda *a, **k: None


class _Credentials:
    class Certificate:
        def __init__(self, *a, **k):
            pass


fake_firebase_admin_module.credentials = _Credentials
fake_firebase_admin_module.firestore = fake_firestore_module
fake_firebase_admin_module.auth = fake_auth_module

sys.modules["firebase_admin"] = fake_firebase_admin_module
sys.modules["firebase_admin.firestore"] = fake_firestore_module
sys.modules["firebase_admin.auth"] = fake_auth_module


# ── Fake src.services.flutterwave ────────────────────────────────────────────
fake_flutterwave_module = types.ModuleType("src.services.flutterwave")
fake_flutterwave_module.create_payment = lambda *a, **k: (_ for _ in ()).throw(
    NotImplementedError("not exercised in this suite")
)
fake_flutterwave_module.verify_transaction = lambda *a, **k: {
    "status": "success",
    "data": {"status": "successful", "tx_ref": "unset", "amount": 12, "currency": "USD"},
}
fake_flutterwave_module.cancel_subscription = lambda subscription_id: {"status": "success", "id": subscription_id}
fake_flutterwave_module.get_subscription_id_by_email = lambda email: "sub_fake_123"

if "src" not in sys.modules:
    sys.modules["src"] = types.ModuleType("src")
if "src.services" not in sys.modules:
    sys.modules["src.services"] = types.ModuleType("src.services")
sys.modules["src.services.flutterwave"] = fake_flutterwave_module


@pytest.fixture(autouse=True)
def fake_db():
    """Every test starts with a clean in-memory Firestore."""
    _STORE.reset()
    yield _STORE
    _STORE.reset()


def seed_user(uid: str, **fields):
    """Convenience: write a users/{uid} doc directly into the fake store."""
    _STORE.data[("users", uid)] = dict(fields)


def get_user_doc(uid: str) -> dict:
    return dict(_STORE.data.get(("users", uid), {}))


def utcnow():
    return datetime.now(timezone.utc)
