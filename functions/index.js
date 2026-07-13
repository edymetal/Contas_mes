import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const MODEL = "gemini-3.5-flash";
const MAX_BASE64_LENGTH = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_EMAILS = new Set(["edneypugleise@gmail.com", "edneypugliese.dev@gmail.com"]);

const receiptSchema = {
  type: "object",
  properties: {
    market: { type: "string", description: "Nome comercial do supermercado" },
    address: { type: "string", description: "Endereço completo impresso na nota, ou vazio" },
    vatNumber: { type: "string", description: "Partita IVA ou Codice Fiscale, ou vazio" },
    receiptNumber: { type: "string", description: "Número do documento/scontrino, ou vazio" },
    purchasedAt: { type: "string", description: "Data no formato YYYY-MM-DD, ou vazio" },
    purchasedTime: { type: "string", description: "Horário no formato HH:mm, ou vazio" },
    paymentMethod: { type: "string", description: "Forma de pagamento em português, ou vazio" },
    currency: { type: "string", description: "Código ISO da moeda, normalmente EUR" },
    subtotal: { type: "number", description: "Subtotal antes dos descontos; zero se ausente" },
    discountTotal: { type: "number", description: "Soma dos descontos; zero se ausente" },
    taxTotal: { type: "number", description: "Total de IVA explicitamente informado; zero se ausente" },
    total: { type: "number", description: "Total final pago" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    notes: { type: "string", description: "Avisos objetivos sobre trechos ilegíveis ou cálculos, ou vazio" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product: { type: "string", description: "Nome do produto exatamente como impresso em italiano" },
          description: { type: "string", description: "Descrição curta do produto em português" },
          quantity: { type: "number", description: "Quantidade ou peso comprado; use 1 quando não indicado" },
          unit: { type: "string", description: "Unidade, como un, kg ou l" },
          unitValue: { type: "number", description: "Preço por unidade/peso; use o total da linha se não indicado" },
          totalValue: { type: "number", description: "Valor final da linha após desconto" },
          discount: { type: "number", description: "Desconto desta linha; zero se ausente" },
          vatRate: { type: "number", description: "Percentual de IVA; zero se ausente" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["product", "description", "quantity", "unit", "unitValue", "totalValue", "discount", "vatRate", "confidence"],
      },
    },
  },
  required: [
    "market", "address", "vatNumber", "receiptNumber", "purchasedAt", "purchasedTime", "paymentMethod",
    "currency", "subtotal", "discountTotal", "taxTotal", "total", "confidence", "notes", "items",
  ],
};

const prompt = `Analise integralmente esta nota fiscal/scontrino de supermercado, que está em italiano.
Extraia todos os produtos e os dados fiscais visíveis. Não invente informações ilegíveis ou ausentes.
Regras importantes:
- preserve o nome original italiano de cada produto em product;
- escreva apenas uma tradução/explicação curta em português em description;
- converta vírgulas decimais italianas para números JSON;
- diferencie quantidade/peso, preço unitário, desconto e total final da linha;
- datas devem usar YYYY-MM-DD e horários HH:mm;
- valores monetários devem ser números sem símbolo; a moeda padrão é EUR;
- não crie linhas para subtotal, total, pagamento, IVA, sacolas promocionais sem preço ou textos administrativos;
- se um valor não estiver impresso, use string vazia ou zero conforme o schema e reduza confidence;
- confira se a soma dos itens, descontos e total são coerentes e registre divergências em notes.`;

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function extractResponseText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const steps = Array.isArray(response.steps) ? response.steps : [];
  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const content = Array.isArray(steps[stepIndex]?.content) ? steps[stepIndex].content : [];
    const textPart = content.find((part) => typeof part?.text === "string");
    if (textPart) return textPart.text;
  }
  throw new Error("O Gemini não devolveu conteúdo estruturado.");
}

