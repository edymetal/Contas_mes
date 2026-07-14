import { spawnSync } from "node:child_process";

const projectId = "contas-mes-ba741";
const databaseId = "(default)";
const importKey = "market-history-2026-04-09-to-2026-06-28";

const rows = [
  ["ARD", "2026-04-09", "OPTIMO LATTE P.S. LT.1", 12, 0.69, 8.28],
  ["ARD", "2026-04-09", "SFORNASOLE MAXI BURGER GR. 300", 1, 0.85, 0.85],
  ["ARD", "2026-04-09", "DJANGO WURSTEL POLLO TACCH. X10", 1, 2.79, 2.79],
  ["ARD", "2026-04-09", "PANETTERIA", 1, 1.61, 1.61],
  ["ARD", "2026-04-09", "SHOPPERS BIO GRANDE ARD", 1, 0.20, 0.20],
  ["ARD", "2026-04-09", "SFORNASOLE PANE X HAMBURGER", 1, 1.15, 1.15],
  ["ARD", "2026-04-09", "SFORNASOLE PANE PER HOT DOG", 1, 1.09, 1.09],
  ["ARD", "2026-04-09", "WESNAK PATATINA TEXAS GRIGLIATE", 1, 1.69, 1.69],
  ["ARD", "2026-04-09", "SFORNASOLE BISCOTTO PER LATTE", 4, 1.89, 7.56],
  ["ARD", "2026-04-09", "SNICKERS MULTIPACK GR. 350", 2, 3.99, 7.98],
  ["ARD", "2026-04-27", "COCOFUN SNACK COCONUT GR", 1, 1.43, 1.43],
  ["ARD", "2026-04-27", "TODAY&AVO ZUCCHERO KG. 1", 1, 0.79, 0.79],
  ["ARD", "2026-04-27", "FLY C.IGIENICA 12 ROT.", 1, 3.99, 3.99],
  ["ARD", "2026-04-27", "SFORNASOLE BISCOTTO PER L", 1, 7.56, 7.56],
  ["ARD", "2026-04-27", "SNICKERS MULTIPACK GR. 35", 1, 7.98, 7.98],
  ["ARD", "2026-04-27", "SHOPPERS BIO GRANDE ARD", 2, 0.20, 0.40],
  ["ARD", "2026-04-27", "MANGO WURSTEL POLLO TACC", 1, 2.79, 2.79],
  ["ARD", "2026-04-27", "VULCANICO PANINI DOLCI AL", 1, 1.20, 1.20],
  ["ARD", "2026-04-27", "VULCANICO PANE CASA CALDO", 0.5, 3.20, 1.60],
  ["ARD", "2026-04-27", "CARAVAN S CAFFE SOLUBILE", 1, 3.39, 3.39],
  ["ARD", "2026-04-27", "IONIX LAVAPIATTI LIMONE L", 1, 3.99, 3.99],
  ["ARD", "2026-04-27", "PAN BAULETTO INT.BIO", 1, 1.09, 1.09],
  ["ARD", "2026-05-02", "LATTE 1.2% LT.1 OPTI", 24, 0.89, 21.36],
  ["ARD", "2026-05-11", "GRANAROLO LATTE UHT PS 1. 2X LT", 12, 0.75, 9.00],
  ["ARD", "2026-05-11", "SFORNASOLE PANE PER HOT D OG GR", 2, 0.79, 1.58],
  ["ARD", "2026-05-11", "VULCANICO PANE CASA CALDO AL K", 0.503, 3.20, 1.61],
  ["ARD", "2026-05-11", "SHOPPERS BIO GRANDE ARD", 2, 0.20, 0.40],
  ["ARD", "2026-05-11", "WESNAK PATATINA TEXAS GRI GLIAT", 1, 1.69, 1.69],
  ["ARD", "2026-05-11", "MARS MULTIPACK X7 GR.315", 1, 3.99, 3.99],
  ["ARD", "2026-05-11", "SFORNASOLE MAXI BURGER GR .300", 2, 1.15, 2.30],
  ["ARD", "2026-05-11", "TODAVIA ZUCCHERO KG. 1 ( SUDZU", 1, 0.95, 0.95],
  ["ARD", "2026-05-11", "TDC KETCHUP TWISTER GR.490", 1, 1.69, 1.69],
  ["ARD", "2026-05-11", "SFORNASOLE BISCOTTO PER L ATTE", 3, 1.89, 5.67],
  ["ARD", "2026-05-11", "SONNY CACAO SOLUB.ISTANTA NE GR", 1, 4.49, 4.49],
  ["ARD", "2026-05-11", "DJANGO WURSTEL POLLO TACC H.X10", 1, 2.79, 2.79],
  ["Eurospin", "2026-05-13", "SNACK COCCO 5pz 28", 1, 2.49, 2.49],
  ["Eurospin", "2026-05-13", "SNACK COCCO 5pz 28", 1, 2.49, 2.49],
  ["Eurospin", "2026-05-13", "SNACK ARACHIDI 250", 1, 1.89, 1.89],
  ["Eurospin", "2026-05-13", "SNACK ARACHIDI 250", 1, 1.89, 1.89],
  ["Eurospin", "2026-05-13", "TORTA CIOCC.400G", 1, 1.99, 1.99],
  ["Eurospin", "2026-05-13", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["Eurospin", "2026-05-13", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["Eurospin", "2026-05-13", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["Eurospin", "2026-05-13", "SHOPPER BIO EUROSP", 1, 0.10, 0.10],
  ["Eurospin", "2026-05-13", "SHOPPER BIO EUROSP", 1, 0.10, 0.10],
  ["Eurospin", "2026-05-13", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["Eurospin", "2026-05-13", "CHOCO WAFER 6pz x24", 1, 2.19, 2.19],
  ["Eurospin", "2026-05-13", "BISCOTTI CEREALI E", 1, 0.89, 0.89],
  ["Eurospin", "2026-05-13", "SNACK GATTI 60g", 1, 0.59, 0.59],
  ["Eurospin", "2026-05-13", "SNACK GATTI 60g", 1, 0.59, 0.59],
  ["Eurospin", "2026-05-13", "SNACK GATTI 60g", 1, 0.59, 0.59],
  ["Eurospin", "2026-05-13", "SNACK GATTI 60g", 1, 0.59, 0.59],
  ["Eurospin", "2026-05-13", "WAFERS NOCCIOLA300", 16, 1.09, 17.44],
  ["Eurospin", "2026-05-13", "WAFERS CACAO 300G", 16, 1.09, 17.44],
  ["Paghi Poco", "2026-05-13", "BELTE PESCA ZERO LT.", 6, 0.69, 4.14],
  ["Paghi Poco", "2026-05-13", "SAIA PANINI LISCI", 1, 1.56, 1.56],
  ["Paghi Poco", "2026-05-13", "CUOR DI CARTA C.IGIE", 1, 3.59, 3.59],
  ["ARD", "2026-05-25", "PARMALAT LATTE PARZ.", 24, 0.75, 18.00],
  ["ARD", "2026-05-25", "VULCANICO PANE CASA CALDO", 0.5, 3.20, 1.60],
  ["ARD", "2026-05-25", "SONNY CACAO SOLUB.ISTANTA NE GR", 1, 4.49, 4.49],
  ["ARD", "2026-05-25", "MARS MULTIPACK X7 GR.315", 1, 3.99, 3.99],
  ["Volpe", "2026-05-25", "NIVEA DEO ROLL ON ML", 1, 2.90, 2.90],
  ["Volpe", "2026-05-25", "PROMO", 1, -0.75, -0.75],
  ["Volpe", "2026-05-25", "CLEAR SHAMPOO MEN ML", 1, 2.95, 2.95],
  ["Volpe", "2026-05-25", "MANT. SAP. NEUT.100", 1, 2.15, 2.15],
  ["Volpe", "2026-05-25", "TENDERLY CARTA IG. 1", 1, 3.99, 3.99],
  ["Volpe", "2026-05-25", "SHOPPER BIO GRANDE 3", 1, 0.20, 0.20],
  ["ARD", "2026-05-27", "SHOPPERS BIO GRANDE ARD", 1, 0.20, 0.20],
  ["ARD", "2026-05-27", "TRINACRIA BAGUETTE BIANCA", 1, 0.99, 0.99],
  ["ARD", "2026-05-27", "ILBUONPANE PANE SANDWICH BIANC", 1, 1.99, 1.99],
  ["ARD", "2026-06-09", "MARS MULTIPACK X7 GR.315", 1, 3.79, 3.79],
  ["ARD", "2026-06-09", "NESQUIK SOLUBILE POUCH GR .700", 1, 4.49, 4.49],
  ["ARD", "2026-06-09", "SHOPPERS BIO GRANDE ARD", 1, 0.20, 0.20],
  ["ARD", "2026-06-09", "VULCANICO PANE CASA CALDO AL K", 0.500, 3.20, 1.60],
  ["ARD", "2026-06-09", "SFORNASOLE BISCOTTO PER LATTE", 2, 1.89, 3.78],
  ["ARD", "2026-06-09", "TODAVIDA ZUCCHERO KG. 1 SUDZU", 2, 0.95, 1.90],
  ["ARD", "2026-06-09", "CARAVAN CAFFE SOLUBILE GR.1", 1, 3.39, 3.39],
  ["EUROSPIN", "2026-06-24", "STECCHI VAN.FRAG.3", 1, 1.79, 1.79],
  ["EUROSPIN", "2026-06-24", "V.SORB.FRUTTA4G 1K", 1, 3.99, 3.99],
  ["EUROSPIN", "2026-06-24", "CREMA CIOCCOL.4x12", 1, 1.29, 1.29],
  ["EUROSPIN", "2026-06-24", "CREMA CIOCCOL.4x12", 1, 1.29, 1.29],
  ["EUROSPIN", "2026-06-24", "PANINI LISCI", 1, 1.48, 1.48],
  ["EUROSPIN", "2026-06-24", "SNACK COCCO 28", 5, 0.50, 2.49],
  ["EUROSPIN", "2026-06-24", "SNACK ARACHIDI 250", 1, 1.89, 1.89],
  ["EUROSPIN", "2026-06-24", "SNACK ARACHIDI 250", 1, 1.89, 1.89],
  ["EUROSPIN", "2026-06-24", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["EUROSPIN", "2026-06-24", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["EUROSPIN", "2026-06-24", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["EUROSPIN", "2026-06-24", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["EUROSPIN", "2026-06-24", "BISC. GRANGIOR 500", 1, 1.45, 1.45],
  ["EUROSPIN", "2026-06-24", "LATTE INTERO", 24, 0.89, 21.36],
  ["ARD", "2026-06-28", "IONIX LAVAPIATTI LIMONE L T.3", 1, 1.99, 1.99],
  ["ARD", "2026-06-28", "TODAVIDA ZUCCHERO KG. 1", 1, 0.95, 0.95],
  ["ARD", "2026-06-28", "SONNY CACAO SOLUB. ISTANTA NE GR", 1, 4.49, 4.49],
];

function firebaseAccessToken() {
  const command = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", "firebase login:list --json"],
    { encoding: "utf8", env: process.env },
  );
  if (command.status !== 0) {
    throw new Error(`Não foi possível ler a autenticação da Firebase CLI: ${command.stderr.trim()}`);
  }
  const accounts = JSON.parse(command.stdout).result || [];
  const account = accounts.find(({ user }) => user?.email === "edneypugleise@gmail.com") || accounts[0];
  if (!account?.tokens?.access_token) {
    throw new Error("Nenhuma sessão autenticada foi encontrada. Execute firebase login --reauth.");
  }
  return account.tokens.access_token;
}

function value(value) {
  if (typeof value === "number") return { doubleValue: value };
  return { stringValue: value };
}

function fieldsFromRow([market, purchasedAt, product, quantity, unitValue, totalValue], index, importedAt) {
  const raw = {
    market,
    product,
    description: "",
    quantity,
    unit: "un",
    unitValue,
    totalValue,
    purchasedAt,
    monthKey: purchasedAt.slice(0, 7),
    currency: "EUR",
    source: "firebase-cli-import",
    importKey,
    importSequence: index + 1,
    createdBy: "firebase-cli",
  };
  return {
    ...Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, value(item)])),
    createdAt: { timestampValue: importedAt },
  };
}

async function request(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}

const token = firebaseAccessToken();
const importedAt = new Date().toISOString();
const root = `projects/${projectId}/databases/${databaseId}/documents`;
const writes = rows.map((row, index) => ({
  update: {
    name: `${root}/marketItems/${importKey}-${String(index + 1).padStart(3, "0")}`,
    fields: fieldsFromRow(row, index, importedAt),
  },
}));

await request(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:commit`,
  token,
  { method: "POST", body: JSON.stringify({ writes }) },
);

const verification = await request(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery`,
  token,
  {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "marketItems" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "importKey" },
            op: "EQUAL",
            value: { stringValue: importKey },
          },
        },
      },
    }),
  },
);

const verifiedCount = verification.filter((item) => item.document).length;
if (verifiedCount !== rows.length) {
  throw new Error(`Verificação falhou: esperados ${rows.length}, encontrados ${verifiedCount}.`);
}

const total = rows.reduce((sum, row) => sum + row[5], 0);
console.log(JSON.stringify({ projectId, collection: "marketItems", imported: rows.length, verified: verifiedCount, total: Number(total.toFixed(2)) }, null, 2));
