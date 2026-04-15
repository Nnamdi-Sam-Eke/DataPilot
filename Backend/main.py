from fastapi import FastAPI, Request, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import asyncio
import os
import logging
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta
from routers import upload, insights, plots, codegen
from routers.clean import router as clean_router
try:
    from routers import train, predict, report
    _has_train = True
except ImportError:
    _has_train = False

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ================= CUSTOM JSON ENCODER =================
class NaNEncoder(json.JSONEncoder):
    def encode(self, obj):
        if isinstance(obj, float):
            if np.isnan(obj) or np.isinf(obj):
                return "null"
        return super().encode(obj)

    def iterencode(self, obj, _one_shot=False):
        def floatstr(o, allow_nan=False):
            if np.isnan(o) or np.isinf(o):
                return "null"
            return repr(o)

        _iterencode = json.encoder._make_iterencode(
            None, self.default, floatstr, self.indent,
            self.separators, self.sort_keys,
            self.skipkeys, _one_shot
        )
        return _iterencode(obj, 0)

# ================= BACKGROUND CLEANUP =================
async def cleanup_expired_sessions():
    while True:
        try:
            from routers.upload import DATA_CACHE

            expired = [
                sid for sid, session in DATA_CACHE.items()
                if datetime.utcnow() - session["created_at"] > timedelta(
                    minutes=session.get("expiry_minutes", 180)
                )
            ]

            for sid in expired:
                del DATA_CACHE[sid]

            if expired:
                logger.info(f"🧹 Cleaned up {len(expired)} expired sessions")

        except Exception as e:
            logger.error(f"Error during session cleanup: {e}")

        await asyncio.sleep(300)   # every 5 minutes

# ================= LIFESPAN =================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 DataPilot API starting up...")
    logger.info("=" * 50)
    logger.info("🎯 DataPilot API Ready!")
    logger.info("📚 Docs: http://localhost:8000/docs")
    logger.info("📤 Single Upload: POST /upload")
    logger.info("📦 Batch Upload:  POST /batch_uploads")
    logger.info("📊 Get Data:      GET  /data/{session_id}")
    logger.info("💾 Cache Expiry:  60 min (Free) / 720 min (Pro)")
    logger.info("🧹 Auto-cleanup:  Every 5 minutes")
    logger.info("=" * 50)

    cleanup_task = asyncio.create_task(cleanup_expired_sessions())

    yield

    cleanup_task.cancel()
    logger.info("🛑 DataPilot API shutting down...")
    from routers.upload import DATA_CACHE
    DATA_CACHE.clear()
    logger.info("🧹 Cleared data cache")

# ================= APP =================
app = FastAPI(
    title="DataPilot API",
    description="AI-powered data analysis and visualization API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ================= CORS =================
DEFAULT_LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
]

ALLOWED_ORIGINS_ENV = os.getenv("ALLOWED_ORIGINS")

if ALLOWED_ORIGINS_ENV:
    allow_origins = [o.strip() for o in ALLOWED_ORIGINS_ENV.split(",")]
else:
    allow_origins = DEFAULT_LOCAL_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= EXCEPTION HANDLERS =================
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error on {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": exc.errors()},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "message": str(exc) if os.getenv("DEBUG") == "true" else "An error occurred",
        },
    )

# ================= REQUEST LOGGING =================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"📨 {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"✅ {request.method} {request.url.path} - {response.status_code}")
    return response

# ================= HELPERS =================
def clean_df_for_json(df: pd.DataFrame) -> dict:
    import math

    def safe_val(val):
        try:
            if pd.isna(val):
                return None
        except (TypeError, ValueError):
            pass
        if isinstance(val, np.generic):
            v = val.item()
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return None
            return v
        if isinstance(val, pd.Timestamp):
            return val.isoformat() if not pd.isnull(val) else None
        if isinstance(val, float):
            if math.isnan(val) or math.isinf(val):
                return None
            return val
        if isinstance(val, (int, bool, str)) or val is None:
            return val
        return str(val)

    df_copy = df.replace([np.inf, -np.inf], np.nan)
    records = [
        {col: safe_val(row[col]) for col in df_copy.columns}
        for _, row in df_copy.iterrows()
    ]
    return {"data": records, "columns": df_copy.columns.tolist()}

