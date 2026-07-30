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
let ExpenseHistoryModule;
let MarketAnalysisModule;
let NewExpenseFormModule;
let OtherAccountsModule;
let PersonExpensesModule;
let ResourceListModule;
let SettlementModule;
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
    ExpenseHistoryModule,
    MarketAnalysisModule,
    NewExpenseFormModule,
    OtherAccountsModule,
    PersonExpensesModule,
    ResourceListModule,
    SettlementModule,
    FormsModule,
  ] = await Promise.all([
    viteServer.ssrLoadModule("/src/components/AuthScreens.jsx"),
    viteServer.ssrLoadModule("/src/components/AppFeedback.jsx"),
    viteServer.ssrLoadModule("/src/components/Dashboard.jsx"),
    viteServer.ssrLoadModule("/src/components/ExpenseManagement.jsx"),
    viteServer.ssrLoadModule("/src/components/ExpenseHistoryModal.jsx"),
    viteServer.ssrLoadModule("/src/components/MarketAnalysisModal.jsx"),
    viteServer.ssrLoadModule("/src/components/NewExpenseForm.jsx"),
    viteServer.ssrLoadModule("/src/components/OtherAccounts.jsx"),
    viteServer.ssrLoadModule("/src/components/PersonExpenses.jsx"),
    viteServer.ssrLoadModule("/src/components/ResourceListView.jsx"),
    viteServer.ssrLoadModule("/src/components/SettlementPanel.jsx"),
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

test("Acerto mantém o resumo de dívida quitada sem oferecer novo pagamento", () => {
  const html = renderToStaticMarkup(
    createElement(SettlementModule.SettlementPanel, {
      firebaseUser: null,
      onDeletePayment() {},
      onMonthChange() {},
      onRegisterPayment() {},
      onUpdatePayment() {},
      rows: [
        {
          fromId: "sonia",
          toId: "edney",
          originalAmount: 336.48,
          paidAmount: 59.23,
          crossPaidAmount: 277.25,
          amount: 0,
        },
      ],
      selectedMonth: "2026-07",
      settlementPayments: [
        {
          id: "july-settlement",
          amount: 59.23,
          fromId: "sonia",
          kind: "payment",
          monthKey: "2026-07",
          paidAt: "2026-08-02",
          toId: "edney",
          type: "PIX",
        },
        {
          id: "august-settlement",
          amount: 10,
          fromId: "sonia",
          kind: "payment",
          monthKey: "2026-08",
          paidAt: "2026-07-01",
          toId: "edney",
          type: "Dinheiro",
        },
      ],
      userProfiles: {},
    }),
  );

  assert.match(html, /Acertos calculados/);
  assert.match(html, /Quitado/);
  assert.match(html, /Total da dívida/);
  assert.match(html, /336,48/);
  assert.match(html, /277,25/);
  assert.match(html, /59,23/);
  assert.match(html, /Acerto concluído/);
  assert.match(html, /1 pagamento\(s\) referente\(s\) a Julho 2026/);
  assert.match(html, /02\/08\/2026/);
  assert.doesNotMatch(html, /10,00/);
  assert.equal((html.match(/resource-month-controls/g) || []).length, 1);
  assert.doesNotMatch(html, /Registrar pagamento/);
});

test("resumo pessoal inclui valores a receber mesmo sem o pagador participar do rateio", () => {
  const html = renderToStaticMarkup(
    createElement(PersonExpensesModule.PersonExpenses, {
      expenses: [
        {
          id: "expense-paid-for-another-person",
          category: "Viagem",
          dueDate: "2026-07-05",
          payerId: "edney",
          participants: ["sonia"],
          shares: {
            sonia: { amount: 50, status: "pending" },
          },
          title: "Passagem",
          totalValue: 50,
        },
      ],
      firebaseUser: null,
      onMonthChange() {},
      personId: "edney",
      selectedMonth: "2026-07",
      settlementPayments: [],
      userProfiles: {},
    }),
  );

  assert.match(html, /Receber Sônia: \+50,00/);
  assert.match(html, /Nenhuma conta para este mês/);
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
  assert.match(html, /Situação/);
  assert.match(html, /Não paga/);
  assert.match(html, /class="expense-payment-column"/);
  assert.match(html, /expense-payment-status pending/);
  assert.equal((html.match(/class="table-sort-button"/g) || []).length, 7);
  assert.equal((html.match(/aria-sort="none"/g) || []).length, 7);
  assert.match(html, /<option value="month"[^>]*>Julho<\/option>/);
  assert.doesNotMatch(html, /<option value="month"[^>]*>Julho 2026<\/option>/);
  assert.match(html, /Ver histórico de Conta de energia/);
  assert.equal((html.match(/<select/g) || []).length, 2);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "energia"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "Sônia"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "150,00", "value"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "10/07/2026", "dueDate"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "casa", "category"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "energia", "category"), false);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "não paga", "status"), true);
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "paga", "status"), false);
  assert.equal(
    ExpenseManagementModule.expenseMatchesSearch(
      {
        ...expense,
        shares: {
          edney: { amount: 75, status: "self" },
          sonia: { amount: 75, status: "settled" },
        },
      },
      "paga",
      "status",
    ),
    true,
  );
  assert.equal(ExpenseManagementModule.expenseMatchesSearch(expense, "Rodney"), false);

  const sortableExpenses = [
    { ...expense, id: "expense-b", title: "Zebra", totalValue: 10 },
    { ...expense, id: "expense-a", title: "Água", totalValue: 20 },
  ];
  assert.deepEqual(
    ExpenseManagementModule.sortExpenses(sortableExpenses, "title", "asc").map((item) => item.id),
    ["expense-a", "expense-b"],
  );
  assert.deepEqual(
    ExpenseManagementModule.sortExpenses(sortableExpenses, "title", "desc").map((item) => item.id),
    ["expense-b", "expense-a"],
  );
  assert.deepEqual(
    ExpenseManagementModule.sortExpenses(sortableExpenses, "value", "asc").map((item) => item.id),
    ["expense-b", "expense-a"],
  );

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

