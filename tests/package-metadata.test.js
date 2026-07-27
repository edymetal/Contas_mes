import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

test("mantém versões exatas nas dependências diretas", () => {
  const directDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  for (const [name, version] of Object.entries(directDependencies)) {
    assert.match(
      version,
      exactVersionPattern,
      `${name} deve usar uma versão exata em vez de "${version}"`,
    );
  }
});

test("fixa GitHub Actions em commits imutáveis", () => {
  const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
  const actionReferences = readdirSync(workflowsDirectory)
    .filter((fileName) => fileName.endsWith(".yml") || fileName.endsWith(".yaml"))
    .flatMap((fileName) => {
      const workflow = readFileSync(new URL(fileName, workflowsDirectory), "utf8");
      return [...workflow.matchAll(/^\s*uses:\s*[^@\s]+@([^\s#]+)/gm)].map(
        ([, reference]) => reference,
      );
    });

  assert.ok(actionReferences.length > 0, "nenhuma GitHub Action foi encontrada");
  for (const reference of actionReferences) {
    assert.match(reference, /^[0-9a-f]{40}$/, `${reference} deve ser um commit SHA completo`);
  }
});

test("aceita Variables ou Secrets legados na configuração de deploy", () => {
  const deployWorkflow = readFileSync(
    new URL("../.github/workflows/deploy.yml", import.meta.url),
    "utf8",
  );
  const firebaseVariables = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
  ];

  for (const name of firebaseVariables) {
    assert.ok(
      deployWorkflow.includes(`\${{ vars.${name} || secrets.${name} }}`),
      `${name} deve aceitar Variable ou Secret`,
    );
  }
});
