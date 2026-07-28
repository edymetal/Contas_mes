import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  KeyRound,
  LoaderCircle,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { roundMoney } from "../domain/expenses";
import {
  analyzeMarketReceipt,
  getStoredGeminiApiKey,
  removeStoredGeminiApiKey,
  saveStoredGeminiApiKey,
  validateGeminiApiKey,
} from "../services/receiptAnalysis";
import { reportClientError } from "../services/observability";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { formatCurrency, todayInputValue } from "../utils/presentation";

export function MarketReceiptImporter({ onConfirm }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [apiKey, setApiKey] = useState(() => getStoredGeminiApiKey());
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState({ name: "", type: "", url: "" });

  useEffect(() => () => {
    if (preview.url) URL.revokeObjectURL(preview.url);
  }, [preview.url]);

  function clearImport() {
    setDraft(null);
    setError("");
    setPreview({ name: "", type: "", url: "" });
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openFilePicker(inputRef) {
    if (!apiKey) {
      setError("Configure sua chave gratuita do Gemini para analisar a nota.");
      setIsKeyModalOpen(true);
      return;
    }
    inputRef.current?.click();
  }

  async function handleSelectedFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setDraft(null);
    setPreview({ name: file.name, type: file.type, url: URL.createObjectURL(file) });
    setIsAnalyzing(true);
    try {
      const result = await analyzeMarketReceipt(file, apiKey);
      setDraft({
        ...result,
        purchasedAt: result.purchasedAt || todayInputValue(),
        currency: result.currency || "EUR",
      });
    } catch (analysisError) {
      reportClientError(analysisError, "receipt:analyze");
      setError(analysisError?.message || "Não foi possível analisar a nota fiscal.");
    } finally {
      setIsAnalyzing(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <section className="panel receipt-import-panel">
        <div className="receipt-import-copy">
          <span className="receipt-import-icon"><Sparkles size={22} /></span>
          <div>
            <span className="eyebrow">Preenchimento automático</span>
            <h2>Importar nota fiscal italiana</h2>
            <p>Fotografe ou envie a nota. O Gemini identifica mercado, data, totais e todos os produtos para você conferir antes de adicionar.</p>
          </div>
        </div>
        <div className="receipt-import-actions">
          <input
            ref={cameraInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleSelectedFile}
          />
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleSelectedFile}
          />
          <button className="primary-button" type="button" disabled={isAnalyzing} onClick={() => openFilePicker(cameraInputRef)}>
            <Camera size={18} /> Tirar foto
          </button>
          <button className="secondary-button" type="button" disabled={isAnalyzing} onClick={() => openFilePicker(fileInputRef)}>
            <Upload size={18} /> Enviar arquivo
          </button>
        </div>
        <div className={apiKey ? "receipt-key-status configured" : "receipt-key-status"}>
          <span>
            {apiKey ? <span className="receipt-key-active-icon"><Check size={12} strokeWidth={3} /></span> : <KeyRound size={15} />}
            {apiKey ? "Gemini ativa" : "Chave Gemini necessária"}
          </span>
          <button type="button" onClick={() => setIsKeyModalOpen(true)}>
            {apiKey ? "Gerenciar" : "Configurar"}
          </button>
        </div>
        {isAnalyzing && (
          <div className="receipt-analysis-status" role="status">
            <LoaderCircle className="spin-icon" size={20} />
            <div><strong>Lendo a nota em italiano…</strong><span>Identificando dados fiscais, valores e produtos.</span></div>
          </div>
        )}
        {error && <p className="form-error receipt-import-error" role="alert">{error}</p>}
      </section>

      {draft && (
        <ReceiptReviewModal
          draft={draft}
          preview={preview}
          onChange={setDraft}
          onClose={clearImport}
          onConfirm={async (receipt) => {
            await onConfirm(receipt);
            clearImport();
          }}
        />
      )}

      {isKeyModalOpen && (
        <GeminiApiKeyModal
          hasStoredKey={Boolean(apiKey)}
          onClose={() => setIsKeyModalOpen(false)}
          onSaved={(newKey) => {
            const storedKey = saveStoredGeminiApiKey(newKey);
            setApiKey(storedKey);
            setError("");
            setIsKeyModalOpen(false);
          }}
          onRemove={() => {
            removeStoredGeminiApiKey();
            setApiKey("");
            setError("Chave removida deste aparelho.");
            setIsKeyModalOpen(false);
          }}
        />
      )}
    </>
  );
}
function GeminiApiKeyModal({ hasStoredKey, onClose, onSaved, onRemove }) {
  const dialogRef = useDialogAccessibility(onClose);
  const [apiKey, setApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setValidationError("");
    setIsValidating(true);
    try {
      const validKey = await validateGeminiApiKey(apiKey);
      onSaved(validKey);
    } catch (keyError) {
      reportClientError(keyError, "receipt:validate-key");
      setValidationError(keyError?.message || "Não foi possível validar a chave.");
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        aria-labelledby="gemini-key-title"
        aria-modal="true"
        className="modal gemini-key-modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="section-heading gemini-key-heading">
          <div>
            <span className="eyebrow">Configuração gratuita</span>
            <h2 id="gemini-key-title">Chave da API do Gemini</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}><X size={20} /></button>
        </div>
        <span className="receipt-import-icon"><KeyRound size={22} /></span>
        <p>
          A chave fica salva somente neste navegador e é enviada diretamente ao Google quando uma nota é analisada.
          Ela não entra no código nem na publicação do GitHub Pages.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Chave da API</span>
            <input
              autoComplete="new-password"
              autoFocus
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasStoredKey ? "Cole uma nova chave para substituir" : "Cole aqui sua chave da API"}
              disabled={isValidating}
            />
          </label>
          <p className="gemini-key-help">
            Use uma chave exclusiva e restrita à Gemini API. Você pode criá-la no <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.
          </p>
          {validationError && <p className="form-error" role="alert">{validationError}</p>}
          <div className="modal-actions gemini-key-actions">
            {hasStoredKey && (
              <button className="danger-link-button" type="button" disabled={isValidating} onClick={onRemove}>
                <Trash2 size={17} /> Remover deste aparelho
              </button>
            )}
            <button className="secondary-button" type="button" disabled={isValidating} onClick={onClose}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={isValidating || !apiKey.trim()}>
              {isValidating ? <><LoaderCircle className="spin-icon" size={18} /> Validando…</> : <><Check size={18} /> Validar e salvar</>}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ReceiptReviewModal({ draft, preview, onChange, onClose, onConfirm }) {
  const dialogRef = useDialogAccessibility(onClose);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const itemsTotal = useMemo(
    () => roundMoney(draft.items.reduce((sum, item) => sum + Number(String(item.totalValue || 0).replace(",", ".")), 0)),
    [draft.items],
  );
  const receiptTotal = Number(String(draft.total || 0).replace(",", "."));
  const difference = roundMoney(itemsTotal - receiptTotal);

  function updateField(field, value) {
    onChange((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index, field, value) {
    onChange((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  }

  function removeItem(index) {
    onChange((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");
    setIsSaving(true);
    try {
      await onConfirm(draft);
    } catch (error) {
      reportClientError(error, "receipt:save");
      setSaveError(error?.message || "Não foi possível adicionar os itens.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop receipt-review-backdrop" role="presentation">
      <section
        aria-labelledby="receipt-review-title"
        aria-modal="true"
        className="modal receipt-review-modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="section-heading receipt-review-heading">
          <div>
            <span className="eyebrow">Conferência obrigatória</span>
            <h2 id="receipt-review-title">Confira os dados da nota</h2>
            <span>Edite qualquer informação que não corresponda ao documento.</span>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="receipt-review-layout">
            <aside className="receipt-preview-pane">
              {preview.type === "application/pdf" ? (
                <object data={preview.url} type="application/pdf" aria-label="Prévia da nota fiscal">
                  <p>Prévia do PDF indisponível.</p>
                </object>
              ) : (
                <img src={preview.url} alt="Nota fiscal selecionada para conferência" />
              )}
              <small title={preview.name}>{preview.name}</small>
            </aside>

            <div className="receipt-data-pane">
              <div className="form-grid receipt-metadata-grid">
                <label>Mercado<input value={draft.market} onChange={(event) => updateField("market", event.target.value)} required /></label>
                <label>Data<input type="date" value={draft.purchasedAt} onChange={(event) => updateField("purchasedAt", event.target.value)} required /></label>
                <label>Horário<input type="time" value={draft.purchasedTime} onChange={(event) => updateField("purchasedTime", event.target.value)} /></label>
                <label>Nº da nota<input value={draft.receiptNumber} onChange={(event) => updateField("receiptNumber", event.target.value)} /></label>
                <label className="receipt-wide-field">Endereço<input value={draft.address} onChange={(event) => updateField("address", event.target.value)} /></label>
                <label>Partita IVA<input value={draft.vatNumber} onChange={(event) => updateField("vatNumber", event.target.value)} /></label>
                <label>Pagamento<input value={draft.paymentMethod} onChange={(event) => updateField("paymentMethod", event.target.value)} /></label>
              </div>

              <div className="receipt-totals-grid">
                <label>Subtotal (€)<input type="number" min="0" step="0.01" value={draft.subtotal} onChange={(event) => updateField("subtotal", event.target.value)} /></label>
                <label>Descontos (€)<input type="number" min="0" step="0.01" value={draft.discountTotal} onChange={(event) => updateField("discountTotal", event.target.value)} /></label>
                <label>IVA (€)<input type="number" min="0" step="0.01" value={draft.taxTotal} onChange={(event) => updateField("taxTotal", event.target.value)} /></label>
                <label className="receipt-grand-total">Total da nota (€)<input type="number" min="0" step="0.01" value={draft.total} onChange={(event) => updateField("total", event.target.value)} required /></label>
              </div>
            </div>
          </div>

          <div className="receipt-items-heading">
            <div><h3>Produtos identificados</h3><span>{draft.items.length} {draft.items.length === 1 ? "item" : "itens"}</span></div>
            <strong>{formatCurrency(itemsTotal)}</strong>
          </div>

          {Math.abs(difference) > 0.02 && (
            <div className="receipt-warning"><AlertTriangle size={18} /><span>A soma dos itens difere do total da nota em {formatCurrency(Math.abs(difference))}. Confira descontos e valores.</span></div>
          )}
          <div className="receipt-ai-note"><strong>Modelo utilizado:</strong> {draft.model}</div>
          {draft.notes && <div className="receipt-ai-note"><strong>Observação da leitura:</strong> {draft.notes}</div>}

          <div className="receipt-review-table-wrap">
            <table className="receipt-review-table">
              <caption className="sr-only">Produtos identificados na nota fiscal</caption>
              <thead><tr><th scope="col">Produto (italiano)</th><th scope="col">Descrição</th><th scope="col">Qtd.</th><th scope="col">Un.</th><th scope="col">Unitário</th><th scope="col">Desconto</th><th scope="col">Total</th><th aria-label="Ações" scope="col" /></tr></thead>
              <tbody>
                {draft.items.map((item, index) => (
                  <tr key={index}>
                    <td><input aria-label={`Produto ${index + 1}`} value={item.product} onChange={(event) => updateItem(index, "product", event.target.value)} required /></td>
                    <td><input aria-label={`Descrição ${index + 1}`} value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} /></td>
                    <td><input aria-label={`Quantidade ${index + 1}`} type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} required /></td>
                    <td><input aria-label={`Unidade ${index + 1}`} value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} /></td>
                    <td><input aria-label={`Valor unitário ${index + 1}`} type="number" min="0" step="0.01" value={item.unitValue} onChange={(event) => updateItem(index, "unitValue", event.target.value)} required /></td>
                    <td><input aria-label={`Desconto ${index + 1}`} type="number" min="0" step="0.01" value={item.discount} onChange={(event) => updateItem(index, "discount", event.target.value)} /></td>
                    <td><input aria-label={`Total ${index + 1}`} type="number" min="0" step="0.01" value={item.totalValue} onChange={(event) => updateItem(index, "totalValue", event.target.value)} required /></td>
                    <td><button className="icon-button danger-button" type="button" title="Remover item" onClick={() => removeItem(index)}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!draft.items.length && <div className="empty-state">Todos os itens foram removidos. Analise a nota novamente.</div>}
          </div>

          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          <div className="modal-actions receipt-review-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={isSaving}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={isSaving || !draft.items.length}>
              {isSaving ? <LoaderCircle className="spin-icon" size={18} /> : <Check size={18} />}
              {isSaving ? "Adicionando…" : `Conferi e adicionar ${draft.items.length} itens`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
