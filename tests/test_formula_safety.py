"""
Tests Backend/routers/clean.py's _validate_formula() — the guard in front of
df.eval(engine='python'), which pandas' own docs warn is close to real
Python eval(). This is a pure function with no DB/network dependency.
"""
import pytest
from routers.clean import _validate_formula


@pytest.mark.parametrize("formula", [
    "price * quantity",
    "(a + b) / 2",
    "log(price)",
    "sqrt(abs(delta))",
    "price > 100 and quantity < 5",
    "round(price, 2)",
    "not (a == b)",
])
def test_legitimate_formulas_pass(formula):
    _validate_formula(formula)  # should not raise


@pytest.mark.parametrize("formula", [
    "__import__('os').system('echo pwned')",
    "os.system('rm -rf /')",
    "open('/etc/passwd').read()",
    "().__class__.__bases__[0]",
    "[x for x in range(10)]",           # list comprehension
    "lambda x: x",                      # lambda
    "price.__class__",                  # attribute access
    "eval('1+1')",                      # calling a non-whitelisted function
    "exec('print(1)')",
    "globals()",
    "1; import os",                     # not even valid as a single eval expr
    "df['a']",                          # subscripting
])
def test_malicious_or_disallowed_formulas_are_rejected(formula):
    with pytest.raises(ValueError):
        _validate_formula(formula)


def test_error_message_names_the_disallowed_function():
    with pytest.raises(ValueError, match="not allowed"):
        _validate_formula("eval('1')")
