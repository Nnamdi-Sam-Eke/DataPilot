import { useState, useEffect } from "react";
import { useDataPilot } from "../DataPilotContext";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../services/firebase";

// ── animated grid background (matches app's grid-bg) ─────────────────────────
const GridBackground = () => (
  <div style={{
    position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
  }}>
    {/* grid lines */}
    <div style={{
      position: "absolute", inset: 0,
      backgroundImage: `
        linear-gradient(rgba(108,99,255,0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(108,99,255,0.045) 1px, transparent 1px)
      `,
      backgroundSize: "40px 40px",
    }} />
    {/* radial glow top-left */}
    <div style={{
      position: "absolute", top: "-20%", left: "-10%",
      width: "60%", height: "60%",
      background: "radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 65%)",
    }} />
    {/* radial glow bottom-right */}
    <div style={{
      position: "absolute", bottom: "-20%", right: "-10%",
      width: "50%", height: "50%",
      background: "radial-gradient(circle, rgba(167,139,250,0.07) 0%, transparent 65%)",
    }} />
  </div>
);

// ── feature pill ─────────────────────────────────────────────────────────────
const Pill = ({ icon, label, sub, delay }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12,
    animation: `fadeSlideUp 0.6s ease ${delay}s both`,
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      background: "rgba(108,99,255,0.12)",
      border: "1px solid rgba(108,99,255,0.2)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 15,
    }}>{icon}</div>
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#e8eaf0", fontFamily: "'Syne', sans-serif" }}>{label}</div>
      <div style={{ fontSize: 11, color: "#4a4f62", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>{sub}</div>
    </div>
  </div>
);

// ── stat badge ────────────────────────────────────────────────────────────────
const Stat = ({ value, label }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{
      fontSize: 22, fontWeight: 800, color: "#a78bfa",
      fontFamily: "'Syne', sans-serif", lineHeight: 1,
    }}>{value}</div>
    <div style={{ fontSize: 10.5, color: "#4a4f62", fontFamily: "'DM Mono', monospace", marginTop: 3 }}>{label}</div>
  </div>
);

