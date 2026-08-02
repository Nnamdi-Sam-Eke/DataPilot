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

export default function PageTerms() {
  return (
    <LegalShell title="Terms of Service">
      <p style={p}>
        These Terms of Service (&quot;Terms&quot;) govern access to and use of <strong style={{ color: "var(--text)" }}>DataPilot</strong>
        (the &quot;Service&quot;). By creating an account or using the Service, you agree to these Terms and our Privacy Policy.
      </p>

      <h2 style={h2}>1. The Service</h2>
      <p style={p}>
        DataPilot is a software tool that helps users upload tabular data, clean and explore it, run AI-assisted insights,
        train machine-learning models, generate reports, and export code (including Python, Markdown, and Jupyter notebooks).
        Features and limits differ between Free and Pro plans and may change as we improve the product.
      </p>

      <h2 style={h2}>2. Eligibility and accounts</h2>
      <ul style={ul}>
        <li style={li}>You must be able to form a binding contract in your jurisdiction and be at least 16 years old.</li>
        <li style={li}>You are responsible for the accuracy of account information and for keeping login credentials secure.</li>
        <li style={li}>You are responsible for activity under your account.</li>
      </ul>

      <h2 style={h2}>3. Acceptable use</h2>
      <p style={p}>You agree not to:</p>
      <ul style={ul}>
        <li style={li}>Upload or process data you do not have rights to use.</li>
        <li style={li}>Use the Service for unlawful, harmful, or abusive purposes.</li>
        <li style={li}>Attempt to bypass plan limits, authentication, or payment controls.</li>
        <li style={li}>Probe, scan, or overload the Service, or reverse engineer it except where permitted by law.</li>
        <li style={li}>Resell or redistribute the Service as a competing hosted offering without our written consent.</li>
        <li style={li}>Upload malware or content that infringes others’ rights.</li>
      </ul>
      <p style={p}>We may suspend or terminate accounts that violate these Terms.</p>

      <h2 style={h2}>4. Your data and license</h2>
      <p style={p}>
        You retain ownership of the datasets and content you upload. You grant DataPilot a limited license to host,
        process, transmit, and display that content solely to provide the Service (including AI features, training,
        storage/restore, and exports you request).
      </p>
      <p style={p}>
        You represent that you have all rights and permissions needed to upload and process that content with DataPilot
        and its subprocessors (including AI providers).
      </p>

      <h2 style={h2}>5. Plans, billing, and cancellations</h2>
      <ul style={ul}>
        <li style={li}>Free plan features and limits are described in-product and on the pricing page.</li>
        <li style={li}>Pro is a paid subscription billed through Flutterwave. Prices may change with notice for future periods.</li>
        <li style={li}>Unless stated otherwise, subscriptions renew automatically until cancelled.</li>
        <li style={li}>You may cancel from the in-app subscription management flow. Access generally continues until the end of the current paid period.</li>
        <li style={li}>Fees already paid are non-refundable except where required by law or explicitly offered by us.</li>
      </ul>

      <h2 style={h2}>6. AI and model outputs</h2>
      <p style={p}>
        AI insights, narratives, generated code, and model predictions are probabilistic tools. They may be incomplete,
        incorrect, or unsuitable for your use case. You are solely responsible for reviewing outputs before relying on
        them for decisions, client work, or production systems.
      </p>

      <h2 style={h2}>7. Intellectual property</h2>
      <p style={p}>
        The DataPilot product, branding, UI, and underlying software (excluding your data and third-party open-source
        components) are owned by us or our licensors. These Terms do not transfer ownership of our IP to you.
      </p>

      <h2 style={h2}>8. Availability and changes</h2>
      <p style={p}>
        We aim for reliable uptime but do not guarantee uninterrupted service. Sessions may expire; servers may restart;
        features may be added, limited, or removed. We may modify the Service or these Terms; continued use after changes
        constitutes acceptance.
      </p>

      <h2 style={h2}>9. Disclaimers</h2>
      <p style={p}>
        THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED,
        INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED
        BY LAW. WE DO NOT WARRANT THAT RESULTS WILL BE ACCURATE OR THAT THE SERVICE WILL BE ERROR-FREE.
      </p>

      <h2 style={h2}>10. Limitation of liability</h2>
      <p style={p}>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, DATAPILOT AND ITS OPERATORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA, OR BUSINESS OPPORTUNITIES. OUR TOTAL
        LIABILITY FOR CLAIMS ARISING OUT OF THE SERVICE WILL NOT EXCEED THE GREATER OF (A) AMOUNTS YOU PAID TO US FOR THE
        SERVICE IN THE THREE (3) MONTHS BEFORE THE CLAIM OR (B) USD $50.
      </p>

      <h2 style={h2}>11. Indemnity</h2>
      <p style={p}>
        You agree to indemnify and hold us harmless from claims arising out of your data, your use of the Service, or your
        violation of these Terms or applicable law.
      </p>

      <h2 style={h2}>12. Termination</h2>
      <p style={p}>
        You may stop using the Service at any time. We may suspend or terminate access for violations of these Terms,
        non-payment, or risk to the Service or other users. Provisions that by nature should survive (including ownership,
        disclaimers, and limitations) will survive termination.
      </p>

      <h2 style={h2}>13. Governing law</h2>
      <p style={p}>
        These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict-of-law rules.
        Courts in Lagos, Nigeria shall have jurisdiction, subject to any mandatory consumer protections that apply to you.
      </p>

      <h2 style={h2}>14. Contact</h2>
      <p style={p}>
        Questions about these Terms: <a href={`mailto:${CONTACT}`} style={{ color: "var(--accent2)" }}>{CONTACT}</a><br />
        DataPilot · Lagos, Nigeria
      </p>
      <p style={{ ...p, marginTop: 16, fontSize: 12, color: "var(--text3)" }}>
        These pages are provided for product transparency and are not a substitute for formal legal advice.
        If you operate in regulated industries or process sensitive personal data at scale, consult a qualified attorney.
      </p>
    </LegalShell>
  );
}
