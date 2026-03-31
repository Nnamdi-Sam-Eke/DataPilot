"""
Code generation utilities for creating Python analysis templates
"""

def generate_python_code(df_columns, template="analysis"):
    """
    Generates Python code templates based on dataset columns.
    
    Args:
        df_columns: List of column names in the dataset
        template: Type of template to generate (analysis, ml, visualization, cleaning)
    
    Returns:
        String containing Python code
    """
    
    # Get column names
    columns_str = ", ".join([f"'{col}'" for col in df_columns[:5]])  # Show first 5 columns
    if len(df_columns) > 5:
        columns_str += ", ..."
    
    # Detect likely numeric and categorical columns (simplified heuristic)
    # In production, you'd pass actual column types from the backend
    numeric_cols = [col for col in df_columns if any(keyword in col.lower() 
                    for keyword in ['price', 'amount', 'value', 'count', 'total', 'age', 'score', 'revenue'])]
    categorical_cols = [col for col in df_columns if any(keyword in col.lower() 
                        for keyword in ['category', 'type', 'name', 'id', 'status', 'region'])]
    
    # Use first columns as examples if heuristic doesn't find any
    if not numeric_cols and len(df_columns) >= 1:
        numeric_cols = [df_columns[0]]
    if not categorical_cols and len(df_columns) >= 2:
        categorical_cols = [df_columns[1] if len(df_columns) > 1 else df_columns[0]]
    
    numeric_example = numeric_cols[0] if numeric_cols else "column_name"
    categorical_example = categorical_cols[0] if categorical_cols else "category_column"
    
    # Templates
    if template == "analysis":
        code = f"""# Data Analysis Template
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Load your data
df = pd.read_csv("your_dataset.csv")

# ================== DATA EXPLORATION ==================
print("Dataset Shape:", df.shape)
print("\\nColumn Names:", df.columns.tolist())
print("\\nData Types:")
print(df.dtypes)

# Quick overview
print("\\n" + "="*50)
print("FIRST FEW ROWS:")
print(df.head())

print("\\n" + "="*50)
print("STATISTICAL SUMMARY:")
print(df.describe())

# Check for missing values
print("\\n" + "="*50)
print("MISSING VALUES:")
print(df.isnull().sum())

# ================== DATA ANALYSIS ==================

# Correlation matrix (for numeric columns)
numeric_df = df.select_dtypes(include=['number'])
if not numeric_df.empty:
    print("\\n" + "="*50)
    print("CORRELATION MATRIX:")
    print(numeric_df.corr())
    
    # Visualize correlations
    plt.figure(figsize=(10, 8))
    sns.heatmap(numeric_df.corr(), annot=True, cmap='coolwarm', center=0)
    plt.title('Correlation Heatmap')
    plt.tight_layout()
    plt.savefig('correlation_heatmap.png', dpi=300, bbox_inches='tight')
    plt.show()

# Value counts for categorical columns
categorical_cols = df.select_dtypes(include=['object']).columns
for col in categorical_cols[:3]:  # First 3 categorical columns
    print(f"\\n{{'='*50}}")
    print(f"VALUE COUNTS FOR {{col}}:")
    print(df[col].value_counts().head(10))

# ================== VISUALIZATIONS ==================

# Distribution plot for numeric column
if '{numeric_example}' in df.columns:
    plt.figure(figsize=(10, 6))
    sns.histplot(data=df, x='{numeric_example}', kde=True)
    plt.title('Distribution of {numeric_example}')
    plt.tight_layout()
    plt.savefig('distribution_{numeric_example}.png', dpi=300, bbox_inches='tight')
    plt.show()

# Group by analysis
if '{categorical_example}' in df.columns and '{numeric_example}' in df.columns:
    grouped = df.groupby('{categorical_example}')['{numeric_example}'].agg(['mean', 'median', 'std', 'count'])
    print(f"\\n{{'='*50}}")
    print(f"GROUPED ANALYSIS - {{'{numeric_example}'}} by {{'{categorical_example}'}}:")
    print(grouped)
    
    # Bar plot
    plt.figure(figsize=(12, 6))
    grouped['mean'].plot(kind='bar')
    plt.title(f'Average {numeric_example} by {categorical_example}')
    plt.ylabel('{numeric_example}')
    plt.xlabel('{categorical_example}')
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.savefig('grouped_analysis.png', dpi=300, bbox_inches='tight')
    plt.show()

print("\\n" + "="*50)
print("Analysis complete! Check the generated PNG files.")
"""
    
    elif template == "ml":
        code = f"""# Machine Learning Template
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import classification_report, confusion_matrix, mean_squared_error, r2_score
import matplotlib.pyplot as plt
import seaborn as sns

# Load data
df = pd.read_csv("your_dataset.csv")

print("Dataset loaded:", df.shape)
print("\\nColumns:", df.columns.tolist())

# ================== DATA PREPARATION ==================

# Handle missing values
print("\\nMissing values before cleaning:")
print(df.isnull().sum())

# Option 1: Drop rows with missing values
# df = df.dropna()

# Option 2: Fill missing values
numeric_cols = df.select_dtypes(include=['number']).columns
df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].median())

categorical_cols = df.select_dtypes(include=['object']).columns
df[categorical_cols] = df[categorical_cols].fillna(df[categorical_cols].mode().iloc[0])

print("\\nMissing values after cleaning:")
print(df.isnull().sum())

# ================== FEATURE ENGINEERING ==================

# Encode categorical variables
label_encoders = {{}}
for col in categorical_cols:
    if col != 'target_column':  # Don't encode your target if it's categorical
        le = LabelEncoder()
        df[col + '_encoded'] = le.fit_transform(df[col])
        label_encoders[col] = le

# Define features and target
# MODIFY THESE based on your dataset:
X = df.select_dtypes(include=['number']).drop(['target_column'], axis=1, errors='ignore')
y = df['target_column']  # Replace with your actual target column

# Split data
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Scale features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

print(f"\\nTraining set size: {{X_train.shape[0]}}")
print(f"Test set size: {{X_test.shape[0]}}")

# ================== MODEL TRAINING ==================

# Determine if classification or regression based on target
is_classification = y.dtype == 'object' or y.nunique() < 20

if is_classification:
    print("\\n[Classification Task Detected]")
    # Encode target if needed
    if y.dtype == 'object':
        le_target = LabelEncoder()
        y_train = le_target.fit_transform(y_train)
        y_test = le_target.transform(y_test)
    
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train_scaled, y_train)
    
    # Predictions
    y_pred = model.predict(X_test_scaled)
    
    # Evaluation
    print("\\n" + "="*50)
    print("CLASSIFICATION REPORT:")
    print(classification_report(y_test, y_pred))
    
    print("\\nCONFUSION MATRIX:")
    cm = confusion_matrix(y_test, y_pred)
    print(cm)
    
    # Plot confusion matrix
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues')
    plt.title('Confusion Matrix')
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.tight_layout()
    plt.savefig('confusion_matrix.png', dpi=300, bbox_inches='tight')
    plt.show()
    
else:
    print("\\n[Regression Task Detected]")
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train_scaled, y_train)
    
    # Predictions
    y_pred = model.predict(X_test_scaled)
    
    # Evaluation
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_test, y_pred)
    
    print("\\n" + "="*50)
    print("REGRESSION METRICS:")
    print(f"RMSE: {{rmse:.4f}}")
    print(f"R² Score: {{r2:.4f}}")
    
    # Plot predictions vs actual
    plt.figure(figsize=(10, 6))
    plt.scatter(y_test, y_pred, alpha=0.5)
    plt.plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--', lw=2)
    plt.xlabel('Actual Values')
    plt.ylabel('Predicted Values')
    plt.title('Predictions vs Actual Values')
    plt.tight_layout()
    plt.savefig('predictions_vs_actual.png', dpi=300, bbox_inches='tight')
    plt.show()

# Feature importance
feature_importance = pd.DataFrame({{
    'feature': X.columns,
    'importance': model.feature_importances_
}}).sort_values('importance', ascending=False)

print("\\n" + "="*50)
print("TOP 10 MOST IMPORTANT FEATURES:")
print(feature_importance.head(10))

# Plot feature importance
plt.figure(figsize=(10, 6))
feature_importance.head(15).plot(x='feature', y='importance', kind='barh')
plt.title('Feature Importance')
plt.xlabel('Importance')
plt.tight_layout()
plt.savefig('feature_importance.png', dpi=300, bbox_inches='tight')
plt.show()

print("\\n" + "="*50)
print("Model training complete! Check the generated PNG files.")
"""
    
    elif template == "visualization":
        code = f"""# Data Visualization Template
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go

# Set style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (12, 8)

# Load data
df = pd.read_csv("your_dataset.csv")

print("Creating visualizations for dataset with shape:", df.shape)

# ================== BASIC PLOTS ==================

# 1. Distribution plots for numeric columns
numeric_cols = df.select_dtypes(include=['number']).columns
fig, axes = plt.subplots(2, 2, figsize=(15, 10))
axes = axes.ravel()

for idx, col in enumerate(numeric_cols[:4]):
    sns.histplot(data=df, x=col, kde=True, ax=axes[idx])
    axes[idx].set_title(f'Distribution of {{col}}')

plt.tight_layout()
plt.savefig('distributions.png', dpi=300, bbox_inches='tight')
plt.show()

# 2. Correlation heatmap
if len(numeric_cols) > 1:
    plt.figure(figsize=(12, 10))
    correlation_matrix = df[numeric_cols].corr()
    sns.heatmap(correlation_matrix, annot=True, cmap='coolwarm', center=0, 
                square=True, linewidths=1, fmt='.2f')
    plt.title('Correlation Heatmap', fontsize=16, fontweight='bold')
    plt.tight_layout()
    plt.savefig('correlation_heatmap.png', dpi=300, bbox_inches='tight')
    plt.show()

# 3. Box plots for outlier detection
if len(numeric_cols) >= 2:
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    for idx, col in enumerate(numeric_cols[:2]):
        sns.boxplot(y=df[col], ax=axes[idx])
        axes[idx].set_title(f'Box Plot - {{col}}')
    plt.tight_layout()
    plt.savefig('boxplots.png', dpi=300, bbox_inches='tight')
    plt.show()

# ================== CATEGORICAL ANALYSIS ==================

categorical_cols = df.select_dtypes(include=['object']).columns

if len(categorical_cols) > 0:
    # Count plots
    fig, axes = plt.subplots(1, min(2, len(categorical_cols)), figsize=(15, 6))
    if len(categorical_cols) == 1:
        axes = [axes]
    
    for idx, col in enumerate(categorical_cols[:2]):
        top_categories = df[col].value_counts().head(10)
        top_categories.plot(kind='bar', ax=axes[idx])
        axes[idx].set_title(f'Top Categories - {{col}}')
        axes[idx].set_xlabel(col)
        axes[idx].set_ylabel('Count')
        axes[idx].tick_params(axis='x', rotation=45)
    
    plt.tight_layout()
    plt.savefig('categorical_analysis.png', dpi=300, bbox_inches='tight')
    plt.show()

# ================== ADVANCED VISUALIZATIONS ==================

# Pairplot (if you have numeric columns)
if len(numeric_cols) >= 2:
    print("\\nCreating pairplot (this may take a moment)...")
    sample_df = df[numeric_cols[:4]].sample(min(1000, len(df)))  # Sample for speed
    sns.pairplot(sample_df, diag_kind='kde')
    plt.savefig('pairplot.png', dpi=300, bbox_inches='tight')
    plt.show()

# Interactive plot with Plotly (if you have numeric columns)
if '{numeric_example}' in df.columns and '{categorical_example}' in df.columns:
    fig = px.scatter(df, x='{numeric_example}', y=numeric_cols[1] if len(numeric_cols) > 1 else '{numeric_example}',
                     color='{categorical_example}', size='{numeric_example}',
                     hover_data=df.columns[:5].tolist(),
                     title='Interactive Scatter Plot')
    fig.write_html('interactive_plot.html')
    print("\\nInteractive plot saved as 'interactive_plot.html'")

# Time series plot (if you have a date column)
date_cols = df.select_dtypes(include=['datetime64']).columns
if len(date_cols) == 0:
    # Try to convert object columns to datetime
    for col in df.select_dtypes(include=['object']).columns:
        try:
            df[col] = pd.to_datetime(df[col])
            date_cols = [col]
            break
        except:
            pass

if len(date_cols) > 0 and len(numeric_cols) > 0:
    df_sorted = df.sort_values(date_cols[0])
    plt.figure(figsize=(14, 6))
    plt.plot(df_sorted[date_cols[0]], df_sorted[numeric_cols[0]])
    plt.title(f'{{numeric_cols[0]}} over time')
    plt.xlabel(date_cols[0])
    plt.ylabel(numeric_cols[0])
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig('timeseries.png', dpi=300, bbox_inches='tight')
    plt.show()

print("\\n" + "="*50)
print("All visualizations created successfully!")
print("Check the generated PNG and HTML files in your directory.")
"""
    
    elif template == "cleaning":
        code = f"""# Data Cleaning Template
import pandas as pd
import numpy as np

# Load data
df = pd.read_csv("your_dataset.csv")

print("Original dataset shape:", df.shape)
print("\\nColumns:", df.columns.tolist())

# ================== INITIAL DATA ASSESSMENT ==================

print("\\n" + "="*50)
print("DATA TYPES:")
print(df.dtypes)

print("\\n" + "="*50)
print("MISSING VALUES:")
missing = df.isnull().sum()
missing_pct = 100 * df.isnull().sum() / len(df)
missing_table = pd.DataFrame({{'Missing': missing, 'Percent': missing_pct}})
print(missing_table[missing_table['Missing'] > 0].sort_values('Percent', ascending=False))

print("\\n" + "="*50)
print("DUPLICATE ROWS:", df.duplicated().sum())

# ================== DATA CLEANING STEPS ==================

# 1. Remove duplicate rows
df_cleaned = df.drop_duplicates()
print(f"\\nRemoved {{len(df) - len(df_cleaned)}} duplicate rows")

# 2. Handle missing values

# Strategy A: Drop columns with >50% missing values
threshold = 0.5
cols_to_drop = [col for col in df_cleaned.columns 
                if df_cleaned[col].isnull().sum() / len(df_cleaned) > threshold]
if cols_to_drop:
    print(f"\\nDropping columns with >50% missing values: {{cols_to_drop}}")
    df_cleaned = df_cleaned.drop(columns=cols_to_drop)

# Strategy B: Fill missing values appropriately
numeric_cols = df_cleaned.select_dtypes(include=['number']).columns
categorical_cols = df_cleaned.select_dtypes(include=['object']).columns

# Fill numeric columns with median
for col in numeric_cols:
    if df_cleaned[col].isnull().sum() > 0:
        median_value = df_cleaned[col].median()
        df_cleaned[col].fillna(median_value, inplace=True)
        print(f"Filled {{df_cleaned[col].isnull().sum()}} missing values in {{col}} with median: {{median_value:.2f}}")

# Fill categorical columns with mode
for col in categorical_cols:
    if df_cleaned[col].isnull().sum() > 0:
        mode_value = df_cleaned[col].mode()[0]
        df_cleaned[col].fillna(mode_value, inplace=True)
        print(f"Filled missing values in {{col}} with mode: {{mode_value}}")

# 3. Fix data types
# Convert date columns
for col in df_cleaned.columns:
    if 'date' in col.lower():
        try:
            df_cleaned[col] = pd.to_datetime(df_cleaned[col])
            print(f"\\nConverted {{col}} to datetime")
        except:
            print(f"\\nCouldn't convert {{col}} to datetime")

# 4. Remove outliers (using IQR method)
def remove_outliers(df, column):
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)
    IQR = Q3 - Q1
    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR
    
    initial_count = len(df)
    df_filtered = df[(df[column] >= lower_bound) & (df[column] <= upper_bound)]
    removed = initial_count - len(df_filtered)
    
    if removed > 0:
        print(f"Removed {{removed}} outliers from {{column}} ({{removed/initial_count*100:.1f}}%)")
    
    return df_filtered

# Apply outlier removal to numeric columns (optional - uncomment if needed)
# for col in numeric_cols:
#     df_cleaned = remove_outliers(df_cleaned, col)

# 5. Standardize text columns
for col in categorical_cols:
    # Remove leading/trailing whitespace
    df_cleaned[col] = df_cleaned[col].str.strip()
    
    # Convert to title case (optional)
    # df_cleaned[col] = df_cleaned[col].str.title()

# ================== FINAL ASSESSMENT ==================

print("\\n" + "="*50)
print("CLEANING SUMMARY:")
print(f"Original rows: {{len(df)}}")
print(f"Cleaned rows: {{len(df_cleaned)}}")
print(f"Rows removed: {{len(df) - len(df_cleaned)}} ({{(len(df) - len(df_cleaned))/len(df)*100:.1f}}%)")
print(f"\\nOriginal columns: {{len(df.columns)}}")
print(f"Cleaned columns: {{len(df_cleaned.columns)}}")

print("\\n" + "="*50)
print("REMAINING MISSING VALUES:")
print(df_cleaned.isnull().sum().sum())

# ================== SAVE CLEANED DATA ==================

output_file = "cleaned_dataset.csv"
df_cleaned.to_csv(output_file, index=False)
print(f"\\n" + "="*50)
print(f"Cleaned dataset saved as '{{output_file}}'")
print("Ready for analysis!")
"""
    
    else:
        code = f"""# Basic Python Template
import pandas as pd

# Load your data
df = pd.read_csv("your_dataset.csv")

# Available columns: {columns_str}

print("Dataset loaded successfully!")
print("Shape:", df.shape)
print("\\nFirst few rows:")
print(df.head())
"""
    
    return code