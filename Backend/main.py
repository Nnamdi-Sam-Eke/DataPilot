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

# ================= LOGGING CONFIGURATION =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ================= CUSTOM JSON ENCODER =================
class NaNEncoder(json.JSONEncoder):
    """Custom JSON encoder that converts NaN, Inf, and -Inf to None"""
    def encode(self, obj):
        if isinstance(obj, float):
            if np.isnan(obj) or np.isinf(obj):
                return 'null'
        return super().encode(obj)
    
    def iterencode(self, obj, _one_shot=False):
        """Encode object while handling NaN values"""
        def floatstr(o, allow_nan=False):
            if np.isnan(o) or np.isinf(o):
                return 'null'
            return repr(o)
        
        _iterencode = json.encoder._make_iterencode(
            None, self.default, floatstr, self.indent,
            self.separators, self.sort_keys,
            self.skipkeys, _one_shot
        )
        return _iterencode(obj, 0)

# ================= BACKGROUND CLEANUP TASK =================
async def cleanup_expired_sessions():
    """Background task to cleanup expired sessions"""
    while True:
        try:
            from routers.upload import DATA_CACHE, EXPIRY_MINUTES
            
            expired = [
                sid for sid, session in DATA_CACHE.items()
                if datetime.utcnow() - session["created_at"] > timedelta(minutes=EXPIRY_MINUTES)
            ]
            
            for sid in expired:
                del DATA_CACHE[sid]
            
            if expired:
                logger.info(f"🧹 Cleaned up {len(expired)} expired sessions")
                
        except Exception as e:
            logger.error(f"Error during session cleanup: {e}")
        
        # Run cleanup every 10 minutes
        await asyncio.sleep(600)

# ================= LIFESPAN EVENTS =================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Data Pilot API starting up...")
    
    # Start background cleanup task
  
    cleanup_task = asyncio.create_task(cleanup_expired_sessions())
    
    yield
    
    # Cleanup on shutdown
    cleanup_task.cancel()
    logger.info("🛑 Data Pilot API shutting down...")
    from routers.upload import DATA_CACHE
    DATA_CACHE.clear()
    logger.info("🧹 Cleared data cache")

# ================= FASTAPI INITIALIZATION =================
app = FastAPI(
    title="Data Pilot API",
    description="AI-powered data analysis and visualization API with batch upload support",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# ================= CORS CONFIGURATION =================
# ================= CORS =================

DEFAULT_LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
]

ALLOWED_ORIGINS_ENV = os.getenv("ALLOWED_ORIGINS")

if ALLOWED_ORIGINS_ENV:
    # Production mode (Render env var set)
    allow_origins = [origin.strip() for origin in ALLOWED_ORIGINS_ENV.split(",")]
    allow_credentials = True
else:
    # Local development fallback
    allow_origins = DEFAULT_LOCAL_ORIGINS
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ================= GLOBAL EXCEPTION HANDLERS =================
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error on {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": exc.errors()}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "message": str(exc) if os.getenv("DEBUG") == "true" else "An error occurred"
        }
    )

# ================= REQUEST LOGGING MIDDLEWARE =================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"📨 {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"✅ {request.method} {request.url.path} - Status: {response.status_code}")
    return response

# ================= HELPER FUNCTIONS =================
def clean_df_for_json(df: pd.DataFrame) -> dict:
    """
    Convert DataFrame to JSON-safe dict, handling NaN, Inf, Timestamp,
    numpy scalars, and any other non-serializable pandas/numpy types.
    """
    import math

    def safe_val(val):
        """Convert any value to a JSON-safe Python primitive."""
        # pandas NA / NaT / None
        try:
            if pd.isna(val):
                return None
        except (TypeError, ValueError):
            pass
        # numpy scalar → python primitive
        if isinstance(val, np.generic):
            v = val.item()
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return None
            return v
        # pandas Timestamp / datetime
        if isinstance(val, (pd.Timestamp,)):
            return val.isoformat() if not pd.isnull(val) else None
        # python float
        if isinstance(val, float):
            if math.isnan(val) or math.isinf(val):
                return None
            return val
        # python int / bool / str / None
        if isinstance(val, (int, bool, str)) or val is None:
            return val
        # fallback: convert to string
        return str(val)

    df_copy = df.replace([np.inf, -np.inf], np.nan)

    records = [
        {col: safe_val(row[col]) for col in df_copy.columns}
        for _, row in df_copy.iterrows()
    ]

    return {
        "data":    records,
        "columns": df_copy.columns.tolist(),
    }

# ================= ROOT & HEALTH ENDPOINTS =================
@app.get("/", tags=["Root"])
async def root():
    return {
        "name": "Data Pilot API",
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
            "cache_stats": "/cache/stats"
        }
    }

@app.get("/health", tags=["Health"])
async def health_check():
    from routers.upload import DATA_CACHE
    return {
        "status": "healthy",
        "service": "data-pilot-api",
        "version": "1.0.0",
        "cache_size": len(DATA_CACHE),
        "cache_memory_mb": sum(
            session["df"].memory_usage(deep=True).sum() 
            for session in DATA_CACHE.values()
        ) / (1024 * 1024) if DATA_CACHE else 0
    }

