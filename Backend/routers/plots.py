from fastapi import APIRouter
import pandas as pd
import json
import hashlib
from utils.plot_utils import df_to_base64_plot, get_from_cache, save_to_cache

router = APIRouter()

@router.post("/")
async def generate_plot(payload: dict):
    """
    Generate multiple plots from provided data.
    
    Payload structure:
    {
        "data": [{"col1": val1, "col2": val2, ...}, ...],  # For single dataset mode
        "compareData": [  # For compare mode
            {"data": [...], "name": "Dataset 1"},
            {"data": [...], "name": "Dataset 2"}
        ],
        "compareMode": true/false,  # Indicates compare mode
        "plots": [
            {
                "type": "scatter",
                "x": "column_name",
                "y": "column_name",
                "hue": "column_name",  # Optional
                "title": "Plot Title",  # Optional
                "customizations": {
                    "color_scheme": "deep",
                    "grid": true,
                    "legend": true,
                    "bins": 30,
                    "window": 5,
                    "lag": 1,
                    "cluster": false,
                    "show_pvalues": false
                }
            },
            ...
        ]
    }
    
    Returns:
    {
        "plots": [
            {
                "type": "scatter",
                "image": "base64_encoded_image",
                "columns": ["x_col", "y_col", "hue_col"],
                "title": "Plot Title",
                "customizations": {...}
            },
            ...
        ]
    }
    """
    plots = payload.get("plots", [])
    compare_mode = payload.get("compareMode", False)
    session_id = payload.get("session_id", None)  # used for plot cache scoping
    
    if compare_mode:
        compare_data = payload.get("compareData", [])
        if not compare_data:
            return {"error": "No compare data provided in compare mode."}
        
        dfs = []
        names = []
        for i, cd in enumerate(compare_data):
            if not isinstance(cd, dict) or "data" not in cd:
                return {"error": f"Invalid compare data format for dataset {i+1}."}
            try:
                dfs.append(pd.DataFrame(cd["data"]))
                names.append(cd.get("name", f"Dataset {i+1}"))
            except Exception as e:
                return {"error": f"Failed to create DataFrame for {names[-1]}: {str(e)}"}
    else:
        data = payload.get("data", [])
        if not data:
            return {"error": "No data provided."}
        try:
            df = pd.DataFrame(data)
        except Exception as e:
            return {"error": f"Failed to create DataFrame: {str(e)}"}
        dfs = None
        names = None

    results = []

    for p in plots:
        try:
            plot_type = p.get("type", "hist")
            x = p.get("x")
            y = p.get("y")
            hue = p.get("hue")
            title = p.get("title", None)
            custom = p.get("customizations", {})

            # ===== VALIDATION BY PLOT TYPE =====
            
            # Plots that require both X and Y
            if plot_type in ["scatter", "line", "bar", "area", "regression", "kde2d", "moving_avg", "pie"]:
                if x is None or y is None:
                    results.append({
                        "type": plot_type, 
                        "error": f"{plot_type} requires both X and Y columns."
                    })
                    continue
            
            # Plots that need only X column (single variable plots)
            if plot_type in ["hist", "density", "ecdf", "lag", "autocorr", "count", "strip", "swarm", "bar_agg"]:
                if x is None:
                    results.append({
                        "type": plot_type,
                        "error": f"{plot_type} requires an X column."
                    })
                    continue
            
            # Special validation for pairplot (no x/y needed, uses all numeric)
            if plot_type == "pairplot":
                if not compare_mode:
                    numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
                    if len(numeric_cols) < 2:
                        results.append({
                            "type": plot_type, 
                            "error": "Pairplot requires at least 2 numeric columns in the dataset."
                        })
                        continue
                else:
                    # For compare mode, not supported yet
                    results.append({
                        "type": plot_type, 
                        "error": "Pairplot not supported in compare mode."
                    })
                    continue
            
            # Special validation for radar chart (needs 3+ numeric columns)
            if plot_type == "radar":
                if not compare_mode:
                    numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
                    if len(numeric_cols) < 3:
                        results.append({
                            "type": plot_type, 
                            "error": "Radar chart requires at least 3 numeric columns in the dataset."
                        })
                        continue
                else:
                    results.append({
                        "type": plot_type, 
                        "error": "Radar chart not supported in compare mode."
                    })
                    continue
            
            # Special validation for box/violin combo and box/violin plots
            if plot_type in ["box", "violin", "box_violin"]:
                # These can work with just X (categorical) or X + Y
                if x is None:
                    results.append({
                        "type": plot_type,
                        "error": f"{plot_type} requires at least an X column."
                    })
                    continue
            
            # For compare_dist - specific to compare mode
            if plot_type == "compare_dist":
                if not compare_mode:
                    results.append({
                        "type": plot_type,
                        "error": "compare_dist requires compare mode."
                    })
                    continue
                if x is None:
                    results.append({
                        "type": plot_type,
                        "error": "compare_dist requires an X column to compare."
                    })
                    continue
            
            # Plots that don't need x/y validation (use all columns)
            # heatmap, corr_advanced, parallel, treemap
            
            # Validate column existence (skip for plots that don't need x/y)
            if compare_mode:
                # In compare mode, validate x/y/hue in all dfs
                for i, d in enumerate(dfs):
                    if x and x not in d.columns:
                        results.append({
                            "type": plot_type, 
                            "error": f"X column '{x}' not found in {names[i]}. Available: {', '.join(d.columns)}"
                        })
                        continue
                    if y and y not in d.columns:
                        results.append({
                            "type": plot_type, 
                            "error": f"Y column '{y}' not found in {names[i]}. Available: {', '.join(d.columns)}"
                        })
                        continue
                    if hue and hue not in d.columns:
                        results.append({
                            "type": plot_type, 
                            "error": f"Hue column '{hue}' not found in {names[i]}. Available: {', '.join(d.columns)}"
                        })
                        continue
            else:
                if x and x not in df.columns:
                    results.append({
                        "type": plot_type, 
                        "error": f"X column '{x}' not found in dataset. Available columns: {', '.join(df.columns)}"
                    })
                    continue
                
                if y and y not in df.columns:
                    results.append({
                        "type": plot_type, 
                        "error": f"Y column '{y}' not found in dataset. Available columns: {', '.join(df.columns)}"
                    })
                    continue
                
                if hue and hue not in df.columns:
                    results.append({
                        "type": plot_type, 
                        "error": f"Hue column '{hue}' not found in dataset. Available columns: {', '.join(df.columns)}"
                    })
                    continue

            # ===== GENERATE PLOT =====
            # Build a canonical plot configuration and check per-session cache first
            plot_config = {
                "type": plot_type,
                "x": x,
                "y": y,
                "hue": hue,
                "title": title,
                "custom": custom,
                "compare_mode": compare_mode,
                "compare_names": names,
            }
            cfg_json = json.dumps(plot_config, sort_keys=True, default=str)
            cfg_hash = hashlib.md5(cfg_json.encode()).hexdigest()
            cache_key = f"{session_id or 'anon'}:{cfg_hash}"

            img_b64 = get_from_cache(cache_key)
            if not img_b64:
                img_b64 = df_to_base64_plot(
                    df=df if not compare_mode else None,
                    dfs=dfs if compare_mode else None,
                    names=names if compare_mode else None,
                    session_id=session_id,
                    plot_type=plot_type,
                    x=x,
                    y=y,
                    hue=hue,
                    title=title,
                    color_scheme=custom.get("color_scheme", "deep"),
                    grid=custom.get("grid", True),
                    legend=custom.get("legend", True),
                    bins=custom.get("bins", 30),
                    window=custom.get("window", 5),
                    lag=custom.get("lag", 1),
                    cluster=custom.get("cluster", False),
                    show_pvalues=custom.get("show_pvalues", False)
                )
                try:
                    save_to_cache(cache_key, img_b64)
                except Exception:
                    pass

            results.append({
                "type": plot_type,
                "image": img_b64,
                "columns": [x, y, hue],
                "title": title,
                "customizations": custom
            })
            
        except Exception as e:
            # Include traceback for debugging
            import traceback
            error_details = traceback.format_exc()
            print(f"Error generating plot: {error_details}")
            
            results.append({
                "type": p.get("type", "unknown"), 
                "error": f"Unexpected error: {str(e)}"
            })

    return {"plots": results}