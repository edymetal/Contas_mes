import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readProjectFile = (relativePath) => (
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8")
);

test("mantém App.jsx focado em estado e orquestração", () => {
  const appSource = readProjectFile("src/App.jsx");
  const lineCount = appSource.split(/\r?\n/).length;

  assert.ok(lineCount < 2_500, `App.jsx voltou a crescer para ${lineCount} linhas`);
  for (const componentName of [
    "Dashboard",
    "NewExpenseForm",
    "OtherAccountsView",
    "PersonExpenses",
    "SettlementPanel",
    "SettingsPanel",
  ]) {
    assert.doesNotMatch(
      appSource,
      new RegExp(`function\\s+${componentName}\\b`),
      `${componentName} deve permanecer em seu próprio módulo`,
    );
  }
});

test("carrega estilos base, de componentes e responsivos nessa ordem", () => {
  const mainSource = readProjectFile("src/main.jsx");
  const baseIndex = mainSource.indexOf("./styles/base.css");
  const componentsIndex = mainSource.indexOf("./styles/components.css");
  const responsiveIndex = mainSource.indexOf("./styles/responsive.css");

  assert.ok(baseIndex >= 0, "estilos base não foram importados");
  assert.ok(componentsIndex > baseIndex, "estilos de componentes devem vir após a base");
  assert.ok(responsiveIndex > componentsIndex, "estilos responsivos devem ser carregados por último");
});