# ================= DATA ENDPOINT WITH PAGINATION =================
@app.get("/data/{session_id}", tags=["Data"])
async def get_data(
    session_id: str,
    limit: int = 10000,  # Default to 10k rows
    offset: int = 0
):
    """
    Retrieve dataset for a given session with pagination support.
    
    Args:
        session_id: Session identifier
        limit: Maximum number of rows to return (default 10000, max 50000)
        offset: Number of rows to skip (default 0)
    
    Returns:
        JSON with data, total_rows, offset, and limit
    """
    from routers.upload import DATA_CACHE
    
    if session_id not in DATA_CACHE:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Enforce maximum limit to prevent memory issues
    MAX_LIMIT = 50000
    if limit > MAX_LIMIT:
        limit = MAX_LIMIT
        logger.warning(f"Limit capped at {MAX_LIMIT} for session {session_id}")
    
    df = DATA_CACHE[session_id]["df"]
    total_rows = len(df)
    
    # Get subset of data
    subset = df.iloc[offset:offset+limit]
    
    try:
        # Use the helper function to clean and convert the dataframe
        result = clean_df_for_json(subset)
        result["total_rows"] = total_rows
        result["offset"] = offset
        result["limit"] = limit
        result["has_more"] = offset + limit < total_rows
        
        # Return with custom JSON response to ensure proper encoding
        return JSONResponse(
            content=result,
            status_code=200,
            media_type="application/json"
        )
    except Exception as e:
        logger.error(f"Error converting dataframe to JSON: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error processing data: {str(e)}"
        )

# ================= SESSION DELETE ENDPOINT =================
@app.delete("/session/{session_id}", tags=["Data"])
async def delete_session(session_id: str):
    """
    Evict a specific session from the in-memory cache.
    Called when the user removes a dataset from the Upload page.
    """
    from routers.upload import DATA_CACHE

    if session_id not in DATA_CACHE:
        # Already gone — treat as success so the client isn't blocked
        return {"message": "Session not found (already evicted)", "session_id": session_id}

    del DATA_CACHE[session_id]
    logger.info(f"🗑️  Session {session_id} evicted by user request")
    return {"message": "Session evicted", "session_id": session_id}


@app.get("/cache/stats", tags=["Cache"])
async def cache_stats():
    from routers.upload import DATA_CACHE, EXPIRY_MINUTES
    
    active_sessions = 0
    expired_sessions = 0
    total_memory = 0
    
    for session_id, session in DATA_CACHE.items():
        if datetime.utcnow() - session["created_at"] > timedelta(minutes=EXPIRY_MINUTES):
            expired_sessions += 1
        else:
            active_sessions += 1
            total_memory += session["df"].memory_usage(deep=True).sum()
    
    return {
        "active_sessions": active_sessions,
        "expired_sessions": expired_sessions,
        "total_sessions": len(DATA_CACHE),
        "total_memory_mb": round(total_memory / (1024 * 1024), 2),
        "expiry_minutes": EXPIRY_MINUTES
    }

@app.delete("/cache/clear", tags=["Cache"])
async def clear_cache():
    from routers.upload import DATA_CACHE
    count = len(DATA_CACHE)
    DATA_CACHE.clear()
    logger.info(f"🧹 Manually cleared {count} sessions from cache")
    return {"message": f"Successfully cleared {count} sessions from cache", "cleared_count": count}

# ================= INCLUDE ROUTERS =================
# Include upload router WITHOUT prefix so routes are at root level
# This allows /upload and /batch_uploads to work directly
app.include_router(upload.router, tags=["Upload"])

# Include other routers WITH prefixes
app.include_router(insights.router, prefix="/insights", tags=["Insights"])
app.include_router(plots.router, prefix="/plots", tags=["Plots"])
app.include_router(codegen.router, prefix="/codegen", tags=["CodeGen"])
app.include_router(clean_router,                          tags=["Clean"])

if _has_train:
    app.include_router(train.router,   prefix="/train",      tags=["Train"])
    app.include_router(predict.router, prefix="/predict",    tags=["Predict"])
    app.include_router(report.router,  prefix="/report",     tags=["Report"])

# ================= STARTUP MESSAGE =================
@app.on_event("startup")
async def startup_message():
    logger.info("=" * 50)
    logger.info("🎯 Data Pilot API Ready!")
    logger.info(f"📚 Documentation: http://localhost:8000/docs")
    logger.info(f"📖 ReDoc: http://localhost:8000/redoc")
    logger.info(f"📤 Single Upload: POST /upload")
    logger.info(f"📦 Batch Upload: POST /batch_uploads")
    logger.info(f"📊 Get Data: GET /data/{{session_id}}")
    logger.info(f"💾 Cache Expiry: 180 minutes (3 hours)")
    logger.info(f"🧹 Auto-cleanup: Every 10 minutes")
    logger.info("=" * 50)