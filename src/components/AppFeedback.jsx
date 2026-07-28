import { Component, useEffect, useState } from "react";
import { Activity, Download, RotateCcw, Trash2, WifiOff } from "lucide-react";
import {
  clearClientDiagnostics,
  getClientDiagnostics,
  reportClientError,
  subscribeToDiagnostics,
} from "../services/observability.js";

export class AppErrorBoundary extends Component {
  state = { hasError: false, incidentId: "" };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    const incident = reportClientError(error, "react:error-boundary");
    this.setState({ incidentId: incident.id });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="login-screen app-crash-screen">
        <section className="login-panel" role="alert" aria-labelledby="app-crash-title">
          <Activity aria-hidden="true" size={36} />
          <h1 id="app-crash-title">O painel encontrou um problema</h1>
          <p>
            A falha interrompeu esta tela. Recarregue a página para continuar com segurança.
          </p>
          {this.state.incidentId && (
            <small>Código do diagnóstico: {this.state.incidentId}</small>
          )}
          <button
            className="primary-button"
            onClick={() => window.location.reload()}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} />
            Recarregar página
          </button>
        </section>
      </main>
    );
  }
}

export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ));
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    let onlineMessageTimer;
    const handleOffline = () => {
      setWasOffline(true);
      setIsOnline(false);
    };
    const handleOnline = () => {
      setIsOnline(true);
      onlineMessageTimer = window.setTimeout(() => setWasOffline(false), 5000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(onlineMessageTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (isOnline && !wasOffline) return null;

  return (
    <div
      className={`connection-status ${isOnline ? "online" : "offline"}`}
      role={isOnline ? "status" : "alert"}
      aria-live={isOnline ? "polite" : "assertive"}
    >
      {isOnline ? (
        <>Conexão restabelecida. Os dados voltarão a sincronizar.</>
      ) : (
        <>
          <WifiOff aria-hidden="true" size={18} />
          Você está sem conexão. Consulte os dados exibidos e tente alterar novamente quando a internet voltar.
        </>
      )}
    </div>
  );
}

export function DiagnosticsPanel() {
  const [diagnostics, setDiagnostics] = useState(() => getClientDiagnostics());

  useEffect(() => subscribeToDiagnostics(() => {
    setDiagnostics(getClientDiagnostics());
  }), []);

  function handleDownload() {
    const payload = {
      application: "Contas Compartilhadas",
      generatedAt: new Date().toISOString(),
      diagnostics,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contas_diagnostico_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleClear() {
    clearClientDiagnostics();
    setDiagnostics([]);
  }

  const lastDiagnostic = diagnostics.at(-1);

  return (
    <div className="diagnostics-panel">
      <h3>Diagnóstico local</h3>
      <p>
        O registro inclui apenas contexto técnico sanitizado e não inclui coleções, documentos, chaves ou e-mails.
      </p>
      <div className="diagnostics-summary" role="status" aria-live="polite">
        <Activity aria-hidden="true" size={20} />
        <span>
          {diagnostics.length
            ? `${diagnostics.length} ${diagnostics.length === 1 ? "falha registrada" : "falhas registradas"}`
            : "Nenhuma falha inesperada registrada nesta sessão"}
          {lastDiagnostic && ` · última em ${new Date(lastDiagnostic.timestamp).toLocaleString("pt-BR")}`}
        </span>
      </div>
      {diagnostics.length > 0 && (
        <div className="diagnostics-actions">
          <button className="secondary-button" onClick={handleDownload} type="button">
            <Download aria-hidden="true" size={17} />
            Baixar diagnóstico
          </button>
          <button className="danger-link-button" onClick={handleClear} type="button">
            <Trash2 aria-hidden="true" size={17} />
            Limpar diagnóstico
          </button>
        </div>
      )}
    </div>
  );
}
