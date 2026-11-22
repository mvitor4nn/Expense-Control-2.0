# Expense Control — pacote do app

Arquivos: `index.html` (app, **não edite os scripts inline**: a política de segurança confere o hash deles), `google-sync.js` (login e backup pelo Google), `manifest.webmanifest`, `sw.js`, ícones PNG, `privacy.html`, `terms.html`.

Não existe servidor nem banco de dados: os dados ficam no aparelho e, se a pessoa entrar com o Google, também num arquivo na **pasta privada do app no Google Drive dela** (escopo `drive.appdata`, que não exige verificação do Google).

## Configurar o login (só no Google Cloud Console)
1. Abra o [Cloud Console](https://console.cloud.google.com) e escolha (ou crie) o projeto.
2. **APIs e serviços → Biblioteca → Google Drive API → Ativar.**
3. **Google Auth Platform** (ou "Tela de permissão OAuth"):
   - Preencha nome do app e e-mail de suporte.
   - **Acesso a dados** (Scopes): adicione `.../auth/drive.appdata` e `.../auth/userinfo.email`.
   - **Público**: mude para *Em produção* (senão só os "usuários de teste" conseguem entrar).
4. **Credenciais → seu ID do cliente OAuth (tipo Web)** → **Origens JavaScript autorizadas**: adicione o endereço do app (ex.: `https://meuapp.pages.dev`, sem barra no fim). Não precisa de URI de redirecionamento.
5. Confira se o ID do cliente é o que está em `CFG.clientId` no topo de `google-sync.js`. Nunca coloque o *client secret* no app.
6. Publique os arquivos por HTTPS (Cloudflare Pages, Netlify, GitHub Pages…).

## Como funciona (no estilo do backup do WhatsApp)
Em **Menu › Configurações › Backup**:
- **Último backup** + botão **Fazer backup agora**. Sem conta, o botão abre a janela "Entre para fazer backup" com **Continuar com o Google**.
- **Conta do Google**: mostra a conta; ao tocar, dá para trocar de conta ou desconectar.
- **Backup automático**: Desativado, A cada 4 dias ou Toda semana. Só salva se algo mudou.
- **Restaurar backup** (junta com o que já está no aparelho; nada é apagado) e **Apagar backup da nuvem**.
- Ao entrar numa conta que já tem backup (ex.: celular novo), o app oferece restaurar.
- O acesso do Google dura cerca de 1 hora e o app não tem servidor para renová-lo sozinho. Quando chega a hora do backup automático e o acesso venceu, o app espera o próximo toque na tela, abre e fecha a janela do Google rapidamente e salva.
- Desconectar só para os backups; os gastos continuam no aparelho.
- O backup antigo do Drive (`expense-control-backup.json`) é oferecido para restauração na primeira vez.
- Não entra no backup: PIN, tema, papel de parede, música, alertas.

## Teste no celular (checklist)
- Continuar com o Google, escolher a conta, conferir "Último backup" preenchido.
- Em outro aparelho (ou reinstalando o app), entrar com o mesmo Google e aceitar **Restaurar**: os gastos voltam.
- Lançar um gasto e tocar em **Fazer backup agora**; ver o horário mudar.
- Trocar para "Desligado" e conferir que nada é salvo sozinho.
- Desconectar: os gastos continuam no aparelho.

## Pendências conhecidas
- Preencha seu e-mail de contato em `privacy.html`.
