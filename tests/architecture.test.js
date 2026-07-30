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

test("Acerto usa o mês global para cálculos e histórico", () => {
  const appSource = readProjectFile("src/App.jsx");
  const settlementSource = readProjectFile("src/components/SettlementPanel.jsx");
  const settlementProps = appSource.match(/<SettlementPanel[\s\S]*?\/>/)?.[0] || "";

  assert.match(settlementProps, /selectedMonth=\{selectedMonth\}/);
  assert.match(settlementProps, /onMonthChange=\{setSelectedMonth\}/);
  assert.doesNotMatch(settlementSource, /historyMonth/);
  assert.match(
    settlementSource,
    /getSettlementAccountingMonth\(payment\) === selectedMonth/,
  );
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

test("liga a navegação e a renderização de Relatórios à permissão administrativa", () => {
  const appSource = readProjectFile("src/App.jsx");

  assert.match(
    appSource,
    /const visibleNavItems = navItems\.filter\(\(item\) => canAccessView\(profile, item\.id\)\)/,
  );
  assert.match(
    appSource,
    /\{canManageData && activeView === "reports" && \(/,
  );
  assert.ok(
    (
      appSource.match(
        /!canManageData\s*\|\|\s*!profile\s*\|\|\s*!db\s*\|\|\s*!\["other-accounts", "reports"\]\.includes\(activeView\)/g,
      ) || []
    ).length >= 2,
    "as fontes complementares devem permanecer protegidas nos dois carregamentos",
  );
});

test("mantém os recursos estruturais de acessibilidade e recuperação de falhas", () => {
  const appSource = readProjectFile("src/App.jsx");
  const mainSource = readProjectFile("src/main.jsx");
  const baseStyles = readProjectFile("src/styles/base.css");
  const modalSources = [
    readProjectFile("src/components/ExpenseManagement.jsx"),
    readProjectFile("src/components/ExpenseHistoryModal.jsx"),
    readProjectFile("src/components/ReceiptImporter.jsx"),
    readProjectFile("src/components/SettlementPanel.jsx"),
  ].join("\n");
  const tableSources = [
    readProjectFile("src/components/ExpenseManagement.jsx"),
    readProjectFile("src/components/OtherAccounts.jsx"),
    readProjectFile("src/components/ReceiptImporter.jsx"),
    readProjectFile("src/components/ResourceListView.jsx"),
  ].join("\n");

  assert.match(appSource, /className="skip-link"/);
  assert.match(appSource, /id="main-content"/);
  assert.match(appSource, /aria-current=/);
  assert.match(mainSource, /<AppErrorBoundary>/);
  assert.match(mainSource, /installGlobalErrorMonitoring/);
  assert.ok(
    (modalSources.match(/useDialogAccessibility\(onClose\)/g) || []).length >= 5,
    "os diálogos críticos devem controlar foco, Tab e Escape",
  );
  assert.equal(
    (tableSources.match(/<caption className="sr-only">/g) || []).length,
    4,
    "as tabelas de dados devem manter descrições para leitores de tela",
  );
  assert.match(baseStyles, /prefers-reduced-motion:\s*reduce/);
});
