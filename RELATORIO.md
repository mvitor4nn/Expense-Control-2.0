# Relatório da revisão — Expense Control

## Bug crítico encontrado
A sincronização **nunca rodaria**: `supabase-sync.js` lia `window.S`, `window.Repo`, `window.refresh`, `window.lang`, mas o `index.html` mantém tudo dentro de uma IIFE (nada em `window`), então `run()` saía na primeira linha. Corrigido com a ponte `window.ECBridge` (edição pontual no index.html).

## 1. Supabase: login, RLS, sync
| Problema | Correção |
|---|---|
| Sync nunca executava (estado não exposto) | `ECBridge` com getters; `S` é reatribuído em restauros, então é função, não cópia |
| `push` apagava no servidor tudo que não estava no aparelho (um aparelho novo/defasado apagava dados de outro) | Exclusão agora é **lógica** (tombstone `deleted=true`) e só vai o que o aparelho mudou |
| Dados de exemplo (seed) subiriam para a nuvem | Itens `s<número>` com `sample=true` nunca são enviados; em aparelho novo o exemplo some quando a nuvem tem dados |
| Só 6 coleções sincronizavam; salário/limites/apelido não | `profiles.prefs` guarda salary, va, limit, warn, nick, budgets |
| E-mail: link mágico abre no Safari, não no app instalado (iPhone) | Login por **código** (`verifyOtp`) + link como alternativa; PKCE ligado; cooldown de 60 s; validação de e-mail |
| `user.email` entrava em `innerHTML` sem escape | Tudo escapado |
| `photo` do preview entrava em `innerHTML` sem escape | `esc(src)` em `showPhoto` |
| Dados vindos da nuvem eram aceitos como estavam | `sane()` + `migrate()`; `photoPath` só aceito se começa com o uid e tem formato `<uuid>/<arquivo>` |
| RLS único `for all` | 4 políticas explícitas por tabela, `force row level security`, `revoke ... from anon`, `(select auth.uid())` |
| Sem limite de tamanho/ID | `check` de `octet_length(data) < 20000` e `char_length(id) ≤ 64` |
| Relógio errado de um celular "ganhava para sempre" | Trigger `ec_touch` limita `updated_at` a now()+5 min e ignora escrita mais antiga que a do servidor |
| Lib do Supabase na CDN bloqueava e quebrava offline | Carregada sob demanda: `vendor/supabase.js` (se existir) → CDN; `defer` no sync |

## 2. Fotos
- Envio ao bucket privado `receipts` em `<uid>/<id>.jpg` (só JPEG/PNG/WebP, ≤ 2 MB, validado antes). O app guarda `photo` (URL assinada) + `photoPath`; **o servidor guarda só `photoPath`** (nenhuma URL com token no banco).
- **Migração das antigas**: no primeiro login, toda foto `data:` é enviada (uma falha não trava as demais; a foto problemática continua local).
- **Renovação**: URL válida por 30 dias; renovada quando restam < 10 dias, a cada sincronização/abertura/15 min. Renovar não conta como edição.
- Compressão e medidor passaram a considerar só fotos locais (`data:`): comprimir URL remota quebraria no canvas.

## 5. Foto de gasto apagado
Apagar o gasto, trocar a foto ou remover a foto coloca o arquivo numa fila de remoção do Storage com **atraso de 2 min** (o "Desfazer" dura 7 s, e desfazer cancela a remoção). Ao editar e remover a foto, `photoPath` também é limpo (antes ficaria órfão).

## 6. Conflitos
Por item: vence o `updated_at` (hora da edição, carimbada ~300 ms após cada gravação, mesmo offline) mais novo. Itens diferentes editados em aparelhos diferentes se preservam. O servidor também recusa escrita mais antiga. Aviso "Atualizado de outro aparelho" quando um item local foi superado.
Limite conhecido: depende do relógio dos aparelhos (o servidor só barra relógio no futuro > 5 min).

## 7. Troca de conta
O aparelho lembra o dono dos dados. Login com outro uid → aviso (3 idiomas); OK limpa gastos, metas, avatar, fundo e chave do Drive antes de mesclar; Cancelar desloga sem apagar nada. Primeiro login com dados locais existentes **não** é troca: os dados locais são mesclados na conta.

