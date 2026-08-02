import { useEffect, useState } from "react";
import { Icons } from "./icons.jsx";

// Small toggle button to drop into a card-title row. Pass the boolean
// `expanded` state and a setter — kept dumb on purpose so pages can manage
// their own state and reset it (e.g. on session switch) if they need to.
export function ExpandButton({ expanded, onClick, style }) {
  return (
    <button
      onClick={onClick}
      title={expanded ? "Collapse" : "Expand"}
      aria-label={expanded ? "Collapse view" : "Expand view"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text3)",
        padding: 4,
        marginLeft: 8,
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={Icons[expanded ? "collapse" : "expand"]} />
      </svg>
    </button>
  );
}

// Wraps a card so that, when `expanded` is true, its content renders inside
// a fullscreen overlay instead of its normal inline spot. Same children in
// both states — only the outer container changes — so callers don't need
// to duplicate table/preview markup for the expanded view.
export function ExpandableCard({ expanded, onClose, className = "card", style, children }) {
  // Esc to close + lock background scroll while expanded
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded, onClose]);

  if (!expanded) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fadeIn 0.15s ease",
      }}
      onClick={onClose}
    >
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          maxWidth: 1400,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...style,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Convenience hook so pages don't each hand-roll the same useState.
export function useExpandable(initial = false) {
  const [expanded, setExpanded] = useState(initial);
  return {
    expanded,
    toggle: () => setExpanded((e) => !e),
    close: () => setExpanded(false),
  };
}
