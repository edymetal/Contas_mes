import { spawnSync } from "node:child_process";

const projectId = "contas-mes-ba741";
const databaseId = "(default)";
const importKey = "other-payments-2026-04-16-to-2026-07-08";

const rows = [
  ["Local não informado", "2026-04-18", "Gasolina", "Outro", 1, 20.00, 20.00],
  ["Local não informado", "2026-04-23", "Cinema", "Outro", 1, 12.00, 12.00],
  ["Local não informado", "2026-04-29", "Kena", "Outro", 1, 5.00, 5.00],
  ["Local não informado", "2026-04-16", "Barbeiro", "Outro", 1, 15.00, 15.00],
  ["Local não informado", "2026-05-06", "Lavagem do carro", "Outro", 1, 16.00, 16.00],
  ["Local não informado", "2026-05-06", "Pedagio Messina", "Outro", 1, 5.00, 5.00],
  ["Local não informado", "2026-05-08", "Condominio", "Outro", 1, 43.00, 43.00],
  ["Local não informado", "2026-05-13", "Sapateiro", "Outro", 1, 20.00, 20.00],
  ["Local não informado", "2026-05-14", "Gasolina", "Outro", 10.204, 1.96, 20.00],
  ["Local não informado", "2026-05-19", "Remédio gato", "Outro", 2, 23.00, 46.00],
  ["Local não informado", "2026-05-20", "Troca do Teclado", "Outro", 1, 78.00, 78.00],
  ["Local não informado", "2026-05-25", "Gasolina", "Outro", 1, 10.00, 10.00],
  ["ZooPlus", "2026-06-02", "Areia Gato", "Cartão", 1, 70.95, 70.95],
  ["Quattrozampe", "2026-06-02", "Ração Gato", "Cartão", 1, 93.54, 93.54],
  ["Aliexpress", "2026-06-01", "Suporte Fonte e etc", "Cartão", 1, 17.48, 17.48],
  ["Local não informado", "2026-06-04", "Gasolina", "Dinheiro", 1, 10.00, 10.00],
  ["TapTap", "2026-06-10", "Trasferencia AP Pai", "Outro", 1, 350.00, 350.00],
  ["TapTap", "2026-06-10", "Trasferencia AP Pai", "Outro", 1, 645.00, 645.00],
  ["Wise", "2026-06-11", "Trasferencia AP Pai", "Outro", 1, 350.00, 350.00],
  ["Amazon", "2026-06-10", "Fone Ouvido JBL", "Cartão", 1, 78.00, 78.00],
  ["Alex", "2026-06-18", "Fone ouvido - conserto", "Dinheiro", 1, 10.00, 10.00],
  ["Local não informado", "2026-06-18", "Gasolina", "Dinheiro", 5.32, 1.88, 10.00],
  ["Amazon", "2026-06-23", "Meia, Pilhas", "Cartão", 1, 23.96, 23.96],
  ["Amazon", "2026-06-25", "Camiseta para trabalhar", "Cartão", 1, 25.00, 25.00],
  ["Amazon", "2026-06-25", "Cueca", "Cartão", 1, 23.62, 23.62],
  ["Local não informado", "2026-06-25", "Gasolina", "Dinheiro", 10.87, 1.84, 20.00],
  ["Local não informado", "2026-06-25", "Trattoria em Santa ágata", "Dinheiro", 1, 38.00, 38.00],
  ["Local não informado", "2026-06-26", "Calypso - Discoteca", "Dinheiro", 1, 11.00, 11.00],
  ["Local não informado", "2026-07-02", "Gasolina", "Dinheiro", 1, 30.00, 30.00],
  ["Local não informado", "2026-07-02", "Drink cefalù", "Dinheiro", 3, 7.00, 21.00],
  ["Local não informado", "2026-07-08", "Gasolina", "Dinheiro", 1, 20.00, 20.00],
  ["Local não informado", "2026-07-08", "Pedágio", "Dinheiro", 2, 5.50, 11.00],
  ["Local não informado", "2026-07-08", "Cafe da manha", "Dinheiro", 1, 7.00, 7.00],
  ["Local não informado", "2026-07-08", "Entrada Ilha", "Dinheiro", 2, 5.00, 10.00],
  ["Local não informado", "2026-07-08", "Sorvete", "Dinheiro", 2, 12.00, 24.00],
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

function value(item) {
  if (typeof item === "number") return { doubleValue: item };
  return { stringValue: item };
}

function fieldsFromRow([place, paidAt, product, paymentMethod, quantity, unitValue, totalValue], index, importedAt) {
  const raw = {
    place,
    product,
    paymentMethod,
    quantity,
    unitValue,
    totalValue,
    paidAt,
    monthKey: paidAt.slice(0, 7),
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
    name: `${root}/otherPayments/${importKey}-${String(index + 1).padStart(3, "0")}`,
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
        from: [{ collectionId: "otherPayments" }],
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

const total = rows.reduce((sum, row) => sum + row[6], 0);
console.log(JSON.stringify({ projectId, collection: "otherPayments", imported: rows.length, verified: verifiedCount, total: Number(total.toFixed(2)) }, null, 2));
