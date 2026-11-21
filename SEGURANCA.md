# Expense Control: análise de segurança (v4.0)

## O que o app guarda e onde
| Dado | Onde | Vai para a nuvem? |
|---|---|---|
| Gastos, parcelas, recorrentes, metas, rendas, preferências | localStorage do navegador | Só se a pessoa entrar na conta (Supabase, com RLS por usuário) |
| PIN | localStorage, só o hash (PBKDF2 + sal) | Nunca |
| Foto de perfil, fundo, música | localStorage/IndexedDB | Nunca |
| Comprovantes/imagens de pagamento | **não existem mais** | Nunca |

## Ameaças e como estão cobertas
| Ameaça | Controle | Limite |
|---|---|---|
| Vazamento de imagem de pagamento | Recurso removido; imagens antigas apagadas do aparelho e do Storage | Backups do provedor podem reter por um tempo |
| Script injetado (XSS) | `esc()` nas saídas, CSP com hash por script inline, `object-src 'none'`, `base-uri 'self'` | `style-src` ainda permite estilos inline (o app usa muitos) |
| Clickjacking | `frame-ancestors 'none'` e `X-Frame-Options` no `_headers` | Só vale com hospedagem que leia `_headers` |
| Acesso a dados de outra conta | RLS forçado, 4 políticas por tabela, `revoke` do anon | Precisa do teste com 2 contas (LEIA-ME, passo 9) |
| Adivinhar o PIN | PBKDF2 310 mil iterações, espera 30 s a 15 min que persiste | PIN de 4 dígitos tem só 10 mil combinações: quem copiar o localStorage consegue testar offline |
| Dados lidos no aparelho | PIN trava a tela | **Dados NÃO são criptografados.** Quem tiver acesso ao navegador desbloqueado lê tudo |
| Importar arquivo malicioso | Limite de 8 MB, `migrate()` filtra e converte tipos | Chaves extras desconhecidas no JSON são mantidas |
| Vazar URL por Referer | `no-referrer` | — |
| Chave `service_role` | Nunca no app; só a anon key pública | Não a use em lugar nenhum do front |

## Recomendações (ordem de valor)
1. Criptografar os dados locais com chave derivada de uma senha forte (WebCrypto AES-GCM) em vez de só PIN de 4 dígitos.
2. Rodar o teste de 2 contas e o SQL no seu projeto Supabase, e configurar SMTP próprio.
3. Hospedar onde `_headers` funcione (Cloudflare Pages ou Netlify) e conferir o HSTS.
4. Após publicar: apagar o bucket `receipts` e rodar a seção 5-final do SQL.
5. Remover o legado do Google Drive quando ninguém precisar mais importar.
