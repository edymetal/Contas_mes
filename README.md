# Contas Compartilhadas

Aplicacao estatica em React para controle de despesas domesticas compartilhadas entre Edney, Sonia e Rodney.

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

## Rodar localmente

```bash
npm install
npm run dev
```

## Leitura de notas fiscais com Gemini

O fluxo **Outras Contas > Mercado** aceita fotos JPG/PNG/WebP e notas em PDF. A leitura usa o modelo `gemini-3.5-flash` em uma Cloud Function autenticada; a chave nunca deve ser adicionada a uma variavel `VITE_*` ou ao codigo do navegador.

Configure e publique o backend uma vez:

```bash
npx firebase-tools login
npx firebase-tools use SEU_PROJECT_ID
npx firebase-tools functions:secrets:set GEMINI_API_KEY
npx firebase-tools deploy --only functions:analyzeMarketReceipt,firestore:rules
```

O comando de secret solicita a chave de forma interativa. Use uma chave exclusiva, restrita a Gemini API, e nao grave a chave em `.env`, GitHub Secrets usados pelo frontend ou arquivos versionados.

Para testar a funcao localmente, instale tambem as dependencias do backend:

```bash
npm install --prefix functions
```

## Publicar no GitHub Pages

O projeto esta preparado para build estatico com Vite. No GitHub:

1. Va em **Settings > Pages**.
2. Em **Build and deployment**, selecione **GitHub Actions**.
3. Cadastre as variaveis `VITE_FIREBASE_*` em **Settings > Secrets and variables > Actions > Variables**.
4. Faca push para a branch `main`.

O workflow `.github/workflows/deploy.yml` gera a pasta `dist` e publica no GitHub Pages.

O deploy do GitHub Pages publica apenas o frontend. Quando houver alteracoes em `functions/` ou `firestore.rules`, publique-as com o comando Firebase acima.
