import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.ioff()

import seaborn as sns
import pandas as pd
import numpy as np
import io
import base64
from typing import Optional, List
import warnings
import hashlib
import logging
from functools import lru_cache

warnings.filterwarnings('ignore')
logger = logging.getLogger(__name__)

PLOT_CACHE = {}
CACHE_MAX_SIZE = 100

@lru_cache(maxsize=100)
def get_cached_plot_hash(plot_type, x, y, hue, title, color_scheme, bins, window):
    cache_key = f"{plot_type}:{x}:{y}:{hue}:{title}:{color_scheme}:{bins}:{window}"
    return hashlib.md5(cache_key.encode()).hexdigest()

def get_from_cache(key):
    return PLOT_CACHE.get(key)

def save_to_cache(key, val):
    if len(PLOT_CACHE) >= CACHE_MAX_SIZE:
        del PLOT_CACHE[next(iter(PLOT_CACHE))]
    PLOT_CACHE[key] = val

def df_to_base64_plot(
    df=None, dfs=None, names=None,
    plot_type="hist", x=None, y=None, hue=None, title=None,
    color_scheme="deep", grid=True, legend=True,
    bins=30, window=5, lag=1, cluster=False, show_pvalues=False
):
    cache_key = None
    if df is not None and dfs is None:
        cache_key = get_cached_plot_hash(plot_type, str(x), str(y), str(hue),
                                          str(title), color_scheme, bins, window)
        cached = get_from_cache(cache_key)
        if cached:
            return cached

    plt.close("all")

    SEABORN_PAL = {"deep","muted","pastel","bright","dark","colorblind"}
    MPL_CMAPS   = {"viridis","plasma","coolwarm","magma","cividis","inferno"}
    palette     = color_scheme.lower() if color_scheme.lower() in SEABORN_PAL else "deep"
    heatmap_cmap = color_scheme.lower() if color_scheme.lower() in MPL_CMAPS else "viridis"

    try:
        if plot_type == "compare_dist":
            if dfs is None or len(dfs) < 2:
                raise ValueError("compare_dist requires at least 2 datasets")
            names = names or [f"Dataset {i+1}" for i in range(len(dfs))]
            fig, ax = plt.subplots(figsize=(10, 6))
            sns.set_style("whitegrid" if grid else "white")
            colors = sns.color_palette(palette, len(dfs))
            for i, d in enumerate(dfs):
                sns.kdeplot(data=d, x=x, fill=True, alpha=0.3,
                            label=names[i], ax=ax, color=colors[i])
            ax.set_xlabel(x); ax.set_ylabel("Density")
            if legend: ax.legend()
            if title: ax.set_title(title, fontsize=14, fontweight="bold", pad=12)

        elif plot_type == "pairplot":
            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()[:6]
            if len(numeric_cols) < 2:
                raise ValueError("Need at least 2 numeric columns")
            plt.close("all")
            pair_df = df[numeric_cols + ([hue] if hue and hue in df.columns else [])].dropna()
            if len(pair_df) > 1000:
                pair_df = pair_df.sample(1000, random_state=42)
            g = sns.pairplot(pair_df, hue=(hue if hue and hue in df.columns else None),
                             palette=palette, plot_kws={"alpha": 0.5})
            if title: g.fig.suptitle(title, y=1.02, fontsize=14, fontweight="bold")
            buf = io.BytesIO()
            g.savefig(buf, format="png", dpi=100, bbox_inches="tight", facecolor="white")
            buf.seek(0)
            img_b64 = base64.b64encode(buf.read()).decode()
            plt.close("all")
            if cache_key: save_to_cache(cache_key, img_b64)
            return img_b64

        else:
            if df is None:
                raise ValueError("df is required")

            fig, ax = plt.subplots(figsize=(10, 6))
            sns.set_style("whitegrid" if grid else "white")

            if plot_type == "hist":
                if not x or x not in df.columns: raise ValueError(f"Column '{x}' not found")
                sns.histplot(data=df, x=x, bins=bins, kde=True, ax=ax, color="steelblue")
                ax.set_xlabel(x); ax.set_ylabel("Frequency")

            elif plot_type == "scatter":
                for col in [x, y]:
                    if not col or col not in df.columns: raise ValueError(f"Column '{col}' not found")
                sns.scatterplot(data=df, x=x, y=y,
                                hue=(hue if hue and hue in df.columns else None),
                                palette=palette, ax=ax, s=60, alpha=0.6)
                ax.set_xlabel(x); ax.set_ylabel(y)

            elif plot_type == "line":
                for col in [x, y]:
                    if not col or col not in df.columns: raise ValueError(f"Column '{col}' not found")
                sns.lineplot(data=df, x=x, y=y,
                             hue=(hue if hue and hue in df.columns else None),
                             palette=palette, ax=ax, linewidth=2.5)
                ax.set_xlabel(x); ax.set_ylabel(y)

            elif plot_type == "bar":
                for col in [x, y]:
                    if not col or col not in df.columns: raise ValueError(f"Column '{col}' not found")
                plot_df = df.groupby(x)[y].mean().reset_index().nlargest(20, y) if df[x].nunique() > 25 else df
                sns.barplot(data=plot_df, x=x, y=y,
                            hue=(hue if hue and hue in df.columns else None),
                            palette=palette, ax=ax)
                ax.set_xlabel(x); ax.set_ylabel(y)
                plt.xticks(rotation=45, ha="right")

            elif plot_type == "box":
                if x and x in df.columns and y and y in df.columns:
                    sns.boxplot(data=df, x=x, y=y,
                                hue=(hue if hue and hue in df.columns else None),
                                palette=palette, ax=ax)
                elif x and x in df.columns:
                    sns.boxplot(data=df, y=x, palette=palette, ax=ax)
                else:
                    raise ValueError("Box plot requires at least X column")
                ax.set_xlabel(x or ""); ax.set_ylabel(y or "Value")

            elif plot_type == "violin":
                if x and x in df.columns and y and y in df.columns:
                    sns.violinplot(data=df, x=x, y=y,
                                   hue=(hue if hue and hue in df.columns else None),
                                   palette=palette, ax=ax)
                elif x and x in df.columns:
                    sns.violinplot(data=df, y=x, palette=palette, ax=ax)
                else:
                    raise ValueError("Violin plot requires at least X column")
                ax.set_xlabel(x or ""); ax.set_ylabel(y or "Value")

            elif plot_type == "density":
                if not x or x not in df.columns: raise ValueError(f"Column '{x}' not found")
                if hue and hue in df.columns:
                    for cat in df[hue].unique():
                        sns.kdeplot(data=df[df[hue]==cat], x=x, fill=True,
                                    alpha=0.4, label=str(cat), ax=ax)
                    ax.legend(title=hue)
                else:
                    sns.kdeplot(data=df, x=x, fill=True, ax=ax, color="steelblue")
                ax.set_xlabel(x); ax.set_ylabel("Density")

            elif plot_type == "heatmap":
                numeric_df = df.select_dtypes(include=["number"])
                if numeric_df.empty: raise ValueError("No numeric columns for heatmap")
                corr = numeric_df.corr()
                plt.close("all")
                n = len(corr)
                fig, ax = plt.subplots(figsize=(max(8, n*1.1), max(6, n*0.9)))
                sns.heatmap(corr, annot=True, fmt=".2f", cmap=heatmap_cmap,
                            center=0, square=True, linewidths=0.5, ax=ax,
                            cbar_kws={"shrink": 0.8})

            elif plot_type == "pie":
                if not x or x not in df.columns: raise ValueError(f"Column '{x}' not found")
                plt.close("all")
                fig, ax = plt.subplots(figsize=(9, 7))
                pie_data = df.groupby(x)[y].sum() if (y and y in df.columns) else df[x].value_counts()
                if len(pie_data) > 12: pie_data = pie_data.nlargest(12)
                colors = sns.color_palette(palette, len(pie_data))
                wedges, texts, autotexts = ax.pie(
                    pie_data.values, labels=pie_data.index,
                    autopct='%1.1f%%', colors=colors, startangle=90, pctdistance=0.85
                )
                for t in autotexts: t.set_fontsize(9)
                ax.axis("equal")

            elif plot_type == "donut":
                if not x or x not in df.columns: raise ValueError(f"Column '{x}' not found")
                plt.close("all")
                fig, ax = plt.subplots(figsize=(9, 7))
                pie_data = df.groupby(x)[y].sum() if (y and y in df.columns) else df[x].value_counts()
                if len(pie_data) > 12: pie_data = pie_data.nlargest(12)
                colors = sns.color_palette(palette, len(pie_data))
                ax.pie(pie_data.values, labels=pie_data.index, autopct='%1.1f%%',
                       colors=colors, startangle=90, wedgeprops=dict(width=0.55))
                ax.axis("equal")

            elif plot_type == "count":
                if not x or x not in df.columns: raise ValueError(f"Column '{x}' not found")
                order = df[x].value_counts().index[:20]
                sns.countplot(data=df, x=x, palette=palette, ax=ax, order=order,
                              hue=(hue if hue and hue in df.columns else None))
                ax.set_xlabel(x); ax.set_ylabel("Count")
                plt.xticks(rotation=45, ha="right")

            elif plot_type == "regression":
                if not x or x not in df.columns: raise ValueError(f"Column '{x}' not found")
                if not y or y not in df.columns: raise ValueError(f"Column '{y}' not found")
                df_reg = df[[x, y]].copy()
                df_reg[x] = pd.to_numeric(df_reg[x], errors="coerce")
                df_reg[y] = pd.to_numeric(df_reg[y], errors="coerce")
                df_reg = df_reg.dropna()
                if len(df_reg) < 2: raise ValueError("Not enough numeric data for regression")
                if len(df_reg) > 5000: df_reg = df_reg.sample(5000, random_state=42)
                sns.regplot(data=df_reg, x=x, y=y, ax=ax,
                            scatter_kws={"alpha": 0.4, "s": 30, "color": "steelblue"},
                            line_kws={"color": "red", "linewidth": 2})
                ax.set_xlabel(x); ax.set_ylabel(y)

            elif plot_type == "area":
                for col in [x, y]:
                    if not col or col not in df.columns: raise ValueError(f"Column '{col}' not found")
                df_s = df[[x, y]].dropna().sort_values(x)
                ax.fill_between(df_s[x], df_s[y], alpha=0.5, color="steelblue")
                ax.plot(df_s[x], df_s[y], linewidth=2, color="steelblue")
                ax.set_xlabel(x); ax.set_ylabel(y)

            elif plot_type == "moving_avg":
                for col in [x, y]:
                    if not col or col not in df.columns: raise ValueError(f"Column '{col}' not found")
                df_s = df[[x, y]].dropna().sort_values(x)
                ax.plot(df_s[x], df_s[y], alpha=0.3, label="Original", linewidth=1, color="gray")
                ma = df_s[y].rolling(window=window, center=True).mean()
                ax.plot(df_s[x], ma, linewidth=2.5, label=f"{window}-period MA", color="steelblue")
                ax.set_xlabel(x); ax.set_ylabel(y); ax.legend()

            elif plot_type == "strip":
                if not x or x not in df.columns: raise ValueError(f"Column '{x}' not found")
                if y and y in df.columns:
                    sns.stripplot(data=df, x=x, y=y,
                                  hue=(hue if hue and hue in df.columns else None),
                                  palette=palette, ax=ax, alpha=0.6)
                else:
                    sns.stripplot(data=df, y=x, palette=palette, ax=ax, alpha=0.6)

            elif plot_type == "bubble":
                for col in [x, y]:
                    if not col or col not in df.columns: raise ValueError(f"Column '{col}' not found")
                size_vals = 100
                if hue and hue in df.columns and pd.api.types.is_numeric_dtype(df[hue]):
                    mn, mx = df[hue].min(), df[hue].max()
                    size_vals = ((df[hue] - mn) / (mx - mn + 1e-9)) * 500 + 20
                ax.scatter(df[x], df[y], s=size_vals, alpha=0.6,
                           c=range(len(df)), cmap=heatmap_cmap)
                ax.set_xlabel(x); ax.set_ylabel(y)

            else:
                ax.text(0.5, 0.5, f"Unsupported plot type: {plot_type}",
                        ha="center", va="center", transform=ax.transAxes, fontsize=12)

            # Title + legend
            if title:
                ax.set_title(title, fontsize=14, fontweight="bold", pad=12)
            if legend and hue and hue in df.columns and ax.get_legend():
                ax.legend(title=hue, loc="best")
            elif not legend and ax.get_legend():
                ax.get_legend().remove()

        # Encode
        plt.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=110, bbox_inches="tight", facecolor="white")
        buf.seek(0)
        img_b64 = base64.b64encode(buf.read()).decode()
        if cache_key: save_to_cache(cache_key, img_b64)
        logger.info(f"✅ Generated {plot_type} plot")
        return img_b64

    except Exception as e:
        logger.error(f"❌ {plot_type} error: {e}")
        plt.close("all")
        fig, ax = plt.subplots(figsize=(10, 5))
        ax.text(0.5, 0.5, f"Error:\n{str(e)}", ha="center", va="center",
                transform=ax.transAxes, fontsize=11, color="red")
        ax.axis("off")
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=100, bbox_inches="tight", facecolor="white")
        buf.seek(0)
        return base64.b64encode(buf.read()).decode()

    finally:
        plt.close("all")