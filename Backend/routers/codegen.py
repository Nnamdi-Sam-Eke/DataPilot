from fastapi import APIRouter, HTTPException
from utils.code_utils import generate_python_code

router = APIRouter()

@router.post("/")
async def codegen(payload: dict):
    """
    Generate Python code template for a dataset.
    payload = {"columns": ["col1", "col2", ...]}
    """
    columns = payload.get("columns")
    if not columns or not isinstance(columns, list):
        raise HTTPException(status_code=400, detail="Invalid or empty columns provided.")

    try:
        code = generate_python_code(columns)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code generation failed: {str(e)}")

    return {"code": code}
