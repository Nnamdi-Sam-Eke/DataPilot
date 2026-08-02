import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";

const API_URL = import.meta.env.VITE_API_URL || "";

// Poll cadence for waiting on the webhook to catch up with the redirect.
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 15; // ~30s ceiling before we tell the user to check back

// ── icons (matching PagePricing's inline icon pattern) ───────────────────────
const Ico = ({ d, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const IcoCheck = ({ size }) => <Ico size={size} d="M20 6L9 17l-5-5" />;
const IcoX     = ({ size }) => <Ico size={size} d="M18 6L6 18M6 6l12 12" />;
const IcoLoad  = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.9s linear infinite" }}>
    <circle cx="12" cy="12" r="9" stroke="var(--border)" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 00-9-9" stroke="var(--accent2)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export default function PaymentSuccess() {
  const navigate = useNavigate();

const [state, setState] = useState("checking");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get("tx_ref");

    // Flutterwave also appends its own `status` param, but that's the
    // customer's browser URL -- editable, not trusted. It's only used
    // here as an early "cancelled" shortcut; everything else waits on
    // the backend's own record instead.
    if (params.get("status") === "cancelled") {
      setState("failed");
      return;
    }

    if (!txRef) {
      setState("error");
      return;
    }

    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      try {
        const currentUser = getAuth().currentUser;
        if (!currentUser) {
          if (!cancelled) setState("error");
          return;
        }
        const idToken = await currentUser.getIdToken();

        const res = await fetch(`${API_URL}/api/payments/status/${txRef}`, {
          headers: { "Authorization": `Bearer ${idToken}` },
        });

        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }

        const data = await res.json();

        if (cancelled) return;

        if (data.status === "verified") {
  setState("verified");

  setTimeout(() => {
    navigate("/dashboard");
  }, 3000);

  return;
}

        // Still "pending" — webhook hasn't landed yet. Keep polling up to
        // the attempt ceiling, then tell the user rather than spin forever.
        attempts += 1;
        if (attempts >= MAX_POLL_ATTEMPTS) {
          setState("pending");
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setState("error");
      }
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  const content = {
    checking: {
      icon: <IcoLoad size={32} />,
      color: "var(--text3)",
      title: "Confirming your payment…",
      body: "This usually takes just a few seconds.",
    },
    verified: {
  icon: <IcoCheck size={28} />,
  color: "var(--green, #3ecf6f)",
  title: "Welcome to DataPilot Pro!",
  body: "Your account has been upgraded successfully. Taking you to your dashboard...",
},
    pending: {
      icon: <IcoLoad size={32} />,
      color: "var(--text3)",
      title: "Still confirming…",
      body: "Your payment is being processed. This page can take a minute to update — you can safely close it and check back, your upgrade will apply automatically once confirmed.",
    },
    failed: {
      icon: <IcoX size={26} />,
      color: "var(--red, #e5484d)",
      title: "Payment didn't go through",
      body: "No charge was completed. You can try again from the pricing page.",
    },
    error: {
      icon: <IcoX size={26} />,
      color: "var(--red, #e5484d)",
      title: "Couldn't confirm this payment",
      body: "Something went wrong checking this transaction. If you were charged, contact support and we'll sort it out.",
    },
  }[state];

  return (
    <div style={{
      maxWidth: 440, margin: "0 auto", padding: "clamp(48px, 12vw, 96px) 20px",
      textAlign: "center",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{
        width: 64, height: 64, borderRadius: "50%", margin: "0 auto 24px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg2)", border: `1px solid ${content.color}`,
        color: content.color,
      }}>
        {content.icon}
      </div>

      <h1 style={{
        fontFamily: "'Syne', sans-serif", fontSize: "clamp(20px, 5vw, 26px)",
        fontWeight: 800, color: "var(--text)", margin: "0 0 10px",
      }}>
        {content.title}
      </h1>

      <p style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1.7, margin: "0 0 28px" }}>
        {content.body}
      </p>

      <button
  onClick={() => navigate(state === "verified" ? "/dashboard" : "/pricing")}
  className="btn-primary"
  style={{
    display: "inline-flex",
    border: "none",
    cursor: "pointer"
  }}
>
  {state === "verified" ? "Go to DataPilot" : "Back to pricing"}
</button>
    </div>
  );
}