test("histórico da despesa mostra totais pagos e omite meses futuros", () => {
  const expense = {
    title: "Internet",
    category: "Casa",
    payerId: "edney",
    participants: ["edney", "sonia"],
    installment: "Fixo",
    fixedSeriesId: "fixed-internet",
    totalValue: 30,
  };
  const settledShares = {
    edney: { amount: 15, status: "self" },
    sonia: { amount: 15, status: "settled" },
  };
  const pendingShares = {
    edney: { amount: 15, status: "self" },
    sonia: { amount: 15, status: "pending" },
  };
  const expenses = [
    { ...expense, id: "past", dueDate: "2026-06-10", shares: settledShares },
    { ...expense, id: "current", dueDate: "2026-07-10", shares: pendingShares },
    { ...expense, id: "future", dueDate: "2026-08-10", shares: settledShares },
    { ...expense, id: "past-year", dueDate: "2025-12-10", shares: settledShares },
  ];
  const html = renderToStaticMarkup(
    createElement(ExpenseHistoryModule.ExpenseHistoryModal, {
      allExpenses: expenses,
      expense: expenses[1],
      onClose() {},
      selectedMonth: "2026-07",
    }),
  );

  assert.match(html, /Histórico até Julho 2026/);
  assert.match(html, /Total de registros/);
  assert.match(html, /Registros quitados/);
  assert.match(html, /Valor já pago/);
  assert.match(html, /Meses de 2026/);
  assert.match(html, /Ano anterior/);
  assert.match(html, /Próximo ano/);
  assert.match(html, /Navegação entre anos/);
  assert.match(html, /Ir para 2025/);
  assert.match(html, /Julho 2026/);
  assert.match(html, /Junho 2026/);
  assert.doesNotMatch(html, /Agosto 2026/);
  assert.doesNotMatch(html, /Dezembro 2025/);
  assert.match(html, /90,00/);
  assert.match(html, /75,00/);
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

test("tabelas de Outras Contas oferecem busca por coluna, período e ordenação", () => {
  const items = [
    {
      id: "other-1",
      place: "Oficina",
      product: "Revisão",
      paymentMethod: "Cartão",
      quantity: 1,
      unitValue: 80,
      totalValue: 80,
      monthKey: "2026-07",
      paidAt: "2026-07-06",
    },
  ];
  const html = renderToStaticMarkup(
    createElement(ResourceListModule.ResourceListView, {
      form: {
        place: "",
        product: "",
        paymentMethod: "Cartão",
        quantity: "1",
        unitValue: "",
        paidAt: "2026-07-30",
      },
      formError: "",
      items,
      kind: "other-payments",
      placeSuggestions: [],
      productSuggestions: ["Revisão", "Troca de óleo"],
      selectedMonth: "2026-07",
      onChange() {},
      onEdit() {},
      onDelete() {},
      onDeleteMonth() {},
      onMonthChange() {},
      onSubmit() {},
    }),
  );

  assert.match(html, /Buscar pagamentos/);
  assert.match(html, /Todas as colunas/);
  assert.match(html, /Ano de 2026/);
  assert.match(html, /Toda a base de dados/);
  assert.equal((html.match(/class="table-sort-button"/g) || []).length, 7);
  assert.equal((html.match(/aria-sort="none"/g) || []).length, 7);
  assert.equal((html.match(/class="resource-quantity-column"/g) || []).length, 2);
  assert.equal((html.match(/role="combobox"/g) || []).length, 2);
  assert.match(html, /aria-controls="new-other-payments-product-options"/);
  assert.match(html, /Ver dashboard do local Oficina/);
  assert.match(html, /Ver dashboard do produto Revisão/);
  assert.equal((html.match(/class="resource-analysis-trigger"/g) || []).length, 2);
});

test("filtros e ordenação de Outras Contas funcionam para mercado e pagamentos", () => {
  const marketItems = [
    {
      id: "market-1",
      market: "Mercado Central",
      product: "Arroz",
      description: "Alimentos",
      quantity: 2,
      unitValue: 3,
      totalValue: 6,
      monthKey: "2026-07",
      purchasedAt: "2026-07-05",
    },
    {
      id: "market-2",
      market: "Atacado",
      product: "Leite",
      description: "Laticínios",
      quantity: 1,
      unitValue: 2,
      totalValue: 2,
      monthKey: "2026-06",
      purchasedAt: "2026-06-05",
    },
    {
      id: "market-3",
      market: "Loja antiga",
      product: "Café",
      description: "Alimentos",
      quantity: 1,
      unitValue: 5,
      totalValue: 5,
      monthKey: "2025-12",
      purchasedAt: "2025-12-05",
    },
  ];

  assert.equal(
    ResourceListModule.getResourceItemsForSearchScope(marketItems, "2026-07", "month", true).length,
    1,
  );
  assert.equal(
    ResourceListModule.getResourceItemsForSearchScope(marketItems, "2026-07", "year", true).length,
    2,
  );
  assert.equal(
    ResourceListModule.getResourceItemsForSearchScope(marketItems, "2026-07", "all", true).length,
    3,
  );
  assert.equal(
    ResourceListModule.resourceItemMatchesSearch(marketItems[0], "central", "location", true),
    true,
  );
  assert.equal(
    ResourceListModule.resourceItemMatchesSearch(marketItems[0], "laticínios", "detail", true),
    false,
  );
  assert.deepEqual(
    ResourceListModule.sortResourceItems(marketItems, "totalValue", "asc", true).map((item) => item.id),
    ["market-2", "market-3", "market-1"],
  );
  assert.deepEqual(
    ResourceListModule.sortResourceItems(marketItems, "location", "desc", true).map((item) => item.id),
    ["market-1", "market-3", "market-2"],
  );

  const otherPayments = [
    {
      id: "other-1",
      place: "Oficina",
      product: "Revisão",
      paymentMethod: "Cartão",
      totalValue: 80,
      paidAt: "2026-07-06",
    },
    {
      id: "other-2",
      place: "Amazon",
      product: "Cabo",
      paymentMethod: "Dinheiro",
      totalValue: 12,
      paidAt: "2026-07-02",
    },
  ];

  assert.equal(
    ResourceListModule.resourceItemMatchesSearch(otherPayments[0], "oficina", "location", false),
    true,
  );
  assert.equal(
    ResourceListModule.resourceItemMatchesSearch(otherPayments[1], "dinheiro", "detail", false),
    true,
  );
  assert.deepEqual(
    ResourceListModule.sortResourceItems(otherPayments, "totalValue", "desc", false).map((item) => item.id),
    ["other-1", "other-2"],
  );
});

test("dashboards de Mercado e Outros pagamentos consolidam meses, anos e total geral", () => {
  const marketItems = [
    {
      id: "market-1",
      market: "ARD",
      product: "Arroz",
      description: "Alimentos",
      quantity: 2,
      totalValue: 6,
      monthKey: "2026-07",
      purchasedAt: "2026-07-05",
    },
    {
      id: "market-2",
      market: "ARD",
      product: "Arroz",
      description: "Alimentos",
      quantity: 1.5,
      totalValue: 4,
      monthKey: "2026-01",
      purchasedAt: "2026-01-08",
    },
    {
      id: "market-3",
      market: "ARD",
      product: "Feijão",
      description: "Grãos",
      quantity: 3,
      totalValue: 9,
      monthKey: "2025-12",
      purchasedAt: "2025-12-02",
    },
    {
      id: "market-4",
      market: "Mercado Central",
      product: "Arroz",
      description: "Alimentos",
      quantity: 1,
      totalValue: 5,
      monthKey: "2026-07",
      purchasedAt: "2026-07-15",
    },
  ];
  const marketDashboard = MarketAnalysisModule.getMarketAnalysisDashboard(
    marketItems,
    "market",
    "ard",
    "2026",
  );
  const productDashboard = MarketAnalysisModule.getMarketAnalysisDashboard(
    marketItems,
    "product",
    "arroz",
    "2026",
  );
  const descriptionDashboard = MarketAnalysisModule.getMarketAnalysisDashboard(
    marketItems,
    "description",
    "arroz",
    "2026",
  );

  assert.deepEqual(marketDashboard.availableYears, ["2026", "2025"]);
  assert.equal(marketDashboard.overall.count, 3);
  assert.equal(marketDashboard.overall.quantity, 6.5);
  assert.equal(marketDashboard.overall.value, 19);
  assert.equal(marketDashboard.selectedYear.quantity, 3.5);
  assert.equal(marketDashboard.selectedYear.value, 10);
  assert.equal(marketDashboard.months.find((month) => month.monthKey === "2026-07").value, 6);
  assert.equal(productDashboard.overall.count, 3);
  assert.equal(productDashboard.overall.value, 15);
  assert.equal(descriptionDashboard.overall.count, 3);
  assert.equal(descriptionDashboard.overall.value, 15);

  const otherPayments = [
    {
      id: "other-1",
      place: "Oficina",
      product: "Revisão",
      quantity: 1,
      totalValue: 80,
      monthKey: "2026-07",
      paidAt: "2026-07-06",
    },
    {
      id: "other-2",
      place: "Oficina",
      product: "Troca de óleo",
      quantity: 2,
      totalValue: 30,
      monthKey: "2025-10",
      paidAt: "2025-10-10",
    },
    {
      id: "other-3",
      place: "Amazon",
      product: "Revisão",
      quantity: 3,
      totalValue: 12,
      monthKey: "2026-07",
      paidAt: "2026-07-12",
    },
  ];
  const placeDashboard = MarketAnalysisModule.getMarketAnalysisDashboard(
    otherPayments,
    "place",
    "oficina",
    "2026",
    "other-payments",
  );
  const otherProductDashboard = MarketAnalysisModule.getMarketAnalysisDashboard(
    otherPayments,
    "product",
    "revisão",
    "2026",
    "other-payments",
  );

  assert.deepEqual(placeDashboard.availableYears, ["2026", "2025"]);
  assert.equal(placeDashboard.overall.quantity, 3);
  assert.equal(placeDashboard.overall.value, 110);
  assert.equal(placeDashboard.selectedYear.value, 80);
  assert.equal(otherProductDashboard.overall.quantity, 4);
  assert.equal(otherProductDashboard.overall.value, 92);

  const html = renderToStaticMarkup(
    createElement(MarketAnalysisModule.MarketAnalysisModal, {
      analysis: {
        type: "market",
        value: "ARD",
        label: "ARD DISCOUNT",
        initialYear: "2026",
      },
      items: marketItems,
      onClose() {},
      selectedMonth: "2026-07",
    }),
  );

  assert.match(html, /Dashboard por mercado/);
  assert.match(html, /Quantidade total geral/);
  assert.match(html, /Valor total geral/);
  assert.match(html, /Valores por mês em 2026/);
  assert.match(html, /Todos os anos/);
  assert.match(html, /Total geral de todos os anos/);
  assert.match(html, /Ano anterior/);
  assert.match(html, /2025/);

  const otherHtml = renderToStaticMarkup(
    createElement(MarketAnalysisModule.MarketAnalysisModal, {
      analysis: {
        type: "place",
        value: "Oficina",
        label: "Oficina",
        initialYear: "2026",
      },
      items: otherPayments,
      kind: "other-payments",
      onClose() {},
      selectedMonth: "2026-07",
    }),
  );

  assert.match(otherHtml, /Dashboard por local/);
  assert.match(otherHtml, /Oficina/);
});

test("nomes do mercado, produto e descrição abrem seus dashboards na tabela", () => {
  const html = renderToStaticMarkup(
    createElement(ResourceListModule.ResourceListView, {
      form: {
        market: "",
        product: "",
        description: "",
        quantity: "1",
        unitValue: "",
        purchasedAt: "2026-07-30",
      },
      formError: "",
      items: [
        {
          id: "market-1",
          market: "ARD",
          product: "Arroz",
          description: "Alimentos",
          quantity: 2,
          unitValue: 3,
          totalValue: 6,
          monthKey: "2026-07",
          purchasedAt: "2026-07-05",
        },
      ],
      kind: "market",
      placeSuggestions: [],
      productSuggestions: ["Arroz", "Leite"],
      selectedMonth: "2026-07",
      onChange() {},
      onEdit() {},
      onDelete() {},
      onDeleteMonth() {},
      onMarketReceiptSubmit() {},
      onMonthChange() {},
      onSubmit() {},
    }),
  );

  assert.match(html, /Ver dashboard do mercado ARD DISCOUNT/);
  assert.match(html, />ARD DISCOUNT</);
  assert.match(html, /Ver dashboard do produto Arroz/);
  assert.match(html, /Ver dashboard da descrição Arroz/);
  assert.match(html, /aria-controls="new-market-product-options"/);
  assert.equal((html.match(/class="resource-analysis-trigger"/g) || []).length, 3);
});
