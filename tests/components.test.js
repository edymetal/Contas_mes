import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let viteServer;
let AuthScreens;
let AppFeedback;
let DashboardModule;
let ExpenseManagementModule;
let NewExpenseFormModule;
let OtherAccountsModule;
let FormsModule;

before(async () => {
  viteServer = await createServer({
    root: projectRoot,
    appType: "custom",
    logLevel: "silent",
    server: {
      hmr: false,
      middlewareMode: true,
    },
  });

  [
    AuthScreens,
    AppFeedback,
    DashboardModule,
    ExpenseManagementModule,
    NewExpenseFormModule,
    OtherAccountsModule,
    FormsModule,
  ] = await Promise.all([
    viteServer.ssrLoadModule("/src/components/AuthScreens.jsx"),
    viteServer.ssrLoadModule("/src/components/AppFeedback.jsx"),
    viteServer.ssrLoadModule("/src/components/Dashboard.jsx"),
    viteServer.ssrLoadModule("/src/components/ExpenseManagement.jsx"),
    viteServer.ssrLoadModule("/src/components/NewExpenseForm.jsx"),
    viteServer.ssrLoadModule("/src/components/OtherAccounts.jsx"),
    viteServer.ssrLoadModule("/src/config/forms.js"),
  ]);
});

after(async () => {
  await viteServer?.close();
});

test("tela de login diferencia configuração ausente de autenticação disponível", () => {
  const missingConfigHtml = renderToStaticMarkup(
    createElement(AuthScreens.LoginScreen, {
      error: "Falha de autenticação",
      missingConfig: true,
      onLogin() {},
    }),
  );
  assert.match(missingConfigHtml, /Preencha o arquivo \.env/);
  assert.match(missingConfigHtml, /Falha de autenticação/);
  assert.doesNotMatch(missingConfigHtml, /Entrar com o Google/);

  const loginHtml = renderToStaticMarkup(
    createElement(AuthScreens.LoginScreen, {
      error: "",
      missingConfig: false,
      onLogin() {},
    }),
  );
  assert.match(loginHtml, /Entrar com o Google/);
});

test("estados globais oferecem contexto para leitores de tela e recuperação", () => {
  const loadingHtml = renderToStaticMarkup(
    createElement(AuthScreens.LoadingScreen),
  );
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /role="status"/);
  assert.match(loadingHtml, /Carregando o sistema/);

  const boundaryHtml = renderToStaticMarkup(
    createElement(
      AppFeedback.AppErrorBoundary,
      null,
      createElement("p", null, "Aplicação disponível"),
    ),
  );
  assert.match(boundaryHtml, /Aplicação disponível/);

  const diagnosticsHtml = renderToStaticMarkup(
    createElement(AppFeedback.DiagnosticsPanel),
  );
  assert.match(diagnosticsHtml, /Nenhuma falha inesperada registrada/);
  assert.match(diagnosticsHtml, /não inclui coleções, documentos, chaves ou e-mails/);
});

test("dashboard renderiza indicadores, categoria e próximo vencimento", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardModule.Dashboard, {
      breakdown: {
        total: 150,
        rows: [
          { id: "normal", label: "Normais", total: 150, count: 1, percent: 100 },
        ],
      },
      categoryTotals: [{ category: "Casa", total: 150 }],
      dataLoading: false,
      expenses: [
        {
          id: "expense-1",
          category: "Casa",
          dueDate: "2026-07-10",
          payerId: "edney",
          title: "Aluguel",
          totalValue: 150,
        },
      ],
      metrics: { paid: 100, pending: 50 },
      selectedMonth: "2026-07",
      yearSummary: {
        year: "2026",
        total: 150,
        months: [
          { monthKey: "2026-07", label: "Jul", count: 1, total: 150, percent: 100 },
        ],
      },
    }),
  );

  assert.match(html, /Visão geral/);
  assert.match(html, /Aluguel/);
  assert.match(html, /Casa/);
  assert.match(html, /10\/07\/2026/);
  assert.match(html, /150,00/);
});

test("formulário de conta preserva participantes e ação principal", () => {
  const html = renderToStaticMarkup(
    createElement(NewExpenseFormModule.NewExpenseForm, {
      form: { ...FormsModule.emptyExpenseForm, totalValue: "90" },
      formError: "",
      onChange() {},
      onSubmit() {},
      onToggleParticipant() {},
    }),
  );

  assert.match(html, /Nome da despesa/);
  assert.match(html, /Quem deve participar do rateio/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 3);
  assert.equal((html.match(/class="participant-option"/g) || []).length, 3);
  assert.match(html, /30,00/);
  assert.match(html, /Salvar conta/);
});

test("gerenciamento oferece busca de contas por dados relevantes", () => {
  const expense = {
    id: "expense-1",
    category: "Casa",
    dueDate: "2026-07-10",
    payerId: "edney",
    participants: ["sonia"],
    title: "Conta de energia",
    totalValue: 150,
  };
  const html = renderToStaticMarkup(
    createElement(ExpenseManagementModule.ManagePanel, {
      allExpenses: [expense],
      dataLoading: false,
      expenses: [expense],
      onDelete() {},
      onEdit() {},
      selectedMonth: "2026-07",
    }),
  );

  assert.match(html, /type="search"/);
  assert.match(html, /Digite o valor que deseja buscar/);
  assert.match(html, /Todas as colunas/);
  assert.match(html, /Toda a base de dados/);
  assert.equal((html.match(/<select/g) || []).length, 2);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "energia"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "Sônia"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "150,00", "value"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "10/07/2026", "dueDate"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "casa", "category"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "energia", "category"), false);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "Rodney"), false);

  const expenses = [
    expense,
    { ...expense, id: "expense-2", dueDate: "2026-01-10", title: "Conta de água" },
    { ...expense, id: "expense-3", dueDate: "2025-12-10", title: "Conta antiga" },
  ];
  assert.equal(
    ExpenseManagementModule.getExpensesForSearchScope(expenses, [expense], "2026-07", "month").length,
    1,
  );
  assert.equal(
    ExpenseManagementModule.getExpensesForSearchScope(expenses, [expense], "2026-07", "year").length,
    2,
  );
  assert.equal(
    ExpenseManagementModule.getExpensesForSearchScope(expenses, [expense], "2026-07", "all").length,
    3,
  );
});

test("Outras Contas integra mercado e pagamentos no resumo anual", () => {
  const html = renderToStaticMarkup(
    createElement(OtherAccountsModule.OtherAccountsView, {
      dataLoading: false,
      marketItems: [
        {
          id: "market-1",
          market: "Mercado Central",
          monthKey: "2026-07",
          purchasedAt: "2026-07-05",
          totalValue: 80,
        },
      ],
      otherPayments: [
        {
          id: "other-1",
          place: "Oficina",
          monthKey: "2026-07",
          paidAt: "2026-07-06",
          totalValue: 20,
        },
      ],
      selectedMonth: "2026-07",
    }),
  );

  assert.match(html, /Resumo anual de 2026/);
  assert.match(html, /Mercado Central/);
  assert.match(html, /Oficina/);
  assert.match(html, /100,00/);
  assert.match(html, /2 lançamentos/);
});
