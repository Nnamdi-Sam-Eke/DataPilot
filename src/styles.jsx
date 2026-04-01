const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,400&display=swap');
`;

export const styles = `
  ${FONTS}
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* ── Dark theme (default) ─────────────────────────────────────────────── */
    --bg: #07090e;
    --bg2: #0c0f18;
    --bg3: #111520;
    --border: rgba(255,255,255,0.07);
    --border-bright: rgba(255,255,255,0.13);
    --text: #e8eaf0;
    --text2: #8b90a0;
    --text3: #4a4f62;

    /* Accent (purple default) */
    --accent: #6c63ff;
    --accent2: #a78bfa;
    --accent-glow: rgba(108,99,255,0.18);
    --accent-dim: rgba(108,99,255,0.08);

    --green: #34d399;
    --red: #f87171;
    --amber: #fbbf24;
    --cyan: #22d3ee;

    --sidebar-w: 220px;
    --header-h: 56px;
  }

  [data-theme="light"] {
    --bg: #f8f9fc;
    --bg2: #ffffff;
    --bg3: #f0f2f5;
    --border: rgba(0,0,0,0.06);
    --border-bright: rgba(0,0,0,0.12);
    --text: #1f2937;
    --text2: #4b5563;
    --text3: #6b7280;

    --accent: #6c63ff;
    --accent2: #a78bfa;
    --accent-glow: rgba(108,99,255,0.12);
    --accent-dim: rgba(108,99,255,0.05);

    --green: #10b981;
    --red: #ef4444;
    --amber: #f59e0b;
    --cyan: #06b6d4;
  }

  /* Accent color variations */
  [data-accent="#6c63ff"] { --accent: #6c63ff; --accent2: #a78bfa; --accent-glow: rgba(108,99,255,0.18); --accent-dim: rgba(108,99,255,0.08); }
  [data-accent="#3b82f6"] { --accent: #3b82f6; --accent2: #60a5fa; --accent-glow: rgba(59,130,246,0.18); --accent-dim: rgba(59,130,246,0.08); }
  [data-accent="#22d3ee"] { --accent: #22d3ee; --accent2: #67e8f9; --accent-glow: rgba(34,211,238,0.18); --accent-dim: rgba(34,211,238,0.08); }
  [data-accent="#10b981"] { --accent: #10b981; --accent2: #34d399; --accent-glow: rgba(16,185,129,0.18); --accent-dim: rgba(16,185,129,0.08); }
  [data-accent="#6366f1"] { --accent: #6366f1; --accent2: #a5b4fc; --accent-glow: rgba(99,102,241,0.18); --accent-dim: rgba(99,102,241,0.08); }
  [data-accent="#ec4899"] { --accent: #ec4899; --accent2: #f472b6; --accent-glow: rgba(236,72,153,0.18); --accent-dim: rgba(236,72,153,0.08); }
  [data-accent="#f59e0b"] { --accent: #f59e0b; --accent2: #fbbf24; --accent-glow: rgba(245,158,11,0.18); --accent-dim: rgba(245,158,11,0.08); }

  html, body, #root {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
  }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--accent); }

  .app-wrap {
    display: flex;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }

  .grid-bg {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image: linear-gradient(rgba(108,99,255,0.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(108,99,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .grid-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(108,99,255,0.08) 0%, transparent 70%);
  }

  .sidebar {
    width: var(--sidebar-w);
    min-width: var(--sidebar-w);
    height: 100vh;
    background: var(--bg2);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    z-index: 10;
    position: relative;
  }

  .sidebar-logo {
    padding: 18px 20px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid var(--border);
  }

  .logo-icon {
    width: 30px;
    height: 30px;
    background: linear-gradient(135deg, #6c63ff, #a78bfa);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-family: 'DM Mono', monospace;
    font-weight: 500;
    color: white;
    box-shadow: 0 0 12px rgba(108,99,255,0.4);
    flex-shrink: 0;
  }

  .logo-text {
    font-family: 'Syne', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.3px;
  }
  .logo-text span { color: var(--accent2); }

  .sidebar-section { padding: 16px 12px 6px; }
  .sidebar-section-label {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    font-weight: 500;
    color: var(--text3);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0 8px;
    margin-bottom: 6px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    color: var(--text2);
    font-size: 13.5px;
    font-weight: 400;
    margin-bottom: 1px;
    position: relative;
    border: 1px solid transparent;
    user-select: none;
  }

  .nav-item:hover { color: var(--text); background: rgba(255,255,255,0.04); }
  .nav-item.active {
    color: var(--text);
    background: var(--accent-dim);
    border-color: rgba(108,99,255,0.2);
  }
  .nav-item.active .nav-icon { color: var(--accent2); }

  .nav-icon { width: 15px; height: 15px; flex-shrink: 0; opacity: 0.85; }

  .nav-badge {
    margin-left: auto;
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    padding: 2px 6px;
    background: var(--accent-dim);
    color: var(--accent2);
    border-radius: 10px;
    border: 1px solid rgba(108,99,255,0.2);
  }

  .sidebar-footer {
    margin-top: auto;
    padding: 14px 12px;
    border-top: 1px solid var(--border);
    display: none;
  }

  .user-chip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .user-chip:hover { background: rgba(255,255,255,0.04); }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6c63ff, #22d3ee);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: white;
    flex-shrink: 0;
  }

  .user-name { font-size: 12.5px; font-weight: 500; color: var(--text); }
  .user-role {
    font-size: 10.5px;
    color: var(--text3);
    font-family: 'DM Mono', monospace;
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    z-index: 1;
  }
/* ── TOPBAR (fixed & theme-adaptive) ──────────────────────────────────────── */
  .topbar {
    height: var(--header-h);
    background: color-mix(in srgb, var(--bg) 82%, black 18%);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 16px;
    flex-shrink: 0;
    position: relative;
    z-index: 5;
  }
  

  [data-theme="light"] .topbar {
    background: color-mix(in srgb, var(--bg2) 94%, white 6%);
    border-bottom-color: var(--border-bright);
  }

  .topbar-avatar-wrap {
  position: relative;
}

.topbar-avatar-btn {
  border: none;
  outline: none;
}

.topbar-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 220px;
  background: var(--bg2);
  border: 1px solid var(--border-bright);
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.28);
  overflow: hidden;
  z-index: 30;
  animation: fadeUp 0.16s ease;
}

.topbar-dropdown-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
}

.topbar-dropdown-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-dropdown-email {
  font-size: 11px;
  color: var(--text3);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  background: transparent;
  border: none;
  color: var(--text2);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}

.topbar-dropdown-item:hover {
  background: rgba(255,255,255,0.04);
  color: var(--text);
}

.topbar-dropdown-item.danger:hover {
  color: var(--red);
}

@media (max-width: 768px) {
  .topbar-avatar-wrap .topbar-dropdown {
    display: none;
  }
}

  .topbar-breadcrumb {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text3);
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }
  .topbar-breadcrumb span {
    color: var(--text2);
    font-weight: 500;
  }

  .topbar-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .topbar-btn {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--bg2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text2);
    transition: all 0.15s;
  }

  .topbar-btn:hover {
    border-color: var(--border-bright);
    color: var(--text);
    background: var(--accent-dim);
    transform: translateY(-1px);
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(var(--green-rgb), 0.08);
    border: 1px solid rgba(var(--green-rgb), 0.2);
    border-radius: 20px;
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--green);
    white-space: nowrap;
  }

  .status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s infinite;
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: white;
    box-shadow: 0 0 10px var(--accent-glow);
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: pointer;
  }

  .avatar:hover {
    transform: scale(1.08);
    box-shadow: 0 0 14px var(--accent-glow);
  }

  .page-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 28px;
    position: relative;
  }

  .page-header { margin-bottom: 28px; }
  .page-title {
    font-family: 'Syne', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.4px;
    margin-bottom: 4px;
  }
  .page-subtitle {
    font-size: 13px;
    color: var(--text2);
    line-height: 1.5;
  }

  .card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
    transition: border-color 0.2s;
  }
  .card:hover { border-color: var(--border-bright); }

  .card-title {
    font-family: 'Syne', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.1px;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stat-block {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }

  .stat-label {
    font-family: 'DM Mono', monospace;
    font-size: 9.5px;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 6px;
  }

  .stat-value {
    font-family: 'Syne', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.5px;
  }

  .stat-sub {
    font-size: 11px;
    color: var(--text2);
    margin-top: 3px;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'DM Sans', sans-serif;
    box-shadow: 0 0 20px rgba(108,99,255,0.25);
  }
  .btn-primary:hover {
    background: #7c74ff;
    box-shadow: 0 0 28px rgba(108,99,255,0.4);
    transform: translateY(-1px);
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 16px;
    background: var(--bg3);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'DM Sans', sans-serif;
  }
  .btn-secondary:hover {
    border-color: var(--border-bright);
    background: rgba(255,255,255,0.04);
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 5px;
    font-family: 'DM Mono', monospace;
    font-size: 10px;
  }

  .tag-green  { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
  .tag-red    { background: rgba(239,68,68,0.15);  color: #ef4444;  border: 1px solid rgba(239,68,68,0.3);  }
  .tag-amber  { background: rgba(245,158,11,0.15); color: #f59e0b;  border: 1px solid rgba(245,158,11,0.3);  }
  .tag-blue   { background: rgba(108,99,255,0.1);  color: var(--accent2); border: 1px solid rgba(108,99,255,0.2); }
  .tag-cyan   { background: rgba(34,211,238,0.1);  color: var(--cyan);   border: 1px solid rgba(34,211,238,0.2); }

  .divider {
    height: 1px;
    background: var(--border);
    margin: 18px 0;
  }

  .input-field {
    width: 100%;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text);
    font-size: 13px;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 0.15s;
  }
  .input-field:focus {
    border-color: rgba(108,99,255,0.5);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }
  .input-field::placeholder { color: var(--text3); }

  textarea.input-field { resize: none; }

  .progress-track {
    height: 4px;
    background: var(--bg3);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.6s ease;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  .data-table thead th {
    font-family: 'DM Mono', monospace;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text3);
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    background: var(--bg3);
  }
  .data-table tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  .data-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .data-table tbody td {
    padding: 9px 12px;
    color: var(--text2);
    vertical-align: middle;
  }
  .data-table tbody td:first-child {
    color: var(--text);
    font-weight: 500;
  }

  .fi-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .fi-label {
    font-family: 'DM Mono', monospace;
    font-size: 10.5px;
    color: var(--text2);
    width: 120px;
    flex-shrink: 0;
  }
  .fi-track {
    flex: 1;
    height: 6px;
    background: var(--bg3);
    border-radius: 4px;
    overflow: hidden;
  }
  .fi-fill {
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
  }
  .fi-val {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--text3);
    width: 36px;
    text-align: right;
  }

  .upload-zone {
    border: 2px dashed var(--border);
    border-radius: 14px;
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.25s;
    text-align: center;
    background: var(--bg3);
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }
  .upload-zone:hover, .upload-zone.drag {
    border-color: rgba(108,99,255,0.5);
    background: var(--accent-dim);
    box-shadow: inset 0 0 40px rgba(108,99,255,0.05);
  }

  .chat-bubble {
    max-width: 75%;
    padding: 12px 15px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.6;
  }
  .chat-bubble.ai {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text);
    border-top-left-radius: 4px;
  }
  .chat-bubble.user {
    background: var(--accent);
    color: white;
    border-top-right-radius: 4px;
    box-shadow: 0 4px 16px rgba(108,99,255,0.25);
  }

  .chat-avatar {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
  .chat-avatar.ai {
    background: linear-gradient(135deg, #6c63ff, #a78bfa);
  }
  .chat-avatar.user {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text2);
  }

  .report-preview {
    background: white;
    border-radius: 8px;
    padding: 20px;
    color: #1a1a2e;
    font-size: 11px;
  }
  .report-preview h3 {
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 12px;
    color: #111;
    font-family: 'Syne', sans-serif;
  }
  .report-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }
  .report-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6c63ff;
    flex-shrink: 0;
  }
  .report-line {
    height: 7px;
    background: #e5e7eb;
    border-radius: 4px;
    flex: 1;
  }
  .report-line.accent {
    background: linear-gradient(90deg, #6c63ff40, #a78bfa40);
  }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; }

  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .mb-4 { margin-bottom: 16px; }
  .mb-5 { margin-bottom: 20px; }
  .mb-6 { margin-bottom: 24px; }

  /* ===== VIZ CONTROLS — compact single row on desktop ===== */
  .viz-controls-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .viz-control-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .viz-control-label {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }
  .viz-select {
    padding: 7px 10px !important;
    font-size: 12px !important;
  }
  .viz-generate-btn {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 8px 14px !important;
    align-self: flex-end;
  }

  /* ===== LAYOUT CLASSES ===== */
  .codegen-layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 16px;
    align-items: start;
  }

  .codegen-tabs {
    display: flex;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .codegen-tabs::-webkit-scrollbar { display: none; }

  .settings-layout {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 16px;
    align-items: start;
  }

  .cleaning-layout {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 16px;
    align-items: start;
  }

  .clean-col-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--bg3);
    border-radius: 9px;
    border: 1px solid var(--border);
  }
  .clean-col-select {
    width: 130px !important;
    padding: 6px 8px !important;
    font-size: 11.5px !important;
    flex-shrink: 0;
    cursor: pointer;
  }
  .clean-col-input {
    width: 120px !important;
    padding: 5px 8px !important;
    font-size: 12px !important;
    flex-shrink: 0;
  }
  .clean-col-action {
    padding: 6px 12px !important;
    font-size: 12px !important;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .clean-header-btns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  /* ===== ANIMATIONS ===== */
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }

  .fade-up { animation: fadeUp 0.35s ease both; }
  .fade-up-1 { animation-delay: 0.05s; }
  .fade-up-2 { animation-delay: 0.1s; }
  .fade-up-3 { animation-delay: 0.15s; }
  .fade-up-4 { animation-delay: 0.2s; }
  .page-enter { animation: fadeUp 0.25s ease both; }
  .spin { animation: spin 0.8s linear infinite; }
  .skeleton {
    background: linear-gradient(90deg, var(--bg3) 25%, rgba(255,255,255,0.04) 50%, var(--bg3) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 6px;
  }

  /* ===== MOBILE OVERLAY ===== */
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 9;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }
  .sidebar-overlay.open { display: block; }

  /* ===== HAMBURGER ===== */
  .hamburger {
    display: none;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg2);
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text2);
    flex-shrink: 0;
    transition: all 0.15s;
  }
  .hamburger:hover {
    border-color: var(--border-bright);
    color: var(--text);
  }

  .page-content * { max-width: 100%; box-sizing: border-box; }
  .page-content { overflow-x: hidden; }

  /* ===== Switch toggle ===== */
  .switch {
    position: relative;
    display: inline-block;
    width: 50px;
    height: 26px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #555;
    transition: .4s;
    border-radius: 34px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: var(--accent);
  }

  input:checked + .slider:before {
    transform: translateX(24px);
  }

  /* ===== 768px ===== */
  @media (max-width: 768px) {
    .hamburger { display: flex; }
    .sidebar {
      position: fixed !important;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 10;
      width: 240px !important;
      min-width: 240px !important;
      transform: translateX(-100%);
      transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
      overflow-y: auto;
    }
    .sidebar.open { transform: translateX(0); box-shadow: 6px 0 40px rgba(0,0,0,0.6); }
    .sidebar-footer {
      display: flex;
      padding: 14px 12px;
      padding-bottom: env(safe-area-inset-bottom, 24px);
      margin-bottom: 16px;
    }
    .main-area { width: 100% !important; flex: 1 1 100% !important; min-width: 0; overflow-x: hidden; }
    .app-wrap { overflow-x: hidden; }
    .topbar { padding: 0 12px; gap: 8px; }
    .topbar-breadcrumb { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
    .status-pill span { display: none; }
    .page-content { padding: 14px; overflow-x: hidden; }
    .page-title { font-size: 18px; }
    .page-subtitle { font-size: 12px; }
    .grid-2 { grid-template-columns: 1fr !important; }
    .grid-3 { grid-template-columns: 1fr !important; }
    .grid-4 { grid-template-columns: 1fr 1fr !important; }
    .card { padding: 14px; }
    .stat-value { font-size: 18px !important; }
    .upload-zone { padding: 24px 16px !important; }
    .insights-wrap { flex-direction: column !important; }
    .insights-panel { width: 100% !important; flex-direction: row !important; flex-wrap: wrap; gap: 10px !important; }
    .insights-panel .card { flex: 1; min-width: 140px; }
    .viz-controls-row { flex-wrap: wrap !important; }
    .viz-control-item { flex: 1 1 calc(50% - 8px) !important; min-width: 120px; }
    .viz-generate-btn { width: 100% !important; justify-content: center; }
    .viz-controls { grid-template-columns: 1fr 1fr !important; }
    .upload-grid { grid-template-columns: 1fr !important; }
    .train-grid { grid-template-columns: 1fr !important; }
    .report-grid { grid-template-columns: 1fr !important; }
    .data-table { min-width: 500px; }
    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

    .codegen-layout  { grid-template-columns: 1fr !important; }
    .settings-layout { grid-template-columns: 1fr !important; }
    .cleaning-layout { grid-template-columns: 1fr !important; }

    .clean-col-row {
      flex-wrap: wrap !important;
      align-items: flex-start !important;
    }
    .clean-col-row > div:first-child { flex: 1 1 100% !important; }
    .clean-col-select, .clean-col-input {
      flex: 1 1 auto !important;
      width: auto !important;
      min-width: 90px !important;
    }

    .flex.gap-2 { flex-wrap: wrap; }
    .fi-label { width: 90px !important; }
  }

  /* ===== 480px ===== */
  @media (max-width: 480px) {
    .page-content { padding: 10px; }
    .grid-4 { grid-template-columns: 1fr 1fr !important; }
    .topbar-breadcrumb { display: none; }
    .card { padding: 12px; }
    .viz-controls-row { flex-direction: column !important; }
    .viz-control-item { flex: 1 1 100% !important; }
    .viz-controls { grid-template-columns: 1fr !important; }
    .btn-primary, .btn-secondary { padding: 8px 12px; font-size: 12px; }
  }

  .viz-controls-horizontal {
    -webkit-overflow-scrolling: touch;
    overflow-x: auto;
    white-space: nowrap;
  }

  .viz-controls-horizontal::-webkit-scrollbar {
    height: 5px;
  }

  .viz-controls-horizontal::-webkit-scrollbar-track {
    background: var(--bg3);
    border-radius: 4px;
  }

  .viz-controls-horizontal::-webkit-scrollbar-thumb {
    background: var(--accent-dim);
    border-radius: 4px;
  }

  .viz-controls-horizontal::-webkit-scrollbar-thumb:hover {
    background: var(--accent);
  }

  @media (min-width: 1200px) {
    .viz-controls-horizontal {
      overflow-x: hidden;
    }
  }

 .modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.modal-input {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text);
  font-size: 13px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 1024px) {
  .large-screen-layout {
    grid-template-columns: 1fr !important;
    gap: 16px;
  }
}
`;