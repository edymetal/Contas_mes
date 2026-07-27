import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnv } from "vite";

export const FIREBASE_ENV_NAMES = Object.freeze([
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
]);

const PLACEHOLDER_PATTERN = /^(?:COLOCAR(?:_|$)|YOUR(?:_|$)|CHANGE[_-]?ME(?:_|$)|TODO(?:_|$))/i;

export function getFirebaseEnvIssues(env) {
  return FIREBASE_ENV_NAMES.flatMap((name) => {
    const value = String(env[name] ?? "").trim();

    if (!value) {
      return [`${name}: variável ausente ou vazia`];
    }

    if (PLACEHOLDER_PATTERN.test(value)) {
      return [`${name}: valor de exemplo não foi substituído`];
    }

    return [];
  });
}

export function assertFirebaseEnv(env) {
  const issues = getFirebaseEnvIssues(env);

  if (issues.length) {
    throw new Error(`Configuração Firebase inválida:\n- ${issues.join("\n- ")}`);
  }
}

function loadFirebaseEnv() {
  const fileEnv = loadEnv(process.env.NODE_ENV || "production", process.cwd(), "VITE_");
  return { ...fileEnv, ...process.env };
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    assertFirebaseEnv(loadFirebaseEnv());
    console.log(`Configuração Firebase validada: ${FIREBASE_ENV_NAMES.length} variáveis encontradas.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
