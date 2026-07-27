import test from "node:test";
import assert from "node:assert/strict";
import {
  FIREBASE_ENV_NAMES,
  assertFirebaseEnv,
  getFirebaseEnvIssues,
} from "../scripts/check-firebase-env.mjs";

const validEnv = Object.fromEntries(
  FIREBASE_ENV_NAMES.map((name) => [name, `valor-valido-${name.toLowerCase()}`]),
);

test("aceita a configuração Firebase completa", () => {
  assert.deepEqual(getFirebaseEnvIssues(validEnv), []);
  assert.doesNotThrow(() => assertFirebaseEnv(validEnv));
});

test("identifica variáveis Firebase ausentes ou vazias", () => {
  const env = { ...validEnv };
  delete env.VITE_FIREBASE_PROJECT_ID;
  env.VITE_FIREBASE_APP_ID = "   ";

  assert.deepEqual(getFirebaseEnvIssues(env), [
    "VITE_FIREBASE_PROJECT_ID: variável ausente ou vazia",
    "VITE_FIREBASE_APP_ID: variável ausente ou vazia",
  ]);
});

test("rejeita valores de exemplo sem expor seu conteúdo", () => {
  const env = {
    ...validEnv,
    VITE_FIREBASE_API_KEY: "COLOCAR_API_KEY_AQUI",
  };

  assert.throws(
    () => assertFirebaseEnv(env),
    (error) =>
      error.message.includes("VITE_FIREBASE_API_KEY: valor de exemplo não foi substituído") &&
      !error.message.includes("COLOCAR_API_KEY_AQUI"),
  );
});