// ── input field ───────────────────────────────────────────────────────────────
const Field = ({ id, label, type = "text", value, onChange, placeholder, required, minLength }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label htmlFor={id} style={{
        display: "block", marginBottom: 7,
        fontSize: 12, fontWeight: 500,
        color: focused ? "#a78bfa" : "#8b90a0",
        fontFamily: "'DM Sans', sans-serif",
        transition: "color 0.2s",
        letterSpacing: "0.02em",
      }}>{label}</label>
      <input
        id={id} type={type} value={value}
        onChange={onChange} placeholder={placeholder}
        required={required} minLength={minLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${focused ? "rgba(108,99,255,0.5)" : "rgba(255,255,255,0.07)"}`,
          background: focused ? "rgba(108,99,255,0.05)" : "rgba(255,255,255,0.03)",
          color: "#e8eaf0",
          outline: "none",
          fontSize: 13.5,
          fontFamily: "'DM Sans', sans-serif",
          boxSizing: "border-box",
          transition: "border-color 0.2s, background 0.2s",
        }}
      />
    </div>
  );
};

// ── Theme Toggle Button ───────────────────────────────────────────────────────
const ThemeToggle = ({ isDark, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      position: "absolute",
      top: "24px",
      right: "32px",
      zIndex: 10,
      padding: "8px 12px",
      borderRadius: 9999,
      border: "1px solid rgba(255,255,255,0.1)",
      background: "rgba(255,255,255,0.05)",
      color: "#e8eaf0",
      fontSize: 13,
      display: "flex",
      alignItems: "center",
      gap: 8,
      cursor: "pointer",
      transition: "all 0.2s",
    }}
    title="Toggle light/dark theme"
  >
    {isDark ? "☀️ " : "🌙 "}
  </button>
);

// ── main ──────────────────────────────────────────────────────────────────────
export default function PageAuth() {
  const { signup, login } = useDataPilot();

  const [mode,      setMode]      = useState("login");
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [resetSent, setResetSent] = useState(false);

const handleForgotPassword = async () => {
  if (!email.trim()) {
    setError("Enter your email address first, then click Forgot password.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email.trim());
    setResetSent(true);
    setError("");
    setTimeout(() => setResetSent(false), 5000);
  } catch (err) {
    setError(err?.message || "Failed to send reset email.");
  }
};

  // Theme state
  const [isDark, setIsDark] = useState(true);

  // Persist theme preference
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setIsDark(savedTheme === "dark");
    } else {
      setIsDark(true); // default to dark
    }
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const isLogin = mode === "login";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, { firstName, lastName });
      }
    } catch (err) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const FEATURES = [
    { icon: "⚡", label: "End-to-end pipeline",    sub: "Upload → Clean → Train → Export",  delay: 0.15 },
    { icon: "✦",  label: "AI-powered insights",    sub: "Ask anything about your data",     delay: 0.25 },
    { icon: "⌗",  label: "17 chart types",         sub: "From histograms to pair plots",    delay: 0.35 },
    { icon: "⟨/⟩", label: "Session code export",  sub: "Python · Jupyter · Markdown",      delay: 0.45 },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .auth-input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 480px) {
          .auth-input-row { grid-template-columns: 1fr !important; }
          .auth-split-left { display: none !important; }
          .auth-split-right { border-radius: 0 !important; min-height: 100vh !important; }
        }
      `}</style>

      <div style={{
        minHeight: "100vh", display: "flex",
        background: isDark ? "#07090e" : "#f8f9fc",
        color: isDark ? "#e8eaf0" : "#1f2937",
        position: "relative", overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
        transition: "background 0.3s ease",
      }}>
        <GridBackground />

        {/* Theme Toggle at the top */}
        <ThemeToggle isDark={isDark} onToggle={toggleTheme} />

        {/* ── LEFT PANEL ── */}
        <div className="auth-split-left" style={{
          flex: "0 0 52%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: "48px 52px",
          position: "relative", zIndex: 1,
          borderRight: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.06)",
        }}>
          {/* logo */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            animation: "fadeSlideUp 0.5s ease 0.05s both",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "#fff",
              fontFamily: "'Syne', sans-serif", letterSpacing: "-0.02em",
              boxShadow: "0 4px 20px rgba(108,99,255,0.4)",
            }}>dp</div>
            <span style={{
              fontSize: 18, fontWeight: 700,
              color: isDark ? "#e8eaf0" : "#1f2937",
              fontFamily: "'Syne', sans-serif",
            }}>Data<span style={{ color: "#a78bfa" }}>Pilot</span></span>
          </div>

          {/* headline */}
          <div style={{ animation: "fadeSlideUp 0.6s ease 0.1s both" }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: "#6c63ff",
              fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em",
              textTransform: "uppercase", marginBottom: 16,
            }}>Data Science Platform</div>
            <h1 style={{
              fontSize: "clamp(2rem, 3.2vw, 2.8rem)",
              fontWeight: 800, lineHeight: 1.08,
              color: isDark ? "#e8eaf0" : "#111827",
              fontFamily: "'Syne', sans-serif",
              margin: 0, letterSpacing: "-0.02em",
            }}>
              From raw data<br />
              <span style={{
                background: "linear-gradient(90deg, #6c63ff, #a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>to trained model.</span><br />
              In one workflow.
            </h1>
            <p style={{
              marginTop: 18, fontSize: 14.5, lineHeight: 1.65,
              color: isDark ? "#4a4f62" : "#6b7280",
              maxWidth: 400,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Upload, clean, visualize, train, predict, and export
              reproducible code — all without leaving the browser.
            </p>
          </div>

          {/* features */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FEATURES.map(f => <Pill key={f.label} {...f} />)}
          </div>

          {/* stats */}
          <div style={{
            display: "flex", gap: 32,
            paddingTop: 24, borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
            animation: "fadeSlideUp 0.6s ease 0.55s both",
          }}>
            <Stat value="9"   label="pages" />
            <Stat value="17"  label="chart types" />
            <Stat value="4"   label="ML models" />
            <Stat value="3"   label="export formats" />
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="auth-split-right" style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "40px 32px", position: "relative", zIndex: 1,
          background: isDark ? "transparent" : "#ffffff",
        }}>
          <div style={{
            width: "100%", maxWidth: 400,
            animation: "fadeSlideUp 0.6s ease 0.2s both",
          }}>

            {/* header */}
            <div style={{ marginBottom: 28 }}>
              <h2 style={{
                margin: 0, fontSize: 22, fontWeight: 700,
                color: isDark ? "#e8eaf0" : "#111827",
                fontFamily: "'Syne', sans-serif",
                letterSpacing: "-0.01em",
              }}>
                {isLogin ? "Welcome back" : "Create your account"}
              </h2>
              <p style={{
                marginTop: 6, marginBottom: 0, fontSize: 13,
                color: isDark ? "#4a4f62" : "#6b7280",
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {isLogin
                  ? "Sign in to continue your analysis workflow."
                  : "Start analyzing data in minutes."}
              </p>
            </div>

            {/* mode toggle */}
            <div style={{
              display: "flex", gap: 6, marginBottom: 24,
              background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
              border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.08)",
              padding: 5, borderRadius: 12,
            }}>
              {["login", "signup"].map(m => (
                <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
                  style={{
                    flex: 1, border: "none", borderRadius: 8,
                    padding: "9px 12px", cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13, fontWeight: 600,
                    background: mode === m
                      ? "linear-gradient(135deg, #6c63ff, #7c74ff)"
                      : "transparent",
                    color: mode === m ? "#fff" : (isDark ? "#4a4f62" : "#6b7280"),
                    boxShadow: mode === m ? "0 2px 12px rgba(108,99,255,0.35)" : "none",
                    transition: "all 0.2s",
                  }}>
                  {m === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>

            {/* form */}
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {!isLogin && (
                  <div className="auth-input-row">
                    <Field id="firstName" label="First Name" value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="Alex" required={!isLogin} />
                    <Field id="lastName" label="Last Name" value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Morgan" required={!isLogin} />
                  </div>
                )}

                <Field id="email" label="Email address" type="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required />

                <Field id="password" label="Password" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={isLogin ? "Enter your password" : "Min. 6 characters"}
                  required minLength={6} />

                {isLogin && (
                  <div style={{ textAlign: "right", marginTop: -6 }}>
                    <button type="button" onClick={handleForgotPassword} style={{
  background: "none", border: "none", cursor: "pointer",
  fontSize: 12, color: resetSent ? "#34d399" : "#6c63ff",
  fontFamily: "'DM Sans', sans-serif",
}}>
  {resetSent ? "✓ Reset email sent" : "Forgot password?"}
</button>
                  </div>
                )}

                {error && (
                  <div style={{
                    padding: "11px 14px", borderRadius: 10,
                    background: "rgba(248,113,113,0.08)",
                    border: "1px solid rgba(248,113,113,0.2)",
                    color: "#f87171", fontSize: 12.5,
                    fontFamily: "'DM Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span>⚠</span> {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  marginTop: 4, padding: "13px 16px",
                  border: "none", borderRadius: 10,
                  background: loading
                    ? "rgba(108,99,255,0.5)"
                    : "linear-gradient(135deg, #6c63ff 0%, #7c74ff 100%)",
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  fontFamily: "'Syne', sans-serif",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: loading ? "none" : "0 4px 20px rgba(108,99,255,0.4)",
                  transition: "all 0.2s", letterSpacing: "0.01em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  {loading ? (
                    <>
                      <svg style={{ animation: "spin 0.8s linear infinite" }}
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      {isLogin ? "Signing in…" : "Creating account…"}
                    </>
                  ) : (
                    isLogin ? "Sign In to DataPilot" : "Create Account"
                  )}
                </button>

              </div>
            </form>

            {/* footer note */}
            <p style={{
              marginTop: 22, fontSize: 11.5, color: isDark ? "#4a4f62" : "#6b7280",
              textAlign: "center",
              fontFamily: "'DM Mono', monospace", lineHeight: 1.6,
            }}>
              {isLogin
                ? <>Don't have an account?{" "}
                    <button type="button" onClick={() => { setMode("signup"); setError(""); }}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"#a78bfa", fontSize:11.5, fontFamily:"'DM Mono',monospace" }}>
                      Sign up free
                    </button>
                  </>
                : <>Already have an account?{" "}
                    <button type="button" onClick={() => { setMode("login"); setError(""); }}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"#a78bfa", fontSize:11.5, fontFamily:"'DM Mono',monospace" }}>
                      Sign in
                    </button>
                  </>
              }
            </p>

          </div>
        </div>
      </div>
    </>
  );
}