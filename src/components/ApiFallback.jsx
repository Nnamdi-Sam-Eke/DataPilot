import React from "react";

export default function ApiFallback({ message, onRetry }) {
  return (
    <div style={{ padding: 14, borderRadius: 10, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)", display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(248,113,113,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Could not reach the API</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4, wordBreak: "break-word" }}>{message || "Network request failed. Please check your connection or try again."}</div>
      </div>
      {onRetry && (
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="btn-primary" onClick={onRetry} style={{ padding: "8px 12px" }}>Retry</button>
        </div>
      )}
    </div>
  );
}
