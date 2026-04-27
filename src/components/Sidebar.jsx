import { NavIcon } from "../shared/icons.jsx";
import { useDataPilot } from "../DataPilotContext";

export const NAV = [
  { id: "dashboard",     label: "Dashboard",      icon: "home",     group: "workspace" },
  { id: "upload",        label: "Upload Data",     icon: "upload",   group: "workspace" },
  { id: "overview",      label: "Data Overview",   icon: "chart",    group: "workspace" },
  { id: "cleaning",      label: "Data Cleaning",   icon: "wand",     group: "workspace" },
  { id: "insights",      label: "Ask DataPilot",   icon: "brain",    group: "workspace", badge: "AI" },
  { id: "visualization", label: "Visualizations",  icon: "predict",  group: "analysis"  },
  { id: "train",         label: "Train Model",     icon: "model",    group: "analysis"  },
  { id: "predictions",   label: "Predictions",     icon: "sparkle",  group: "analysis"  },
  { id: "report",        label: "Reports",         icon: "file",     group: "analysis"  },
  { id: "codegen",       label: "Code Export",     icon: "code",     group: "analysis"  },
  { id: "settings",      label: "Settings",        icon: "settings", group: "account"   },
];

export default function Sidebar({ page, setPage, isOpen }) {
  const { userProfile } = useDataPilot();
  const workspace = NAV.filter((n) => n.group === "workspace");
  const analysis  = NAV.filter((n) => n.group === "analysis");
  const account   = NAV.filter((n) => n.group === "account");

  const displayName  = userProfile?.displayName || userProfile?.email || "User";
  const plan         = userProfile?.plan || "Free";
  const avatarLetter = displayName.charAt(0).toUpperCase() || "U";

  // FIX: setPage sends paths like "/dashboard"; compare with the same shape.
  const isActive = (id) => page === `/${id}` || page === id;

  return (
    <nav className={`sidebar${isOpen ? " open" : ""}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">dp</div>
        <div className="logo-text">Data<span>Pilot</span></div>
      </div>
      <div className="sidebar-section">
        <div className="sidebar-section-label">Workspace</div>
        {workspace.map((n) => (
          <div key={n.id} className={`nav-item ${isActive(n.id) ? "active" : ""}`} onClick={() => setPage(`/${n.id}`)}>
            <NavIcon name={n.icon} />{n.label}
            {n.badge && <span className="nav-badge">{n.badge}</span>}
          </div>
        ))}
      </div>
      <div className="sidebar-section">
        <div className="sidebar-section-label">Analysis</div>
        {analysis.map((n) => (
          <div key={n.id} className={`nav-item ${isActive(n.id) ? "active" : ""}`} onClick={() => setPage(`/${n.id}`)}>
            <NavIcon name={n.icon} />{n.label}
          </div>
        ))}
      </div>
      <div className="sidebar-section">
        <div className="sidebar-section-label">Account</div>
        {account.map((n) => (
          <div key={n.id} className={`nav-item ${isActive(n.id) ? "active" : ""}`} onClick={() => setPage(`/${n.id}`)}>
            <NavIcon name={n.icon} />{n.label}
          </div>
        ))}
      </div>
      <div className="sidebar-footer mb-8">
        <div className="user-chip">
          <div className="avatar">{avatarLetter}</div>
          <div><div className="user-name">{displayName}</div><div className="user-role">{plan} Plan</div></div>
        </div>
      </div>
    </nav>
  );
}