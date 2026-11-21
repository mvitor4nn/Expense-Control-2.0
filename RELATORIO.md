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

## 2. Fotos (HISTÓRICO: recurso REMOVIDO na v4.0, ver fim do arquivo)
- Envio ao bucket privado `receipts` em `<uid>/<id>.jpg` (só JPEG/PNG/WebP, ≤ 2 MB, validado antes). O app guarda `photo` (URL assinada) + `photoPath`; **o servidor guarda só `photoPath`** (nenhuma URL com token no banco).
- **Migração das antigas**: no primeiro login, toda foto `data:` é enviada (uma falha não trava as demais; a foto problemática continua local).
- **Renovação**: URL válida por 30 dias; renovada quando restam < 10 dias, a cada sincronização/abertura/15 min. Renovar não conta como edição.
- Compressão e medidor passaram a considerar só fotos locais (`data:`): comprimir URL remota quebraria no canvas.

## 5. Foto de gasto apagado (HISTÓRICO: removido na v4.0)
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
- Exclusões lógicas no servidor não são limpas automaticamente (ocupam pouco).

## Versão 3.0: menu e configurações
Redesenho das telas Menu e Configurações (ver LEIA-ME). Testado no Chromium (390x844, escuro/claro, pt/en/es): navegação com pilha, botão voltar do navegador, resumo de tema, apelido e contador, foto de perfil, "Começar do zero" com confirmação, Testar aviso, tela Sobre; sem erros de página. NÃO testado: aparelho real, tema com foto de fundo, modo ocultar valores, login com conta.

## Versão 3.1: excluir conta e dados dentro do app (LGPD / lojas)
Fluxo de **Conta > Zona de risco > Excluir minha conta** (só aparece logado):
1. Confirmação forte: a pessoa digita APAGAR / DELETE / BORRAR (conforme o idioma) ou o próprio e-mail; só então o botão final habilita. O texto diz que é permanente.
2. Sem internet o app avisa que precisa de conexão e não faz nada.
3. O app lista (em páginas de 100) e remove **todos** os arquivos de `<uid>/` no bucket `receipts`. Isso vem antes de apagar o usuário porque o cascade do banco não apaga o Storage.
4. Chama `sb.rpc('delete_my_account')` (função `security definer` em `supabase-schema.sql`, só apaga `auth.uid()`; o cascade remove as linhas das 6 tabelas). A `service_role` nunca é usada no app.
5. Se qualquer passo falhar: nada local é limpo, o erro aparece no mesmo painel e dá para tentar de novo. Atenção: se os arquivos já foram removidos e o rpc falhou, as fotos de comprovantes ficam sem arquivo na nuvem até a nova tentativa funcionar.
6. Sucesso: `signOut` local, zera o estado do sync, pergunta se também apaga os dados deste aparelho (OK = apagar, padrão) e mostra toast de conclusão.

Em **Dados e backup > Zona de risco** há "Apagar dados do aparelho" (sem conta), com a mesma confirmação (digitar a palavra). Remove as chaves `cifrao-*`, `ec-*` e `sb-*` do localStorage, o IndexedDB da música e recarrega. Não exclui conta na nuvem.

Testado: lógica do fluxo no `tests/sync-harness.js` com Supabase **simulado** (arquivos antes do rpc, paginação de 230 arquivos, falha no rpc não limpa nada, sucesso limpa e desloga, offline não chama nada, "manter dados locais"). NÃO testado: a função SQL e o cascade no Supabase real, o Storage real, aparelho real.

