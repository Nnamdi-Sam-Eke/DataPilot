import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App error boundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0b0f19",
          color: "#fff",
          fontFamily: "Inter, sans-serif",
        }}>
          <div style={{
            maxWidth: 520,
            width: "100%",
            background: "rgba(20,24,35,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.78)", marginBottom: 18 }}>
              DataPilot hit an unexpected UI error. Reloading the app usually resolves it.
            </div>
            <button
              onClick={this.handleReset}
              style={{
                border: "none",
                borderRadius: 12,
                padding: "10px 14px",
                background: "linear-gradient(135deg, #6c63ff, #8b5cf6)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
