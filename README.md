# Contas Compartilhadas

Aplicação estática em React para controle de despesas domésticas compartilhadas entre Edney, Sônia e Rodney.

## Onde configurar o Firebase

1. Crie um projeto no Firebase.
2. Ative o **Google** em **Authentication > Sign-in method**.
3. Crie um banco em **Firestore Database**.
4. Copie `.env.example` para `.env` e preencha as chaves:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

5. Edite `src/config/people.js` e troque:

```js
COLOCAR_EMAIL_EDNEY_AQUI
COLOCAR_EMAIL_SONIA_AQUI
COLOCAR_EMAIL_RODNEY_AQUI
```

pelos e-mails reais de cada conta Google.

6. No console do Firebase, publique as regras de `firestore.rules`.

## Rodar localmente

```bash
npm install
npm run dev
```

## Publicar no GitHub Pages

O projeto já está preparado para build estático com Vite. No GitHub:

1. Vá em **Settings > Pages**.
2. Em **Build and deployment**, selecione **GitHub Actions**.
3. Cadastre as mesmas variáveis `VITE_FIREBASE_*` em **Settings > Secrets and variables > Actions > Variables**.
4. Faça push para a branch `main`.

O workflow `.github/workflows/deploy.yml` vai gerar a pasta `dist` e publicar no GitHub Pages.
