import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { useDataPilot } from "../DataPilotContext.jsx";

// ── icons ──────────────────────────────────────────────────────────────────────
const Ico = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const IcoStar    = ({ size }) => <Ico size={size} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />;
const IcoCalendar = ({ size }) => <Ico size={size} d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />;
const IcoCheck   = ({ size }) => <Ico size={size} d="M20 6L9 17l-5-5" />;
const IcoAlert   = ({ size }) => <Ico size={size} d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />;
const IcoArrow   = ({ size }) => <Ico size={size} d="M5 12h14M12 5l7 7-7 7" />;

const PLAN_COLORS = {
  free: { bg: "rgba(100,100,120,0.15)", border: "rgba(100,100,120,0.3)", text: "#9ca3af" },
  pro:  { bg: "rgba(108,99,255,0.12)",  border: "rgba(108,99,255,0.3)",  text: "#a78bfa" },
};

function PlanBadge({ plan }) {
  const c = PLAN_COLORS[plan?.toLowerCase()] || PLAN_COLORS.free;
  return (
    <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em", background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {plan || "Free"}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "—";
  }
}

const STATUS_LABEL = {
  successful: "Paid",
  pending: "Pending",
  failed: "Failed",
  init_failed: "Failed",
  verification_failed: "Failed",
};

export default function PageBilling() {
  const navigate = useNavigate();
  const ctx = useDataPilot();
  const userProfile = ctx?.userProfile ?? { plan: "free" };
  const currentPlan = userProfile?.plan?.toLowerCase() || "free";

  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const fetchSubscription = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const currentUser = getAuth().currentUser;
      if (!currentUser) {
        setLoadError("Please log in again to view billing.");
        setLoading(false);
        return;
      }
      const idToken = await currentUser.getIdToken();
      const response = await fetch("/api/payments/subscription", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error("Request failed");
      const data = await response.json();
      setSub(data);
    } catch (err) {
      console.error("Failed to load billing info:", err);
      setLoadError("Couldn't load your billing details. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);

  const handleCancel = async () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      const currentUser = getAuth().currentUser;
      const idToken = await currentUser.getIdToken();
      const response = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setCancelError(data.detail || "Couldn't cancel your subscription. Please try again.");
        setCancelling(false);
        return;
      }
      setConfirmCancel(false);
      setCancelling(false);
      await fetchSubscription();
    } catch (err) {
      console.error("Cancel failed:", err);
      setCancelError("Couldn't reach the payment server. Check your connection and try again.");
      setCancelling(false);
    }
  };

  const isPro = currentPlan === "pro";
  const isCancelling = sub?.subscription_status === "cancelling";
  const history = sub?.payment_history || [];

  return (
    <div className="page-enter" style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 60, padding: "0 16px" }}>

      <div style={{ marginBottom: 28, paddingTop: 8 }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "clamp(22px, 5vw, 30px)",
          fontWeight: 800, color: "var(--text)", margin: "0 0 6px",
        }}>
          Billing
        </h1>
        <div style={{ fontSize: 13, color: "var(--text3)" }}>
          Manage your subscription and view past payments.
        </div>
      </div>

      {/* ── Current plan card ── */}
      <div className="card" style={{
        marginBottom: 20,
        background: isPro ? "linear-gradient(135deg, rgba(108,99,255,0.08) 0%, rgba(108,99,255,0.02) 100%)" : undefined,
        border: isPro ? "1px solid rgba(108,99,255,0.2)" : undefined,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IcoStar size={16} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Current plan</span>
          </div>
          <PlanBadge plan={currentPlan} />
        </div>

        {loading ? (
          <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--text3)" }}>Loading billing details…</div>
        ) : loadError ? (
          <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--red, #e5484d)" }}>{loadError}</div>
        ) : isPro ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text2)" }}>
              <IcoCalendar size={14} />
              {isCancelling
                ? <>Pro access ends on <strong style={{ color: "var(--text)" }}>{formatDate(sub?.current_period_end)}</strong> — auto-renewal is off</>
                : <>Next billing date: <strong style={{ color: "var(--text)" }}>{formatDate(sub?.current_period_end)}</strong></>}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              $12/month, billed automatically to the card on file
              {isCancelling ? "" : " — no need to re-subscribe each period."}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16, fontSize: 13, color: "var(--text2)" }}>
            You're on the free plan. Upgrade to Pro for higher limits and unlimited AI queries.
          </div>
        )}

        {isPro && !loading && !loadError && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            {isCancelling ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text3)" }}>
                <IcoCheck size={14} /> Auto-renewal is cancelled. You won't be charged again.
              </div>
            ) : (
              <>
                <button
                  className="btn-secondary"
                  style={{ fontSize: 13, gap: 8, color: confirmCancel ? "var(--red, #e5484d)" : undefined }}
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling
                    ? "Cancelling…"
                    : confirmCancel
                      ? "Click again to confirm cancellation"
                      : "Cancel auto-renewal"}
                </button>
                {confirmCancel && !cancelling && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text3)", display: "flex", alignItems: "center", gap: 6 }}>
                    <IcoAlert size={13} /> You'll keep Pro access until {formatDate(sub?.current_period_end)}, then move to Free.
                  </div>
                )}
                {cancelError && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--red, #e5484d)" }}>{cancelError}</div>
                )}
              </>
            )}
          </div>
        )}

        {!isPro && !loading && (
          <button
            className="btn-primary"
            style={{ marginTop: 18, fontSize: 13, gap: 8 }}
            onClick={() => navigate("/pricing")}
          >
            <span>Upgrade to Pro</span> <IcoArrow size={14} />
          </button>
        )}

        {isPro && !loading && (
          <div style={{ marginTop: 14 }}>
            <button
              onClick={() => navigate("/pricing")}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: "var(--text3)", padding: 0,
                textDecoration: "underline", textUnderlineOffset: 3,
              }}
            >
              View full pricing &amp; feature comparison
            </button>
          </div>
        )}
      </div>

      {/* ── Payment history ── */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>
          Payment history
        </div>
        {loading ? (
          <div style={{ fontSize: 12.5, color: "var(--text3)" }}>Loading…</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text3)" }}>No payments yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((h) => (
              <div key={h.tx_ref} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)",
                flexWrap: "wrap", gap: 8,
              }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>
                    {h.payment_type === "renewal" ? "Monthly renewal" : "Pro subscription"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                    {h.created_at ? formatDate(h.created_at) : "—"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12.5, fontFamily: "'DM Mono', monospace", color: "var(--text2)" }}>
                    {h.currency === "USD" ? "$" : `${h.currency} `}{h.amount}
                  </span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                    padding: "3px 8px", borderRadius: 6,
                    color: h.status === "successful" ? "#34d399" : "var(--text3)",
                    background: h.status === "successful" ? "rgba(52,211,153,0.1)" : "rgba(100,100,120,0.15)",
                  }}>
                    {STATUS_LABEL[h.status] || h.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}