# Expense Control — pacote do app

Arquivos: `index.html` (app, **não edite os scripts inline**: a política de segurança confere o hash deles), `supabase-sync.js`, `supabase-schema.sql`, `manifest.webmanifest`, `sw.js`, ícones PNG, `privacy.html`, `terms.html`.

## Ativar a nuvem (Supabase)
1. Crie um projeto em supabase.com.
2. **SQL Editor** → cole todo o `supabase-schema.sql` → Run. (Cria `ec_items`, `ec_prefs`, regras RLS e a função de excluir conta. Não cria Storage: o app não guarda fotos.)
3. **Authentication → Providers → Email**: deixe ligado. Em "Password", mínimo de 8 caracteres. Se "Confirm email" estiver ligado, quem criar conta precisa abrir o e-mail antes de entrar.
4. **Project Settings → API**: copie *Project URL* e a chave *anon / publishable*. Cole em `CFG.url` e `CFG.key` no topo de `supabase-sync.js`. **Nunca** use a `service_role`.
5. Publique os arquivos por HTTPS (Cloudflare Pages, Netlify, GitHub Pages…). Em **Authentication → URL Configuration**, ponha o endereço do app em *Site URL*.

## Teste no celular (checklist)
- Criar conta, entrar, lançar um gasto, ver em "Dados" a última sincronização.
- Entrar com a mesma conta em outro aparelho e conferir se o gasto aparece.
- Modo avião: lançar um gasto, voltar a internet e conferir se ele subiu sozinho.
- Editar/apagar um gasto em um aparelho e conferir no outro.
- Sair e entrar com outra conta: os dados da primeira não podem aparecer.
- Conferir (como outro usuário) que um usuário não enxerga linhas do outro.

## Como o sync decide
- Cada item guarda um "hash" do último estado enviado; o que mudou (ou foi apagado) fica pendente e sobe quando houver internet.
- Se o mesmo item mudou nos dois aparelhos, vale o do aparelho que sincroniza por último.
- Exclusões viajam como "marcas" (tombstones), então apagar em um aparelho apaga nos outros.
- Não sincroniza: PIN, tema, música, alertas.

## Endurecer (recomendado)
A biblioteca `supabase-js` é carregada do jsDelivr numa versão fixa. Para não depender de CDN: baixe `supabase.min.js` dessa versão, coloque na pasta, ponha `lib: 'supabase.min.js'` em `CFG`, adicione o arquivo na lista `SHELL` do `sw.js` e, se quiser, remova `https://cdn.jsdelivr.net` do `script-src` na tag CSP do `index.html`.

## Pendências conhecidas
- Recuperação de senha por e-mail ainda não existe (dá para pedir no painel do Supabase).
- Preencha seu e-mail de contato em `privacy.html`.
