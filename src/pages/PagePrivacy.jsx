import { useNavigate } from "react-router-dom";

const LAST_UPDATED = "1 August 2026";
const CONTACT = "hello@datapilot.ai";

function LegalShell({ title, children }) {
  const navigate = useNavigate();

  return (
    <div className="page-enter" style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 48px" }}>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/auth"))}
        style={{ marginBottom: 18, fontSize: 12 }}
      >
        ← Back
      </button>

      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-title">{title}</div>
        <div className="page-subtitle">Last updated: {LAST_UPDATED}</div>
      </div>

      <div className="card" style={{ lineHeight: 1.7, fontSize: 13.5, color: "var(--text2)" }}>
        {children}
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: "var(--text3)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => navigate("/privacy")} style={linkBtn}>Privacy Policy</button>
        <button type="button" onClick={() => navigate("/terms")} style={linkBtn}>Terms of Service</button>
        <a href={`mailto:${CONTACT}`} style={{ ...linkBtn, textDecoration: "none" }}>Contact</a>
      </div>
    </div>
  );
}

const linkBtn = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--accent2)",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "inherit",
};

const h2 = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--text)",
  margin: "22px 0 8px",
  fontFamily: "'Syne', sans-serif",
};

const p = { margin: "0 0 10px" };
const ul = { margin: "0 0 12px", paddingLeft: 18 };
const li = { marginBottom: 6 };

