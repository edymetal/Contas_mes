const MODEL = "gemini-3.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const STORAGE_KEY = "contas_mes_gemini_api_key";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_SIZE = 7 * 1024 * 1024;
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);
const RETRY_DELAYS_MS = [500, 1500];

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
          description: { type: "string", description: "Categoria genérica em português com 1 palavra ou, no máximo, 2 palavras" },
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
- em description, escreva somente a categoria genérica do produto em português, com 1 palavra ou, no máximo, 2 palavras;
- não repita marca, sabor, peso, volume, quantidade ou tamanho em description;
- use categorias simples e consistentes, por exemplo: Leite, Pães, Salsicha, Cerveja, Biscoitos, Chocolates, Salgadinhos, Açúcar, Papel Higiênico, Taxas/Sacolas, Café e Detergente;
- converta vírgulas decimais italianas para números JSON;
- diferencie quantidade/peso, preço unitário, desconto e total final da linha;
- datas devem usar YYYY-MM-DD e horários HH:mm;
- valores monetários devem ser números sem símbolo; a moeda padrão é EUR;
- não crie linhas para subtotal, total, pagamento, IVA, sacolas promocionais sem preço ou textos administrativos;
- se um valor não estiver impresso, use string vazia ou zero conforme o schema e reduza confidence;
- confira se a soma dos itens, descontos e total são coerentes e registre divergências em notes.`;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("A imagem selecionada não pôde ser aberta."));
    };
    image.src = url;
  });
}

async function optimizeImage(file) {
  if (!file.type.startsWith("image/") || file.size <= 2.5 * 1024 * 1024) return file;

  const image = await loadImage(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, 2400 / longestSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("Não foi possível preparar a foto para leitura.");
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

const receiptCategoryRules = [
  [/shopper|sacchett|borsa bio/, "Taxas/Sacolas"],
  [/birra|cerveja/, "Cerveja"],
  [/wurstel|salsicc/, "Salsicha"],
  [/biscott/, "Biscoitos"],
  [/cioccol|snicker|\bmars\b/, "Chocolates"],
  [/patatin|salgadinh/, "Salgadinhos"],
  [/zuccher|acucar/, "Açúcar"],
  [/igienic/, "Papel Higiênico"],
  [/caffe|cafe/, "Café"],
  [/deters|deterg|lavapiatt/, "Detergente"],
  [/\blatte\b|\bleite\b/, "Leite"],
  [/salumer|prosciutt|salame|mortadell|\bfrios\b|embutid/, "Frios"],
  [/pane|panin|baguette|sfornasole|\bpao\b|\bpaes\b/, "Pães"],
  [/formaggi|formaggio|mozzarell|queijo/, "Queijos"],
  [/yogurt|iogurte/, "Iogurte"],
  [/\buova\b|\bovo|ovos/, "Ovos"],
  [/\briso\b|arroz/, "Arroz"],
  [/pasta|spaghetti|penne|macarrao/, "Massas"],
  [/\bpollo\b|frango/, "Frango"],
  [/\bacqua\b|\bagua\b/, "Água"],
];

export function normalizeReceiptCategory(product, description) {
  const normalizedSource = `${product || ""} ${description || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const matchedCategory = receiptCategoryRules.find(([pattern]) => pattern.test(normalizedSource));
  if (matchedCategory) return matchedCategory[1];

  const words = String(description || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join(" ");
  const connectors = new Set(["a", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "para"]);
  const meaningfulWords = words.filter((word) => !connectors.has(word.toLowerCase()));
  return (meaningfulWords.length ? meaningfulWords : words).slice(0, 2).join(" ");
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
        description: normalizeReceiptCategory(item.product, item.description),
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

function getApiErrorMessage(status, error = {}) {
  const details = String(error?.message || "").trim();
  const reason = error?.details?.find((item) => item?.reason)?.reason || "";
  if (reason === "API_KEY_INVALID" || /api key not valid|invalid api key/i.test(details)) {
    return "A chave Gemini é inválida. Crie uma nova chave no Google AI Studio e configure-a novamente.";
  }
  if (status === 401 || status === 403) return "A chave Gemini não tem acesso ao modelo. Confira a chave e as restrições da API.";
  if (status === 404) return `O modelo ${MODEL} não está disponível para esta chave.`;
  if (status === 429) return "O limite gratuito do Gemini foi atingido. Aguarde a renovação da cota e tente novamente.";
  if (status >= 500) return "O Gemini está temporariamente indisponível. Tente novamente em alguns instantes.";
  if (status === 400 && /image|inline.?data|mime.?type|document|pdf/i.test(details)) {
    return "O Gemini não conseguiu processar este arquivo. Tente outra foto ou um arquivo com formato diferente.";
  }
  if (status === 400 && details) return `O Gemini rejeitou a solicitação: ${details}`;
  return details || "Não foi possível ler a nota agora. Tente novamente.";
}

async function requestGemini(path, apiKey, options = {}) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    let response;
    try {
      response = await fetch(`${GEMINI_API_BASE}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          ...options.headers,
        },
      });
    } catch {
      throw new Error("Não foi possível conectar ao Gemini. Confira sua internet e tente novamente.");
    }

    const responseBody = await response.json().catch(() => ({}));
    if (response.ok) return responseBody;

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      continue;
    }

    throw new Error(getApiErrorMessage(response.status, responseBody?.error));
  }

  throw new Error("Não foi possível ler a nota agora. Tente novamente.");
}

export function getStoredGeminiApiKey() {
  return typeof window === "undefined" ? "" : localStorage.getItem(STORAGE_KEY) || "";
}

export function saveStoredGeminiApiKey(apiKey) {
  const normalizedKey = String(apiKey || "").trim();
  if (!normalizedKey) throw new Error("Informe uma chave válida do Gemini.");
  localStorage.setItem(STORAGE_KEY, normalizedKey);
  return normalizedKey;
}

export function removeStoredGeminiApiKey() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function validateGeminiApiKey(apiKey) {
  const normalizedKey = String(apiKey || "").trim();
  if (!normalizedKey) throw new Error("Informe a chave da API do Gemini.");
  await requestGemini(`/models/${MODEL}`, normalizedKey, { method: "GET", headers: {} });
  return normalizedKey;
}

export async function analyzeMarketReceipt(file, apiKey) {
  const normalizedKey = String(apiKey || "").trim();
  if (!normalizedKey) throw new Error("Configure sua chave Gemini antes de analisar a nota.");
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Envie uma foto JPG, PNG ou WebP, ou uma nota em PDF.");
  }

  const preparedFile = await optimizeImage(file);
  if (preparedFile.size > MAX_FILE_SIZE) {
    throw new Error("O arquivo deve ter no máximo 7 MB. Tente uma foto com resolução menor.");
  }

  const dataUrl = await readAsDataUrl(preparedFile);
  const base64 = String(dataUrl).split(",")[1];
  const response = await requestGemini(`/models/${MODEL}:generateContent`, normalizedKey, {
    method: "POST",
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: base64, mimeType: preparedFile.type } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        responseFormat: {
          text: {
            mimeType: "application/json",
            schema: receiptSchema,
          },
        },
      },
    }),
  });

  const responseText = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || "")
    .join("")
    .trim();
  if (!responseText) throw new Error("O Gemini não devolveu informações da nota.");

  let receipt;
  try {
    receipt = normalizeReceipt(JSON.parse(responseText));
  } catch {
    throw new Error("O Gemini devolveu uma resposta incompleta. Tente analisar a nota novamente.");
  }
  if (!receipt.items.length) {
    throw new Error("Nenhum produto foi identificado. Tente uma foto mais nítida e completa.");
  }
  return receipt;
}
