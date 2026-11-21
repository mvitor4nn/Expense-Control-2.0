# Expense Control — passo a passo (o que SÓ você pode fazer)

Troque `SEU-DOMINIO` pelo endereço HTTPS onde você vai publicar (ex.: `gastos.exemplo.com`) e `<REF>` pelo "Reference ID" do seu projeto Supabase.

## 1. Criar o projeto Supabase
1. Entre em https://supabase.com → **New project**.
2. Name: `expense-control` · Region: **South America (São Paulo)** · Database Password: gere uma forte e guarde no gerenciador de senhas (NÃO vai no código).
3. Espere o projeto ficar verde ("Healthy").

## 2. Rodar o schema (tabelas + RLS + Storage)
1. Menu **SQL Editor → New query**.
2. Abra `supabase-schema.sql`, copie TUDO, cole e clique **Run**. Deve terminar com "Success".
3. Confira (cole e rode, uma por vez):
   - `select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('profiles','expenses','recurring','installments','goals','incomes');` → todas `true | true`.
   - `select id, public, file_size_limit from storage.buckets where id='receipts';` → `public = false`, `2097152`.

## 3. Login por e-mail (código de 6 dígitos)
1. **Authentication → Providers → Email**: ligado.
2. **Authentication → Email Templates**: nos modelos **Magic Link** e **Confirm signup**, adicione esta linha no corpo:
   `<p>Seu código: <b>{{ .Token }}</b></p>`
   (O código é o caminho principal: no iPhone, o link do e-mail abre no Safari e não no app instalado.)
3. **Authentication → URL Configuration**:
   - Site URL: `https://SEU-DOMINIO/`
   - Redirect URLs (adicione as duas): `https://SEU-DOMINIO/**` e `http://localhost:8080/**`
4. **Authentication → SMTP Settings**: o e-mail padrão do Supabase tem limite muito baixo (poucos e-mails por hora). Antes de usar de verdade, configure um SMTP próprio (Resend, Brevo, etc.).

## 4. Login com Google
1. https://console.cloud.google.com → crie/selecione um projeto.
2. **APIs & Services → OAuth consent screen**: User type **External**, App name `Expense Control`, e-mail de suporte, escopos `openid`, `email`, `profile`. Publique (**Publish app**) para qualquer conta Google poder entrar.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://SEU-DOMINIO`
   - Authorized redirect URIs: `https://<REF>.supabase.co/auth/v1/callback`
4. Copie **Client ID** e **Client secret**.
5. Supabase → **Authentication → Providers → Google**: ligue, cole Client ID e Client secret, **Save**.
   O *secret* fica SÓ no painel do Supabase. Nunca em arquivo do app.
   (Este cliente é separado do `GOOGLE_CLIENT_ID` do Drive antigo que está no index.html; não mexa nele.)

## 5. Colar URL e key no app
1. Supabase → **Project Settings → API**. Copie **Project URL** e a chave **anon / publishable** (a pública).
2. Em `supabase-sync.js`, linha 10, deixe assim:
   `var CFG={url:'https://<REF>.supabase.co',key:'COLE_A_ANON_KEY_AQUI'};`
3. **NUNCA** use a `service_role` / "secret" key. Ela ignora o RLS e daria acesso a todos os dados. A anon key é feita para ficar no código; quem protege os dados é o RLS do passo 2.

## 6. (Recomendado) Guardar a biblioteca do Supabase junto do app
Assim o login também carrega offline e sem depender de CDN. Na pasta do app:
```
mkdir -p vendor
curl -L -o vendor/supabase.js https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js
```
Sem isso o app usa a CDN (jsdelivr) automaticamente.

## 7. Testar localmente
```
cd expense-control
python3 -m http.server 8080
```
Abra `http://localhost:8080` no Chrome. (localhost vale como "seguro" para service worker.)

## 8. Publicar em HTTPS
Qualquer hospedagem estática serve: Cloudflare Pages, Netlify, GitHub Pages, Vercel.
- Envie TODOS os arquivos da pasta (index.html, sw.js, manifest.webmanifest, ícones, supabase-sync.js e `vendor/` se fez o passo 6) na RAIZ do site.
- `tests/`, `docs/` e `*.sql` podem ficar de fora do site público.
- Depois de publicar: volte aos passos 3 e 4 e confirme que o domínio final está nas listas.

## 9. Teste de segurança (obrigatório, 5 min)
1. Navegador 1: entre com a conta A, crie um gasto com foto.
2. Navegador 2 (janela anônima): entre com a conta B.
3. O gasto da conta A **não pode** aparecer na B. Em Supabase → **Storage → receipts**, as pastas são `<uid-de-A>/` e `<uid-de-B>/`.
4. Em **Authentication → Users** confirme que existem as duas contas.

## 10. Lighthouse real
- Chrome (no site publicado em HTTPS) → F12 → aba **Lighthouse** → Mode **Navigation**, Device **Mobile**, marque as 4 categorias → **Analyze page load**.
- Ou: `npx lighthouse https://SEU-DOMINIO --view --preset=perf` (e sem `--preset` para todas as categorias).
- Para PWA: DevTools → **Application → Manifest** (sem avisos vermelhos) e **Service Workers** (status "activated").
- Me mande a lista de itens reprovados que eu corrijo.

## 11. Testes no celular
Siga `docs/CHECKLIST-CELULAR.md` (pt/en/es).

## Se algo der errado
- "Nuvem não configurada": URL/key vazios ou com aspas erradas no passo 5.
- E-mail não chega: limite do SMTP padrão (passo 3.4) ou spam.
- Google "redirect_uri_mismatch": o URI do passo 4.3 deve ser exatamente `https://<REF>.supabase.co/auth/v1/callback`.
- Console do navegador (F12) mostra o erro técnico do sync com o prefixo `sync`.

---
## Versão 3.0 (menu e configurações)
- Menu: cartão de perfil, atalhos com estado (Tema, Música, Segurança, Idiomas), Configurações e Ferramentas ("Começar do zero" pede 2 toques).
- Configurações: grupos com ícones e resumo de estado; telas novas **Perfil** (apelido e foto) e **Sobre o app**.
- "Song" agora é "Música"; "Settings" agora é "Configurações / Settings / Ajustes".
- O botão voltar (e o gesto do celular) volta para a tela de origem.
- Cache do service worker: `ec-v3` (celulares com o app instalado recebem a versão nova).
