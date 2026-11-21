# Expense Control — passo a passo (o que SÓ você pode fazer)

Troque `SEU-DOMINIO` pelo endereço HTTPS onde você vai publicar (ex.: `gastos.exemplo.com`) e `<REF>` pelo "Reference ID" do seu projeto Supabase.

## 1. Criar o projeto Supabase
1. Entre em https://supabase.com → **New project**.
2. Name: `expense-control` · Region: **South America (São Paulo)** · Database Password: gere uma forte e guarde no gerenciador de senhas (NÃO vai no código).
3. Espere o projeto ficar verde ("Healthy").

## 2. Rodar o schema (tabelas + RLS + Storage + excluir conta)
1. Menu **SQL Editor → New query**.
2. Abra `supabase-schema.sql`, copie TUDO, cole e clique **Run**. Deve terminar com "Success". (Já criou o projeto antes? Rode de novo: é idempotente. Na v4.0 ele fecha o envio de arquivos do bucket antigo `receipts` e remove vestígios de foto das linhas.)
3. Confira (cole e rode, uma por vez):
   - `select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('profiles','expenses','recurring','installments','goals','incomes');` → todas `true | true`.
   - `select id, public, file_size_limit from storage.buckets where id='receipts';` → projeto novo: nenhuma linha. Projeto antigo: `public = false`, `file_size_limit = 1`.

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
2. **APIs & Services → OAuth consent screen**: User type **External**, App name `Expense Control`, e-mail de suporte, escopos `openid`, `email`, `profile`. Preencha também **Application home page** (`https://SEU-DOMINIO/`), **Privacy policy link** (`https://SEU-DOMINIO/privacy.html`) e **Terms of service link** (`https://SEU-DOMINIO/terms.html`). Publique (**Publish app**) para qualquer conta Google poder entrar.
   (Antes: complete os campos `[PREENCHER]` das duas páginas e revise com um advogado. O Google confere que a URL da política abre e fala do app.)
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
- Envie TODOS os arquivos da pasta (index.html, **privacy.html**, **terms.html**, sw.js, manifest.webmanifest, ícones, supabase-sync.js, **`_headers`** e `vendor/` se fez o passo 6) na RAIZ do site.
- **Antes de publicar**, depois de colar URL e key no passo 5, rode `python3 tools/build-csp.py`: ele recalcula a política de segurança (CSP) e o `_headers` com o seu host Supabase. Rode de novo sempre que editar um script inline.
- `privacy.html` e `terms.html` são **rascunho técnico**: preencha os `[PREENCHER]` (responsável, e-mail, data, região do servidor, hospedagem, foro) e revise com um advogado ANTES de publicar.
- `tests/`, `docs/` e `*.sql` podem ficar de fora do site público.
- Depois de publicar: volte aos passos 3 e 4 e confirme que o domínio final está nas listas.

## 9. Teste de segurança (obrigatório, 5 min)
1. Navegador 1: entre com a conta A, crie um gasto (sem foto: o app não tem mais comprovantes).
2. Navegador 2 (janela anônima): entre com a conta B.
3. O gasto da conta A **não pode** aparecer na B.
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

## Versão 3.1
- **Excluir conta e dados dentro do app** (LGPD): Conta > Zona de risco; Dados e backup > Apagar dados do aparelho. Exige rodar o SQL novo (passo 2).
- **Política de privacidade e Termos de uso** (`privacy.html`, `terms.html`), linkados em Sobre o app e em Conta. São rascunho técnico: preencher `[PREENCHER]` e revisar com advogado.
- Cache do service worker: `ec-v4`.

## Versão 3.2
- **Planejar** (antiga aba "Definições"): seções recolhíveis (Renda e limite, Orçamento por categoria, Fixos e parcelas, Metas, Armazenamento), atalhos no topo e o app lembra o que você deixou aberto.
- **Configurações > Lembrete diário**: horário configurável. Sem servidor de push, o aviso só dispara com o app aberto ou instalado em segundo plano, conforme o navegador; com o app fechado pode não chegar. Precisa liberar notificações.
- **Configurações > Segurança > Bloquear automaticamente** (só com PIN ativo): Imediato, 30 s, 1 min ou 5 min.
- **Dados e backup**: data do último backup (exportação JSON/CSV) e da última sincronização, e **Relatório mensal em PDF** gerado no aparelho.
- **Configurações**: campo de busca.
- Nada novo para rodar no Supabase nesta versão. Ao publicar, suba também o `sw.js` (cache `ec-v5`).

---
## Versão 4.0 (comprovantes removidos + segurança)
- **Removido:** adicionar comprovantes e imagens de pagamentos (formulário, 📎 no extrato, compressão, envio ao Storage, URLs assinadas). Foto de perfil e foto de fundo continuam: ficam só no aparelho e nunca vão para a nuvem.
- **Quem usava fotos:** na primeira abertura as imagens de comprovante são apagadas do aparelho (aviso único "Comprovantes removidos"); os gastos ficam. Na nuvem, o app apaga uma vez por conta os arquivos antigos do bucket `receipts`. Quando todos os aparelhos tiverem sincronizado, apague o bucket em Storage e rode a seção "5-final" do SQL.
- **PIN:** PBKDF2-SHA256 (310 mil iterações) com migração automática do PIN antigo; tentativas erradas e espera (30 s → 15 min) persistem ao recarregar a página. Lembrete: o PIN trava a tela, não criptografa os dados.
- **CSP + cabeçalhos:** meta CSP em todas as páginas (scripts inline por hash, sem `unsafe-inline` para script), `referrer: no-referrer`, arquivo `_headers` (frame-ancestors, HSTS, nosniff, Permissions-Policy). Gerador: `tools/build-csp.py`.
- Importar JSON recusa arquivos acima de 8 MB. Cache do service worker: `ec-v6`.
