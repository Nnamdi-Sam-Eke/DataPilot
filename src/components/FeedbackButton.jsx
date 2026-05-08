import { useState, useEffect } from "react";
import { FiThumbsUp, FiThumbsDown, FiMessageSquare, FiX } from "react-icons/fi";

const CATEGORIES = [
  { value: "General",         emoji: "💬" },
  { value: "UI/UX",           emoji: "🎨" },
  { value: "Performance",     emoji: "⚡" },
  { value: "Feature Request", emoji: "✨" },
  { value: "Bug",             emoji: "🐛" },
];

export default function FeedbackButton() {
  const [open,       setOpen]       = useState(false);
  const [feedback,   setFeedback]   = useState("");
  const [category,   setCategory]   = useState("");
  const [rating,     setRating]     = useState(null);   // true | false | null
  const [toast,      setToast]      = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const reset = () => {
    setFeedback("");
    setCategory("");
    setRating(null);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!feedback.trim() || !category || rating === null) {
      setToast("Please fill in all fields before submitting.");
      return;
    }

    setSubmitting(true);

    // Build FormData manually — avoids double-sending "message"
    // that occurred when textarea had name="message" AND we manually
    // appended feedback below.
    const formData = new FormData();
    formData.append("category", category);
    formData.append("rating",   rating ? "Positive" : "Negative");
    formData.append("message",  feedback);

    try {
      const res = await fetch("https://formspree.io/f/mgodnyqa", {
        method:  "POST",
        body:    formData,
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        setToast("Feedback sent — thanks! 🙌");
        handleClose();
      } else {
        throw new Error("non-ok response");
      }
    } catch {
      setToast("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────── */}
      <div style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9998,
      }}>
        <button
          onClick={() => setOpen(o => !o)}
          title="Send feedback"
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            7,
            padding:        "9px 16px",
            borderRadius:   12,
            border:         "1px solid rgba(108,99,255,0.35)",
            background:     "var(--bg2)",
            color:          "var(--accent2)",
            fontSize:       12.5,
            fontWeight:     600,
            fontFamily:     "'DM Sans', sans-serif",
            cursor:         "pointer",
            boxShadow:      "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(108,99,255,0.12)",
            backdropFilter: "blur(12px)",
            transition:     "all 0.18s ease",
            letterSpacing:  "0.01em",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background    = "var(--bg3)";
            e.currentTarget.style.borderColor   = "rgba(108,99,255,0.6)";
            e.currentTarget.style.boxShadow     = "0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(108,99,255,0.2)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background    = "var(--bg2)";
            e.currentTarget.style.borderColor   = "rgba(108,99,255,0.35)";
            e.currentTarget.style.boxShadow     = "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(108,99,255,0.12)";
          }}
        >
          <FiMessageSquare size={13} />
          Feedback
        </button>
      </div>

      {/* ── Toast ───────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:       "fixed",
          bottom:         76,
          right:          24,
          zIndex:         10000,
          background:     "var(--bg2)",
          border:         "1px solid var(--border)",
          color:          "var(--text2)",
          fontSize:       12.5,
          fontFamily:     "'DM Sans', sans-serif",
          padding:        "10px 16px",
          borderRadius:   10,
          boxShadow:      "0 12px 32px rgba(0,0,0,0.5)",
          backdropFilter: "blur(12px)",
          maxWidth:       260,
          lineHeight:     1.5,
          animation:      "dp-fade-up 0.22s ease",
        }}>
          {toast}
        </div>
      )}

      {/* ── Backdrop ────────────────────────────────────────────────── */}
      {open && (
        <div
          onClick={handleClose}
          style={{
            position:   "fixed",
            inset:      0,
            background: "rgba(0,0,0,0.3)",
            backdropFilter: "blur(4px)",
            zIndex:     9998,
          }}
        />
      )}

      {/* ── Panel ───────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position:       "fixed",
          bottom:         76,
          right:          24,
          zIndex:         9999,
          width:          320,
          background:     "var(--bg2)",
          border:         "1px solid var(--border)",
          borderRadius:   18,
          boxShadow:      "0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.1)",
          backdropFilter: "blur(20px)",
          overflow:       "hidden",
          animation:      "dp-slide-up 0.22s ease",
        }}>

          {/* Header */}
          <div style={{
            display:       "flex",
            alignItems:    "center",
            justifyContent:"space-between",
            padding:       "16px 18px 14px",
            borderBottom:  "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width:        28,
                height:       28,
                borderRadius: 8,
                background:   "var(--accent-dim)",
                border:       "1px solid rgba(108,99,255,0.2)",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                color:        "var(--accent2)",
              }}>
                <FiMessageSquare size={13} />
              </div>
              <div>
                <div style={{
                  fontSize:   13.5,
                  fontWeight: 700,
                  color:      "var(--text)",
                  fontFamily: "'Syne', sans-serif",
                  lineHeight: 1.2,
                }}>
                  Send Feedback
                </div>
                <div style={{
                  fontSize:   10.5,
                  color:      "var(--text3)",
                  fontFamily: "'DM Mono', monospace",
                  marginTop:  1,
                }}>
                  beta · datapilot
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: "none",
                border:     "none",
                color:      "var(--text3)",
                cursor:     "pointer",
                padding:    4,
                borderRadius: 6,
                display:    "flex",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--text)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}
            >
              <FiX size={15} />
            </button>
          </div>

          {/* Form body */}
          <form onSubmit={handleSubmit} style={{ padding: "16px 18px 18px" }}>

            {/* Rating */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize:   11,
                fontWeight: 600,
                color:      "var(--text3)",
                fontFamily: "'DM Mono', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}>
                Overall
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { val: true,  Icon: FiThumbsUp,   active: "var(--green)",  label: "Good"    },
                  { val: false, Icon: FiThumbsDown,  active: "var(--red)",   label: "Needs work" },
                ].map(({ val, Icon, active, label }) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setRating(val)}
                    style={{
                      flex:        1,
                      display:     "flex",
                      alignItems:  "center",
                      justifyContent: "center",
                      gap:         6,
                      padding:     "8px 10px",
                      borderRadius: 9,
                      border:      `1px solid ${rating === val ? active : "var(--border)"}`,
                      background:  rating === val ? `${active}18` : "var(--bg3)",
                      color:       rating === val ? active : "var(--text3)",
                      fontSize:    12,
                      fontWeight:  500,
                      fontFamily:  "'DM Sans', sans-serif",
                      cursor:      "pointer",
                      transition:  "all 0.15s",
                    }}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize:   11,
                fontWeight: 600,
                color:      "var(--text3)",
                fontFamily: "'DM Mono', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}>
                Category
              </div>
              <div style={{
                display:             "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap:                 6,
              }}>
                {CATEGORIES.map(({ value, emoji }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    style={{
                      display:        "flex",
                      flexDirection:  "column",
                      alignItems:     "center",
                      gap:            4,
                      padding:        "8px 4px",
                      borderRadius:   9,
                      border:         `1px solid ${category === value ? "rgba(108,99,255,0.5)" : "var(--border)"}`,
                      background:     category === value ? "var(--accent-dim)" : "var(--bg3)",
                      color:          category === value ? "var(--accent2)"    : "var(--text3)",
                      fontSize:       10.5,
                      fontWeight:     500,
                      fontFamily:     "'DM Sans', sans-serif",
                      cursor:         "pointer",
                      transition:     "all 0.15s",
                      lineHeight:     1.3,
                      textAlign:      "center",
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{emoji}</span>
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize:   11,
                fontWeight: 600,
                color:      "var(--text3)",
                fontFamily: "'DM Mono', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}>
                Message
              </div>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Tell us what you think..."
                rows={3}
                style={{
                  width:        "100%",
                  boxSizing:    "border-box",
                  background:   "var(--bg3)",
                  border:       "1px solid var(--border)",
                  borderRadius: 10,
                  padding:      "10px 12px",
                  color:        "var(--text)",
                  fontSize:     12.5,
                  fontFamily:   "'DM Sans', sans-serif",
                  resize:       "none",
                  outline:      "none",
                  lineHeight:   1.6,
                  transition:   "border-color 0.15s",
                }}
                onFocus={e  => e.target.style.borderColor = "rgba(108,99,255,0.5)"}
                onBlur={e   => e.target.style.borderColor = "var(--border)"}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width:        "100%",
                padding:      "10px",
                borderRadius: 10,
                border:       "none",
                background:   submitting ? "var(--bg3)" : "linear-gradient(135deg, var(--accent), var(--accent2))",
                color:        submitting ? "var(--text3)" : "#fff",
                fontSize:     13,
                fontWeight:   600,
                fontFamily:   "'DM Sans', sans-serif",
                cursor:       submitting ? "not-allowed" : "pointer",
                boxShadow:    submitting ? "none" : "0 6px 20px rgba(108,99,255,0.35)",
                transition:   "all 0.18s",
                letterSpacing:"0.01em",
              }}
            >
              {submitting ? "Sending…" : "Submit Feedback"}
            </button>
          </form>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes dp-slide-up {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes dp-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>
    </>
  );
}