function normalizeReceipt(receipt) {
  const normalizedItems = (Array.isArray(receipt.items) ? receipt.items : [])
    .filter((item) => item && String(item.product || "").trim())
    .map((item) => {
      const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      const totalValue = Math.max(0, roundMoney(item.totalValue));
      const unitValue = Number(item.unitValue) > 0 ? roundMoney(item.unitValue) : roundMoney(totalValue / quantity);
      return {
        product: String(item.product).trim(),
        description: String(item.description || "").trim(),
        quantity,
        unit: String(item.unit || "un").trim() || "un",
        unitValue,
        totalValue,
        discount: Math.max(0, roundMoney(item.discount)),
        vatRate: Math.max(0, Number(item.vatRate) || 0),
        confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
      };
    });

  return {
    market: String(receipt.market || "").trim(),
    address: String(receipt.address || "").trim(),
    vatNumber: String(receipt.vatNumber || "").trim(),
    receiptNumber: String(receipt.receiptNumber || "").trim(),
    purchasedAt: /^\d{4}-\d{2}-\d{2}$/.test(receipt.purchasedAt || "") ? receipt.purchasedAt : "",
    purchasedTime: /^\d{2}:\d{2}$/.test(receipt.purchasedTime || "") ? receipt.purchasedTime : "",
    paymentMethod: String(receipt.paymentMethod || "").trim(),
    currency: String(receipt.currency || "EUR").trim().toUpperCase() || "EUR",
    subtotal: Math.max(0, roundMoney(receipt.subtotal)),
    discountTotal: Math.max(0, roundMoney(receipt.discountTotal)),
    taxTotal: Math.max(0, roundMoney(receipt.taxTotal)),
    total: Math.max(0, roundMoney(receipt.total)),
    confidence: Math.min(1, Math.max(0, Number(receipt.confidence) || 0)),
    notes: String(receipt.notes || "").trim(),
    items: normalizedItems,
    model: MODEL,
  };
}

export const analyzeMarketReceipt = onCall(
  {
    region: "europe-west1",
    secrets: [geminiApiKey],
    memory: "512MiB",
    timeoutSeconds: 120,
    maxInstances: 5,
    enforceAppCheck: false,
  },
  async (request) => {
    const email = String(request.auth?.token?.email || "").toLowerCase();
    if (!request.auth || !ALLOWED_EMAILS.has(email)) {
      throw new HttpsError("permission-denied", "Sua conta não tem permissão para analisar notas fiscais.");
    }

    const { data, mimeType } = request.data || {};
    if (!ALLOWED_MIME_TYPES.has(mimeType) || typeof data !== "string" || !data.length) {
      throw new HttpsError("invalid-argument", "Envie uma imagem JPG, PNG, WebP ou um PDF válido.");
    }
    if (data.length > MAX_BASE64_LENGTH) {
      throw new HttpsError("invalid-argument", "O arquivo é grande demais para análise.");
    }

    const inputType = mimeType === "application/pdf" ? "document" : "image";
    try {
      const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey.value(),
        },
        body: JSON.stringify({
          model: MODEL,
          input: [
            { type: "text", text: prompt },
            { type: inputType, data, mime_type: mimeType },
          ],
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: receiptSchema,
          },
        }),
      });

      const responseBody = await geminiResponse.json();
      if (!geminiResponse.ok) {
        logger.error("Gemini receipt analysis failed", {
          status: geminiResponse.status,
          error: responseBody?.error?.message,
        });
        throw new Error(responseBody?.error?.message || `Gemini HTTP ${geminiResponse.status}`);
      }

      const receipt = normalizeReceipt(JSON.parse(extractResponseText(responseBody)));
      if (!receipt.items.length) {
        throw new HttpsError("failed-precondition", "Nenhum produto foi identificado. Tente uma foto mais nítida e completa.");
      }
      return receipt;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Could not analyze market receipt", { message: error?.message });
      throw new HttpsError("internal", "Não foi possível ler a nota agora. Tente novamente em alguns instantes.");
    }
  },
);