## Versão 3.2: melhorias de uso e acessibilidade
- Lembrete diário (askNotif/sysNotify), bloqueio automático configurável, datas de backup/sync, PDF mensal (escritor de PDF próprio, sem biblioteca e sem rede), busca em Configurações, Planejar com seções recolhíveis. Preferências ficam em `cifrao-prefs-v1` (somente neste aparelho; apagadas por "Apagar dados do aparelho").
- Acessibilidade: textos de 10 a 11,5 px passaram a 12 px; KPIs do início quebram linha em vez de cortar. Contraste (WCAG AA 4,5:1 para texto normal) medido por script nos temas escuro e claro e com fotos sintéticas: corrigidos acento do tema escuro (#A07BFB, texto do selo escuro), verde/âmbar/vermelho do tema claro, acento do claro (#6D28D9), fim do gradiente dos botões (#DB2777), letras dos ícones de categoria, cor do placeholder e as superfícies sobre foto. Com foto de fundo, o app mede o brilho médio da foto e escurece o mínimo necessário (o controle "Escurecer a foto" não vai abaixo disso).
- Tab Extrato em espanhol virou "Extracto" (Movimientos era cortado em 12 px).

### Testado em 3.2 (Chromium headless 390x844 + Node)
- Sintaxe (node --check) do script inline, sw.js e supabase-sync.js; harness de sync: 53 ok, 0 falhas (inclui lastSync).
- Prints e varredura de estouro/corte/fonte < 12 px: escuro e claro × pt/en/es nas telas Planejar, Configurações (+busca), Lembrete, Segurança e Dados. Console sem erros.
- Comportamento: bloqueio automático (imediato, 30 s, 5 min, simulando tempo), card só com PIN, lembrete (liga/desliga, dispara uma vez por dia, não avisa se o horário passou há mais de 3 h, permissão negada), datas de backup/sync, busca, seções recolhíveis persistentes e atalhos. Notificação do sistema foi testada com Notification simulado.
- PDF gerado nos 3 idiomas e aberto como imagem (pdftoppm); pdfinfo lê as páginas.

### NÃO testado em 3.2
- Notificação real em celular/Android/iOS e com o app fechado (depende de push, que não existe); lembrete em aparelho real.
- Fotos reais de fundo (só cores sólidas sintéticas); contraste de gradientes e de texto sobre fotos com muito detalhe.
- PDF em leitores diferentes (só pdftoppm/poppler); nomes com emoji ou alfabetos não latinos saem sem esses caracteres no PDF.
- Última sincronização com Supabase real (só harness e tela com valor simulado); Google login; aparelho real; leitor de tela.
- Há um corte pré-existente no cartão "Disponível" do início (valor cortado na borda); não foi alterado.

## Versão 4.0: comprovantes removidos e endurecimento de segurança
**Pedido:** remover a função de anexar comprovantes/imagens de pagamento e deixar o app o mais seguro possível.

### Remoção
index.html: campo de foto, `showPhoto`/`resizePhoto`/`compressPhotos`, 📎, medidor de comprovantes (agora só "x MB de ~5 MB"), textos pt/en/es. `migrate()` descarta `photo`, `photoPath` e `photoExp` de qualquer dado lido (inclui importação JSON e backup do Drive); no boot grava a limpeza e avisa uma vez.
supabase-sync.js: sem upload, URLs assinadas, renovação e fila de remoção. `core()` nunca envia campos de foto; `sane()` descarta-os (até um `photoPath` válido vindo da nuvem). Novo `purgeLegacy()`: uma vez por conta apaga arquivos antigos de `<uid>/` no bucket `receipts`; tolera bucket inexistente; erro do Storage não derruba o sync.
supabase-schema.sql: sem políticas de INSERT/UPDATE no bucket (ninguém envia), bucket fechado (`file_size_limit=1`), `update` que remove vestígios de foto do jsonb, seção "5-final" para depois de apagar o bucket.
privacy.html, terms.html, checklist, LEIA-ME atualizados.

### Segurança adicionada
PIN com PBKDF2 + migração do SHA-256 antigo, comparação em tempo constante, espera persistente com backoff. CSP por meta com hash dos scripts inline (handler inline das fontes removido), `_headers`, referrer, limite de 8 MB na importação.

### TESTADO (v4.0)
- `node tests/sync-harness.js`: 55 ok, 0 falhas (Supabase simulado).
- Chromium headless 390x844 contra servidor local: comprovante antigo semeado é apagado e os gastos ficam; formulário sem campo de foto; gasto salvo; PIN antigo destrava e vira v2; 5 erros geram espera que sobrevive a recarregar; PIN novo nasce v2; service worker ativo com a CSP; varredura das 4 abas em pt/en/es sem a palavra comprovante/receipt/comprobante; zero violações de CSP e zero erros de página.
### NÃO testado (v4.0)
SQL novo num Supabase real; login (código/Google) sob a CSP; biblioteca do Supabase pela CDN (sem internet no ambiente); Google Drive legado sob a CSP; aparelho real e leitor de tela; fontes do Google (sem rede). Dados locais continuam sem criptografia (o PIN só trava a tela).