# ================= ROOT & HEALTH =================
@app.get("/", tags=["Root"])
async def root():
    return {
        "name": "DataPilot API",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "upload_single": "/upload",
            "upload_batch": "/batch_uploads",
            "insights": "/insights",
            "plots": "/plots",
            "codegen": "/codegen",
            "data": "/data/{session_id}",
            "docs": "/docs",
            "health": "/health",
            "cache_stats": "/cache/stats",
        },
    }

@app.get("/health", tags=["Health"])
async def health_check():
    from routers.upload import DATA_CACHE
    return {
        "status": "healthy",
        "service": "datapilot-api",
        "version": "1.0.0",
        "cache_size": len(DATA_CACHE),
        "cache_memory_mb": sum(
            session["df"].memory_usage(deep=True).sum()
            for session in DATA_CACHE.values()
        ) / (1024 * 1024) if DATA_CACHE else 0,
    }

# ================= DATA ENDPOINT =================
@app.get("/data/{session_id}", tags=["Data"])
async def get_data(session_id: str, limit: int = 10000, offset: int = 0):
    from routers.upload import DATA_CACHE

    if session_id not in DATA_CACHE:
        raise HTTPException(status_code=404, detail="Session not found")

    MAX_LIMIT = 50000
    if limit > MAX_LIMIT:
        limit = MAX_LIMIT
        logger.warning(f"Limit capped at {MAX_LIMIT} for session {session_id}")

    df = DATA_CACHE[session_id]["df"]
    total_rows = len(df)
    subset = df.iloc[offset : offset + limit]

    try:
        result = clean_df_for_json(subset)
        result["total_rows"] = total_rows
        result["offset"] = offset
        result["limit"] = limit
        result["has_more"] = offset + limit < total_rows
        return JSONResponse(content=result, status_code=200, media_type="application/json")
    except Exception as e:
        logger.error(f"Error converting dataframe to JSON: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing data: {str(e)}")

# ================= SESSION DELETE =================
@app.delete("/session/{session_id}", tags=["Data"])
async def delete_session(session_id: str):
    from routers.upload import DATA_CACHE

    if session_id not in DATA_CACHE:
        return {"message": "Session not found (already evicted)", "session_id": session_id}

    del DATA_CACHE[session_id]
    logger.info(f"🗑️  Session {session_id} evicted by user request")
    return {"message": "Session evicted", "session_id": session_id}

# ================= CACHE STATS =================
@app.get("/cache/stats", tags=["Cache"])
async def cache_stats():
    from routers.upload import DATA_CACHE, EXPIRY_MINUTES

    active_sessions = 0
    expired_sessions = 0
    total_memory = 0

    for session_id, session in DATA_CACHE.items():
        expiry_min = session.get("expiry_minutes", EXPIRY_MINUTES)
        if datetime.utcnow() - session["created_at"] > timedelta(minutes=expiry_min):
            expired_sessions += 1
        else:
            active_sessions += 1
            total_memory += session["df"].memory_usage(deep=True).sum()

    return {
        "active_sessions": active_sessions,
        "expired_sessions": expired_sessions,
        "total_sessions": len(DATA_CACHE),
        "total_memory_mb": round(total_memory / (1024 * 1024), 2),
        "expiry_minutes": EXPIRY_MINUTES,
    }

@app.delete("/cache/clear", tags=["Cache"])
async def clear_cache():
    from routers.upload import DATA_CACHE
    count = len(DATA_CACHE)
    DATA_CACHE.clear()
    logger.info(f"🧹 Manually cleared {count} sessions from cache")
    return {"message": f"Cleared {count} sessions", "cleared_count": count}

# ================= ROUTERS =================
app.include_router(upload.router, tags=["Upload"])
app.include_router(insights.router, prefix="/insights", tags=["Insights"])
app.include_router(plots.router, prefix="/plots", tags=["Plots"])
app.include_router(codegen.router, prefix="/codegen", tags=["CodeGen"])
app.include_router(clean_router, tags=["Clean"])

if _has_train:
    app.include_router(train.router,   prefix="/train",   tags=["Train"])
    app.include_router(predict.router, prefix="/predict", tags=["Predict"])
    app.include_router(report.router,  prefix="/report",  tags=["Report"])