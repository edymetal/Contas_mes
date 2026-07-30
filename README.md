# Contas Compartilhadas

Aplicacao estatica em React para controle de despesas domesticas compartilhadas entre Edney, Sonia e Rodney.

## Funcionalidades principais

- Cadastro de contas unicas, fixas e parceladas, com acompanhamento mensal e acerto entre as pessoas.
- Rateio igual, por percentual ou por valor definido para cada participante. Contas antigas sem configuracao de
  rateio continuam sendo interpretadas automaticamente como divisao igual.
- Relatorios com comparacao entre dois meses, evolucao anual por categoria, pessoa ou estabelecimento e totais
  separados de contas compartilhadas, Mercado e outros pagamentos.
- Exportacao dos lancamentos do mes em CSV e geracao de PDF pelo dialogo de impressao do navegador.
- Leitura de notas fiscais italianas, historicos, dashboards, backup em JSON e funcionamento como PWA.

## Onde configurar o Firebase

1. Crie um projeto no Firebase.
2. Ative o **Google** em **Authentication > Sign-in method**.
3. Crie um banco em **Firestore Database**.
4. Copie `.env.example` para `.env` e preencha as variaveis:

```bash
VITE_FIREBASE_API_KEY=COLOCAR_API_KEY_AQUI
VITE_FIREBASE_AUTH_DOMAIN=COLOCAR_AUTH_DOMAIN_AQUI
VITE_FIREBASE_PROJECT_ID=COLOCAR_PROJECT_ID_AQUI
VITE_FIREBASE_STORAGE_BUCKET=COLOCAR_STORAGE_BUCKET_AQUI
VITE_FIREBASE_MESSAGING_SENDER_ID=COLOCAR_MESSAGING_SENDER_ID_AQUI
VITE_FIREBASE_APP_ID=COLOCAR_APP_ID_AQUI
```

5. Edite `src/config/people.js` e troque os e-mails de exemplo pelos e-mails reais de cada conta Google.
6. No console do Firebase, publique as regras de `firestore.rules`.

As regras exigem uma conta com e-mail verificado. Somente os e-mails administrativos podem alterar os dados
financeiros; os demais acessos autorizados são somente leitura e podem atualizar apenas os campos públicos do
próprio perfil. Alterar o arquivo local de regras não atualiza o Firebase até que ele seja publicado.

## Rodar localmente

```bash
npm ci
npm run dev
```

As dependências diretas usam versões exatas para que instalações futuras não adotem versões novas sem revisão.
O comando `npm ci` reproduz exatamente o conteúdo de `package-lock.json` no desenvolvimento, na integração e na
implantação. As GitHub Actions também ficam fixadas por commit. O Dependabot verifica os dois ecossistemas
semanalmente, agrupa as atualizações relacionadas e abre pull requests que passam pelos testes e pelo build antes
da integração.

## Validar alterações

```bash
npm test
npm run check:firebase-env
npm run build
```

As regras financeiras puras ficam em `src/domain` e possuem testes de regressão independentes da interface.
Os componentes principais ficam em `src/components` e são renderizados nos testes pelo pipeline SSR do
Vite/React, cobrindo login, dashboard, criação de conta e o resumo de Outras Contas. Testes arquiteturais também
impedem que esses componentes retornem ao arquivo principal ou que a ordem das camadas de CSS seja alterada.

A interface inclui atalho para o conteúdo principal, foco controlado nos diálogos, navegação por teclado,
mensagens para leitores de tela, suporte a movimento reduzido e aviso de conexão. Falhas inesperadas são
registradas de forma sanitizada apenas na sessão atual; o diagnóstico local pode ser baixado ou apagado em
**Configurações**, sem incluir coleções financeiras, chaves, e-mails ou pilhas de execução.

A validação do Firebase lê o arquivo `.env` local e falha sem revelar valores quando alguma variável estiver
ausente, vazia ou ainda contiver um valor de exemplo. O build também falha automaticamente se algum chunk
JavaScript ultrapassar 400 KB.

## Leitura de notas fiscais com Gemini

O fluxo **Outras Contas > Mercado** aceita fotos JPG/PNG/WebP e notas em PDF, todas em italiano. A leitura usa o modelo `gemini-3.5-flash` diretamente no navegador e funciona com a cota gratuita da Gemini API, sem Cloud Functions ou plano Blaze.

Na primeira utilização:

1. Entre em **Outras Contas > Mercado**.
2. Clique em **Configurar chave**.
3. Cole uma chave criada no [Google AI Studio](https://aistudio.google.com/app/apikey).
4. Depois da validação, fotografe ou envie a nota e confira todos os dados reconhecidos antes de adicioná-los.

A chave fica no `localStorage` daquele navegador e é enviada somente ao endpoint oficial do Gemini durante a análise. Ela não é incluída no bundle público nem precisa ser cadastrada no GitHub. Use uma chave exclusiva, restrita à Gemini API, e configure-a apenas em aparelhos confiáveis. Ao limpar os dados do navegador, será necessário informá-la novamente.

Não use `VITE_GEMINI_API_KEY`: toda variável `VITE_*` é incorporada ao JavaScript público durante o build.

## Publicar no GitHub Pages

O projeto esta preparado para build estatico com Vite. No GitHub:

1. Va em **Settings > Pages**.
2. Em **Build and deployment**, selecione **GitHub Actions**.
3. Cadastre as seis configurações `VITE_FIREBASE_*` de `.env.example` em
   **Settings > Secrets and variables > Actions > Variables**. O workflow também aceita os Secrets legados com
   os mesmos nomes durante a migração.
4. Faca push para a branch `main`.

O workflow `.github/workflows/deploy.yml` prioriza o contexto `vars` e usa `secrets` como fallback, valida a
configuração, gera a pasta `dist` e publica no GitHub Pages. Valores ausentes ou que ainda começam com `COLOCAR_`
interrompem o deploy antes do build.

O deploy do GitHub Pages publica apenas o frontend. Quando houver alterações em `firestore.rules`, publique as regras separadamente:

```bash
npx firebase-tools deploy --only firestore:rules
```
