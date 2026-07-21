export const BACKUP_VERSION = 2;

export const BACKUP_COLLECTIONS = Object.freeze([
  { key: "expenses", singularLabel: "conta", label: "contas" },
  { key: "settlements", singularLabel: "acerto", label: "acertos" },
  { key: "marketItems", singularLabel: "item de mercado", label: "itens de mercado" },
  { key: "marketReceipts", singularLabel: "nota de mercado", label: "notas de mercado" },
  { key: "otherPayments", singularLabel: "outro pagamento", label: "outros pagamentos" },
  { key: "userProfiles", singularLabel: "perfil", label: "perfis" },
]);

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const TIMESTAMP_KEYS = new Set(["type", "seconds", "nanoseconds"]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function validateCollectionItems(items, label) {
  const ids = new Set();

  items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Registro ${index + 1} de ${label} inválido.`);
    }

    if (typeof item.id !== "string" || !item.id.trim() || item.id.includes("/")) {
      throw new Error(`Registro ${index + 1} de ${label} possui um identificador inválido.`);
    }

    if (ids.has(item.id)) {
      throw new Error(`O identificador "${item.id}" está duplicado em ${label}.`);
    }

    ids.add(item.id);
  });
}

export function createBackupPayload(collectionData, exportedAt = new Date().toISOString()) {
  const payload = {
    version: BACKUP_VERSION,
    exportedAt,
  };

  BACKUP_COLLECTIONS.forEach(({ key }) => {
    payload[key] = Array.isArray(collectionData?.[key]) ? collectionData[key] : [];
  });

  return payload;
}

export function validateAndNormalizeBackupPayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Formato de backup inválido. O arquivo deve conter um objeto JSON.");
  }

  const version = data.version === undefined ? 1 : data.version;
  if (!Number.isInteger(version) || version < 1 || version > BACKUP_VERSION) {
    throw new Error(`Versão de backup não suportada: ${String(version)}.`);
  }

  if (version === 1 && !hasOwn(data, "expenses") && !hasOwn(data, "settlements")) {
    throw new Error("Backup versão 1 inválido: contas ou acertos não foram encontrados.");
  }

  if (
    version === BACKUP_VERSION &&
    (typeof data.exportedAt !== "string" || Number.isNaN(Date.parse(data.exportedAt)))
  ) {
    throw new Error("Backup inválido: a data de exportação não foi informada corretamente.");
  }

  const normalized = {
    version,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : null,
  };

  BACKUP_COLLECTIONS.forEach(({ key, label }) => {
    if (version === BACKUP_VERSION && !hasOwn(data, key)) {
      throw new Error(`Backup incompleto: a coleção de ${label} não foi encontrada.`);
    }

    const items = hasOwn(data, key) ? data[key] : [];
    if (!Array.isArray(items)) {
      throw new Error(`Backup inválido: a coleção de ${label} deve ser uma lista.`);
    }

    validateCollectionItems(items, label);
    normalized[key] = items;
  });

  return normalized;
}

export function restoreFirestoreTimestamps(value, createTimestamp) {
  if (value === null || value === undefined || typeof value !== "object") return value;

  const keys = Object.keys(value);
  const isTimestamp = (
    Number.isInteger(value.seconds) &&
    Number.isInteger(value.nanoseconds) &&
    value.nanoseconds >= 0 &&
    value.nanoseconds < 1_000_000_000 &&
    (value.type === undefined || value.type === "firestore/timestamp/1.0") &&
    keys.every((key) => TIMESTAMP_KEYS.has(key))
  );

  if (isTimestamp) {
    return createTimestamp(value.seconds, value.nanoseconds);
  }

  if (Array.isArray(value)) {
    return value.map((item) => restoreFirestoreTimestamps(item, createTimestamp));
  }

  const restored = {};
  Object.keys(value).forEach((key) => {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) return;
    restored[key] = restoreFirestoreTimestamps(value[key], createTimestamp);
  });
  return restored;
}

export function formatBackupSummary(data) {
  return BACKUP_COLLECTIONS
    .map(({ key, singularLabel, label }) => {
      const count = data[key]?.length || 0;
      return `${count} ${count === 1 ? singularLabel : label}`;
    })
    .join(", ");
}