export default function PagePrivacy() {
  return (
    <LegalShell title="Privacy Policy">
      <p style={p}>
        This Privacy Policy explains how <strong style={{ color: "var(--text)" }}>DataPilot</strong>
        (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, stores, and shares information when you use the DataPilot
        website and application (the &quot;Service&quot;). DataPilot is operated from Lagos, Nigeria.
      </p>
      <p style={p}>
        By creating an account or using the Service, you agree to this Policy. If you do not agree,
        do not use DataPilot.
      </p>

      <h2 style={h2}>1. Information we collect</h2>
      <p style={p}><strong style={{ color: "var(--text)" }}>Account information.</strong> When you sign up we collect your email address, display name (if provided), and authentication data managed by Firebase Authentication. If you complete an optional profile, we may also store role, experience level, and stated use case.</p>
      <p style={p}><strong style={{ color: "var(--text)" }}>Usage and session data.</strong> We process technical and product data needed to run the Service, including session identifiers, feature usage, plan status, approximate timestamps, and error diagnostics.</p>
      <p style={p}><strong style={{ color: "var(--text)" }}>Files and analysis content you upload.</strong> When you upload datasets (for example CSV, XLSX, or JSON), we process that content so the Service can clean, analyze, visualize, train models, generate insights, and export reports or code. You control what you upload.</p>
      <p style={p}><strong style={{ color: "var(--text)" }}>Workspace and model artifacts (plan-dependent).</strong> Depending on your plan, we may store workspace metadata, trained model binaries, and related restore keys so you can resume work across sessions.</p>
      <p style={p}><strong style={{ color: "var(--text)" }}>Payment information.</strong> Paid subscriptions are processed by Flutterwave. We do not store full card numbers on DataPilot servers. We may store subscription status, plan identifiers, billing period end, and related transaction references needed to manage access.</p>
      <p style={p}><strong style={{ color: "var(--text)" }}>AI prompts and outputs.</strong> If you use AI features (insights, narratives, and similar), prompts derived from your session data and the model responses are processed to provide those features.</p>
      <p style={p}><strong style={{ color: "var(--text)" }}>Device and browser data.</strong> Standard logs may include IP address, browser type, and similar technical data from our hosting providers for security and reliability.</p>

      <h2 style={h2}>2. How we use information</h2>
      <ul style={ul}>
        <li style={li}>Provide, maintain, and improve the Service (upload, cleaning, training, predictions, reports, code export, restore).</li>
        <li style={li}>Authenticate you, enforce plan limits, and prevent abuse.</li>
        <li style={li}>Process subscriptions, renewals, cancellations, and related customer support.</li>
        <li style={li}>Send transactional messages (for example account or billing-related notices).</li>
        <li style={li}>Monitor reliability, debug failures, and protect the Service against fraud or misuse.</li>
        <li style={li}>Comply with legal obligations where applicable.</li>
      </ul>
      <p style={p}>We do not sell your personal information.</p>

      <h2 style={h2}>3. AI processing</h2>
      <p style={p}>
        Certain features send derived context from your dataset or session (for example column summaries,
        statistics, or user questions) to third-party AI providers so we can return insights or narrative text.
        Do not upload data you are not allowed to process with third-party AI systems. Avoid uploading
        highly sensitive personal data (such as government IDs, health records, or children’s data) unless
        you have a lawful basis and appropriate safeguards.
      </p>

      <h2 style={h2}>4. Where data is processed and stored</h2>
      <p style={p}>We use third-party infrastructure to operate DataPilot, which may include:</p>
      <ul style={ul}>
        <li style={li}><strong style={{ color: "var(--text)" }}>Firebase (Google)</strong> — authentication and user profile / workspace documents.</li>
        <li style={li}><strong style={{ color: "var(--text)" }}>Object storage (e.g. Backblaze B2)</strong> — file and model artifacts for cloud backup/restore where enabled.</li>
        <li style={li}><strong style={{ color: "var(--text)" }}>Application hosting</strong> — API and web app hosting (ephemeral session data may live in server memory for active sessions).</li>
        <li style={li}><strong style={{ color: "var(--text)" }}>Flutterwave</strong> — payment processing.</li>
        <li style={li}><strong style={{ color: "var(--text)" }}>AI providers (e.g. Groq)</strong> — inference for AI features.</li>
      </ul>
      <p style={p}>
        Providers may process data in regions outside Nigeria. By using the Service you understand that
        your information may be transferred to and processed in those regions subject to this Policy and
        the providers’ own terms.
      </p>

      <h2 style={h2}>5. Retention</h2>
      <ul style={ul}>
        <li style={li}><strong style={{ color: "var(--text)" }}>Active sessions:</strong> in-memory session datasets expire after the session TTL (shorter on Free, longer on Pro) or when the server restarts.</li>
        <li style={li}><strong style={{ color: "var(--text)" }}>Account data:</strong> kept while your account remains open.</li>
        <li style={li}><strong style={{ color: "var(--text)" }}>Cloud workspace / models:</strong> retained according to your plan and product settings until you delete them or your account is closed, subject to backup cycles.</li>
        <li style={li}><strong style={{ color: "var(--text)" }}>Billing records:</strong> retained as needed for accounting, dispute resolution, and legal compliance.</li>
      </ul>

      <h2 style={h2}>6. Sharing</h2>
      <p style={p}>We share information only with:</p>
      <ul style={ul}>
        <li style={li}>Service providers who process data for us under contractual obligations (hosting, auth, storage, payments, AI inference).</li>
        <li style={li}>Authorities when required by law or to protect rights, safety, and the integrity of the Service.</li>
        <li style={li}>A successor entity if we are involved in a merger, acquisition, or asset transfer, with notice where required.</li>
      </ul>

      <h2 style={h2}>7. Security</h2>
      <p style={p}>
        We use industry-standard measures appropriate to a small SaaS product (encrypted transport, authenticated API access,
        plan checks on sensitive actions, and restricted access to production secrets). No method of transmission or storage
        is 100% secure. You are responsible for protecting your account credentials and for not uploading data you are not
        authorized to process.
      </p>

      <h2 style={h2}>8. Your choices</h2>
      <ul style={ul}>
        <li style={li}>Update profile details in Settings.</li>
        <li style={li}>Stop uploading new data or stop using AI features at any time.</li>
        <li style={li}>Cancel a paid subscription through the in-app billing/manage flow (access continues until the end of the paid period where applicable).</li>
        <li style={li}>Request account deletion or a copy of account data by emailing <a href={`mailto:${CONTACT}`} style={{ color: "var(--accent2)" }}>{CONTACT}</a>. We will respond within a reasonable period, subject to legal retention needs.</li>
      </ul>

      <h2 style={h2}>9. Children</h2>
      <p style={p}>
        DataPilot is not directed to children under 16. We do not knowingly collect personal information from children.
        If you believe a child has provided personal information, contact us and we will take appropriate steps.
      </p>

      <h2 style={h2}>10. Changes</h2>
      <p style={p}>
        We may update this Policy from time to time. The “Last updated” date at the top will change when we do.
        Continued use of the Service after changes means you accept the updated Policy.
      </p>

      <h2 style={h2}>11. Contact</h2>
      <p style={p}>
        Questions about privacy: <a href={`mailto:${CONTACT}`} style={{ color: "var(--accent2)" }}>{CONTACT}</a><br />
        DataPilot · Lagos, Nigeria
      </p>
    </LegalShell>
  );
}
