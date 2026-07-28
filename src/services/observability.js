const DIAGNOSTICS_STORAGE_KEY = "contas_mes_diagnostics";
const DIAGNOSTICS_EVENT = "contas-mes:diagnostics-changed";
const MAX_DIAGNOSTICS = 20;

let runtimeVersion = "unknown";

export function sanitizeDiagnosticText(value, fallback = "") {
  const text = String(value ?? fallback)
    .replace(
      /((?:api[_ -]?key|token|password|authorization|credential)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[removido]",
    )
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[chave removida]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[e-mail removido]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 240);
}

export function createDiagnosticEntry(error, context, environment = {}) {
  const normalizedError = error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : "Falha inesperada");
  const timestamp = environment.timestamp || new Date().toISOString();
  const idSource = `${timestamp}-${environment.randomValue ?? Math.random()}`;
  const rawPath = environment.path ?? (
    typeof location === "undefined" ? "" : location.pathname
  );

  return {
    id: idSource.replace(/[^a-z0-9]/gi, "").slice(-24),
    timestamp,
    version: sanitizeDiagnosticText(environment.version || runtimeVersion, "unknown"),
    context: sanitizeDiagnosticText(context, "unknown"),
    name: sanitizeDiagnosticText(normalizedError.name, "Error"),
    code: sanitizeDiagnosticText(normalizedError.code, ""),
    message: sanitizeDiagnosticText(normalizedError.message, "Falha inesperada"),
    online: environment.online ?? (
      typeof navigator === "undefined" ? null : navigator.onLine
    ),
    path: sanitizeDiagnosticText(String(rawPath).split(/[?#]/)[0]),
  };
}

export function appendDiagnostic(entries, entry) {
  return [...entries, entry].slice(-MAX_DIAGNOSTICS);
}

function getSessionStorage() {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function notifyDiagnosticsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DIAGNOSTICS_EVENT));
}

export function getClientDiagnostics() {
  const storage = getSessionStorage();
  if (!storage) return [];

  try {
    const value = JSON.parse(storage.getItem(DIAGNOSTICS_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.slice(-MAX_DIAGNOSTICS) : [];
  } catch {
    return [];
  }
}

export function reportClientError(error, context) {
  const entry = createDiagnosticEntry(error, context);
  const storage = getSessionStorage();

  if (storage) {
    try {
      storage.setItem(
        DIAGNOSTICS_STORAGE_KEY,
        JSON.stringify(appendDiagnostic(getClientDiagnostics(), entry)),
      );
    } catch {
      // Observability must never interrupt the application flow.
    }
  }

  console.error("[Contas] Falha registrada", {
    id: entry.id,
    context: entry.context,
    code: entry.code,
    message: entry.message,
  });
  notifyDiagnosticsChanged();

  return entry;
}

export function clearClientDiagnostics() {
  const storage = getSessionStorage();
  try {
    storage?.removeItem(DIAGNOSTICS_STORAGE_KEY);
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
  notifyDiagnosticsChanged();
}

export function subscribeToDiagnostics(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DIAGNOSTICS_EVENT, listener);
  return () => window.removeEventListener(DIAGNOSTICS_EVENT, listener);
}

export function installGlobalErrorMonitoring({ version } = {}) {
  runtimeVersion = version || runtimeVersion;
  if (typeof window === "undefined") return () => {};

  const handleWindowError = (event) => {
    reportClientError(event.error || new Error(event.message), "window:error");
  };
  const handleUnhandledRejection = (event) => {
    reportClientError(event.reason, "window:unhandled-rejection");
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}
