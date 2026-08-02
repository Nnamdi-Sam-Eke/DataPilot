import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE } from "../DataPilotContext.jsx";

export default function ApiFallback({ onClose }) {
  const [retrying, setRetrying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const closedRef = useRef(false);

  // Poll /health every 4 seconds. The moment it comes back up, close the modal.
  useEffect(() => {
    closedRef.current = false;

    const check = async () => {
      if (closedRef.current) return;
      try {
        const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
        if (res.ok && !closedRef.current) {
          closedRef.current = true;
          onClose();
        }
      } catch {
        // still down — keep polling
      }
    };

    check();
    const interval = setInterval(check, 4000);
    return () => {
      clearInterval(interval);
    };
  }, [onClose]);

  // Manual retry button
  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    setAttempts((a) => a + 1);
    try {
      const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
      if (res.ok) {
        closedRef.current = true;
        onClose();
      }
    } catch {
      // still down
    } finally {
      setRetrying(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="api-fallback-backdrop"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--overlay-light, rgba(0,0,0,0.45))",
            backdropFilter: "blur(8px)",
          }}
        />

        {/* Modal */}
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ duration: 0.22 }}
          style={{
            position: "relative",
            width: "calc(100% - 32px)",
            maxWidth: 420,
            background: "var(--bg2, #111214)",
            borderRadius: 18,
            padding: 24,
            border: "1px solid var(--border-bright, rgba(255,255,255,0.08))",
            boxShadow: "0 25px 60px var(--overlay-dark, rgba(0,0,0,0.6))",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {/* Icon */}
          <div style={{
            width: 50, height: 50, borderRadius: 14,
            background: "rgba(var(--red), 0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="var(--red, #f87171)" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* Text */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text, #f3f4f6)" }}>
              Backend unreachable
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text3, #9ca3af)", lineHeight: 1.6 }}>
              {attempts > 0
                ? "Still unreachable. Retrying automatically — this usually resolves in under a minute."
                : "The server is down or restarting. Checking every few seconds and will reconnect automatically."}
            </p>
          </div>

          {/* Retry button only — no Dismiss */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleRetry}
              disabled={retrying}
              style={{
                padding: "9px 20px",
                borderRadius: 10,
                border: "none",
                background: "var(--accent, #6366f1)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 13,
                cursor: retrying ? "not-allowed" : "pointer",
                opacity: retrying ? 0.7 : 1,
                boxShadow: "0 8px 22px var(--accent-glow, rgba(99,102,241,0.35))",
                transition: "opacity 0.15s ease",
              }}
            >
              {retrying ? "Checking…" : "Retry now"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}