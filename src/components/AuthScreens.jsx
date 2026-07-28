import { CircleDollarSign, Home } from "lucide-react";

export function LoadingScreen() {
  return (
    <main aria-busy="true" className="login-screen">
      <div aria-hidden="true" className="loader" />
      <span className="sr-only" role="status" aria-live="polite">Carregando o sistema</span>
    </main>
  );
}

export function LoginScreen({ error, missingConfig, onLogin }) {
  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand large">
          <div className="brand-mark">
            <Home aria-hidden="true" size={28} />
          </div>
          <div>
            <strong>Contas</strong>
            <span>Compartilhadas</span>
          </div>
        </div>

        <h1>Controle familiar de despesas</h1>
        <p>Entre com uma conta Google autorizada para acessar as despesas compartilhadas.</p>

        {missingConfig ? (
          <div className="error-box" role="alert">Preencha o arquivo .env com as credenciais do Firebase.</div>
        ) : (
          <button className="google-button" onClick={onLogin} type="button">
            <CircleDollarSign aria-hidden="true" size={20} />
            Entrar com o Google
          </button>
        )}

        {error && <div className="error-box" role="alert">{error}</div>}
      </section>
    </main>
  );
}