## 8. Sem internet
Fila persistida no aparelho (`ec-sync-v1`): itens alterados, exclusões e remoções de foto. Retry automático com backoff 4 s → 5 min (com variação), imediato no evento `online`, ao voltar para o app e a cada 15 min. A tela mostra "N alterações aguardando envio". Sair da conta com pendências pergunta antes.

## 9. Backup do Google Drive — decisão e impacto
**Decisão:** o Drive deixou de ser um caminho de nuvem. Não envia nada e não faz backup automático. Virou **importação única e aditiva** do backup antigo, e só aparece para quem já tinha conectado o Drive.
- **Quem já usa:** os dados continuam no aparelho (nada é apagado). Em Menu → Conta aparece "Backup antigo (Google Drive)": *Importar backup antigo* junta o conteúdo do Drive ao aparelho (não substitui) e, estando logado na nuvem nova, sobe para o Supabase. Depois, *Desconectar do Drive*.
- **Risco:** quem **não** entrar na conta nova deixa de ter backup automático. Recomende entrar no Supabase e importar uma vez antes de reinstalar o app.
- O arquivo no Drive (pasta oculta do app) não é apagado por este app. O escopo `drive.appdata` do Google não tem versão só-leitura.
- Quando ninguém mais precisar importar, apague o bloco "backup na conta Google" do index.html e o cartão `#gLegacy`.

## 3. Lighthouse — o que foi verificado de forma ESTÁTICA (não rodei o Lighthouse)
Não há Chrome/rede neste ambiente; **não há nota Lighthouse real**. Verifiquei no código:
- PWA: manifest com name/short_name/start_url/scope/display/ícones 192, 512 e maskable (conferi visualmente: ícone cheio e o "$" dentro da zona segura), `theme_color`/`background_color`, `apple-touch-icon`, SW com `fetch`.
- Corrigido: SW cacheava respostas 404/500 e devolvia o `index.html` para qualquer falha (inclusive scripts) → agora só cacheia respostas OK do mesmo domínio, fallback só para navegação, timeout de 5 s, cache v2, ícone maskable pré-cacheado, `vendor/supabase.js` opcional. Manifest ganhou `id`, `categories`, `dir`. `<noscript>` adicionado. Script bloqueante da CDN removido.
- Acessibilidade (estático): `lang` dinâmico, viewport sem bloqueio de zoom, `<main>`/`<nav>`, `aria-label` nos botões de ícone, diálogos com `role=dialog` + `aria-modal`, `:focus-visible`, `prefers-reduced-motion`. Pendências possíveis: textos de 10,5–11 px (podem acionar "tamanhos de fonte legíveis"), contraste não medido.
- SEO: title e meta description presentes. Sem `canonical` e sem `robots.txt` (opcionais; coloque o canonical depois de saber o domínio).
- Boas práticas: precisa HTTPS (passo 8 do LEIA-ME); sem `console.log`, sem `document.write`. Não adicionei CSP porque o app usa script/estilo inline; uma CSP sem testar poderia quebrar o app.

## O que foi TESTADO (e com quê)
- `node --check` em supabase-sync.js, sw.js e no script inline do index.html: OK.
- `node tests/sync-harness.js`: **34 verificações passam** contra um Supabase **simulado em memória**: primeiro envio, migração de foto, URL só local, conflito por item, escrita antiga recusada, exclusão + remoção atrasada de foto, desfazer, fila offline com retry, foto inválida não trava, renovação de URL, troca de conta, saneamento.

## O que NÃO foi testado (não finjo que foi)
- Nenhuma execução real do index.html no navegador (sem Chrome aqui): a ponte, o cartão da conta, a importação do Drive e os textos novos só passaram em verificação de sintaxe/identificadores.
- Supabase real: schema SQL, RLS, trigger `ec_touch` (inclusive o `RETURN NULL` dentro de `upsert ... on conflict`), Storage, `createSignedUrls`, paginação do pull.
- E-mail com código (os modelos precisam do `{{ .Token }}`), Google OAuth, PKCE, e o comportamento do login no iPhone com o app instalado.
- Importação real do Drive; Lighthouse; instalação como PWA; qualquer coisa em celular.
- Exportar JSON leva os **links** das fotos (válidos até 30 dias), não as imagens.
- Excluir a conta no Supabase apaga as linhas (cascade), mas **não** os arquivos do Storage.
- Exclusões lógicas no servidor não são limpas automaticamente (ocupam pouco).
