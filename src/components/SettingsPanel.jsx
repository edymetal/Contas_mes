import { useState } from "react";
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "../services/firebase";
import {
  BACKUP_COLLECTIONS,
  createBackupPayload,
  formatBackupSummary,
  restoreFirestoreTimestamps,
  validateAndNormalizeBackupPayload,
} from "../domain/backup";
import { getFirebaseActionError } from "../domain/errors";
import { DiagnosticsPanel } from "./AppFeedback";
import { reportClientError } from "../services/observability";

const MAX_BACKUP_FILE_SIZE = 25 * 1024 * 1024;

export function SettingsPanel({ theme, setTheme }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupMessage, setBackupMessage] = useState(null);

  async function handleExport() {
    setIsExporting(true);
    setBackupMessage(null);
    try {
      const snapshots = await Promise.all(
        BACKUP_COLLECTIONS.map(({ key }) => getDocs(collection(db, key))),
      );
      const collectionData = Object.fromEntries(
        BACKUP_COLLECTIONS.map(({ key }, index) => [
          key,
          snapshots[index].docs.map((document) => ({
            ...document.data(),
            id: document.id,
          })),
        ]),
      );
      const exportObj = createBackupPayload(collectionData);

      const jsonString = JSON.stringify(exportObj, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contas_compartilhadas_backup_${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setBackupMessage({
        type: "success",
        text: `Backup completo exportado: ${formatBackupSummary(exportObj)}.`,
      });
    } catch (error) {
      reportClientError(error, "backup:export");
      setBackupMessage({
        type: "error",
        text: getFirebaseActionError(error, "exportar o backup"),
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function importCollection(collectionName, items) {
    for (let index = 0; index < items.length; index += 400) {
      const batch = writeBatch(db);
      items.slice(index, index + 400).forEach((item) => {
        const { id, ...docData } = item;
        const restoredData = restoreFirestoreTimestamps(
          docData,
          (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds),
        );
        batch.set(doc(db, collectionName, id), restoredData, { merge: true });
      });
      await batch.commit();
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const input = event.currentTarget;

    if (file.size > MAX_BACKUP_FILE_SIZE) {
      setBackupMessage({
        type: "error",
        text: "O arquivo excede o limite de 25 MB permitido para importação.",
      });
      input.value = "";
      return;
    }

    setIsImporting(true);
    setBackupMessage(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const data = validateAndNormalizeBackupPayload(JSON.parse(text));
        const summary = formatBackupSummary(data);
        const confirmed = window.confirm(
          `Backup versão ${data.version}: ${summary}.\n\n` +
          "A importação adiciona ou atualiza esses registros e não apaga os dados atuais. Deseja continuar?",
        );
        if (!confirmed) return;

        for (const { key } of BACKUP_COLLECTIONS) {
          await importCollection(key, data[key]);
        }

        setBackupMessage({
          type: "success",
          text: `Backup versão ${data.version} importado com sucesso: ${summary}.`,
        });
      } catch (error) {
        reportClientError(error, "backup:import");
        const errorMessage = error instanceof SyntaxError
          ? "O arquivo selecionado não contém um JSON válido."
          : getFirebaseActionError(error, "importar o backup");
        setBackupMessage({ type: "error", text: errorMessage });
      } finally {
        setIsImporting(false);
        input.value = "";
      }
    };

    reader.onerror = () => {
      reportClientError(reader.error, "backup:read-file");
      setBackupMessage({ type: "error", text: "Erro ao ler o arquivo selecionado." });
      setIsImporting(false);
      input.value = "";
    };

    reader.readAsText(file);
  }

  return (
    <section className="panel settings-panel">
      <div className="section-heading">
        <h2>Aparência e Personalização</h2>
        <span>Configurações visuais do site</span>
      </div>

      <div style={{ display: "grid", gap: "24px", marginTop: "16px" }}>
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Tema do Sistema</h3>
          <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.9rem" }}>
            Escolha como prefere visualizar o painel de despesas.
          </p>

          <button
            aria-checked={theme === "dark"}
            aria-label="Alternar entre tema claro e tema escuro"
            className="theme-switch-control"
            data-theme-mode={theme}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            role="switch"
            title={theme === "dark" ? "Tema escuro ativo. Clique para usar o tema claro." : "Tema claro ativo. Clique para usar o tema escuro."}
            type="button"
          >
            <span className={theme === "light" ? "theme-switch-label active" : "theme-switch-label"}>
              ☀️ Tema Claro
            </span>
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb">{theme === "dark" ? "🌙" : "☀️"}</span>
            </span>
            <span className={theme === "dark" ? "theme-switch-label active" : "theme-switch-label"}>
              🌙 Tema Escuro
            </span>
          </button>
        </div>

        <hr style={{ border: "0", borderTop: "1px solid var(--line)", margin: "8px 0" }} />

        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Backup de Dados</h3>
          <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: "0.9rem" }}>
            Exporte e restaure contas, acertos, Mercado, outros pagamentos e perfis em um arquivo JSON.
          </p>
          <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.82rem" }}>
            A importação adiciona ou atualiza registros, sem apagar os dados atuais. As notas de mercado incluem os
            metadados registrados; o arquivo original não é armazenado pelo sistema.
          </p>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button"
              onClick={handleExport}
              disabled={isExporting || isImporting}
              style={{ minWidth: "150px" }}
            >
              {isExporting ? "Exportando..." : "📥 Exportar JSON"}
            </button>

            <label
              className="secondary-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isImporting || isExporting ? "not-allowed" : "pointer",
                minWidth: "150px",
                margin: 0,
                textAlign: "center"
              }}
            >
              {isImporting ? "Importando..." : "📤 Importar JSON"}
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={isImporting || isExporting}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {backupMessage && (
            <div
              aria-live="polite"
              role={backupMessage.type === "error" ? "alert" : "status"}
              style={{
                marginTop: "16px",
                padding: "12px",
                borderRadius: "var(--radius-md)",
                background: backupMessage.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: backupMessage.type === "success" ? "#10b981" : "#ef4444",
                border: backupMessage.type === "success" ? "1px solid #10b981" : "1px solid #ef4444",
                fontSize: "0.9rem"
              }}
            >
              {backupMessage.text}
            </div>
          )}
        </div>

        <hr style={{ border: "0", borderTop: "1px solid var(--line)", margin: "8px 0" }} />

        <DiagnosticsPanel />
      </div>
    </section>
  );
}
