# Checklist de testes no celular / Mobile test checklist / Lista de pruebas en el móvil

Faça tudo UMA vez em cada idioma (Menu $ → Idiomas). Marque ✅/❌ e anote o aparelho (ex.: iPhone 13 Safari, Pixel 7 Chrome).
Do it once per language. / Hazlo una vez por idioma.

## A. Instalação e offline
- [ ] Abrir o site em HTTPS e instalar (Android: "Instalar app"; iPhone: Compartilhar → Adicionar à Tela de Início).
- [ ] Ícone aparece certo (Android: ícone redondo sem cortar o $).
- [ ] Abrir pelo ícone: tela cheia, fundo escuro, sem barra do navegador.
- [ ] Modo avião → abrir o app: abre e mostra os dados.

## B. Editar gasto RECORRENTE (pt / en / es)
Aba Definições / Budget / Presupuesto → cartão de recorrentes.
- [ ] Criar recorrente "Netflix" R$ 39,90, dia 5. Aparece o gasto do mês (se o dia já passou).
- [ ] Editar o recorrente: mudar valor para 44,90 → salvar. O valor novo aparece na lista; gastos antigos NÃO mudam.
- [ ] Editar o dia (5 → 28): sem erro, sem duplicar o gasto do mês.
- [ ] Apagar o recorrente → "Desfazer" dentro de 7 s volta tudo.
- [ ] Textos (títulos, botões, avisos) estão no idioma escolhido, sem texto cortado.

## C. Editar PARCELAMENTO (pt / en / es)
- [ ] Criar gasto de R$ 300 em 3x. Aparece "(1/3)" no mês certo; as outras parcelas nos meses seguintes.
- [ ] Editar o parcelamento (nome ou categoria): salvar sem erro; a soma das parcelas continua R$ 300,00.
- [ ] Parcelamento com parcela já paga: valor/nº de parcelas ficam travados (ou avisam) — conferir mensagem.
- [ ] Apagar parcelamento → Desfazer.
- [ ] Idioma: "1/3", moeda e datas seguem o idioma.

## D. Medidor de armazenamento e compressão (SEM entrar na conta)
Aba Definições / Budget / Presupuesto → cartão "Armazenamento e comprovantes" / "Storage & receipts" / "Almacenamiento y comprobantes".
- [ ] Anexar 5 fotos (câmera do celular) em gastos diferentes. A barra sobe e o texto mostra "n fotos · x MB".
- [ ] Tocar "Comprimir fotos": aparece aviso "Fotos comprimidas" e o MB total diminui (ou fica igual se já estavam pequenas).
- [ ] Com ~50 fotos locais (ou barra ≥ 70%): aparece o aviso em amarelo sugerindo entrar na conta.
- [ ] Armazenamento cheio: aparece "Não foi possível salvar…" (e o app não trava).

## E. Medidor DEPOIS de entrar na conta
- [ ] Entrar (Menu → Conta). Esperar "Sincronizado".
- [ ] O medidor cai (fotos viraram links) e o botão "Comprimir fotos" some (só aparece com fotos locais).
- [ ] As miniaturas/fotos dos gastos antigos continuam abrindo.

## F. Login (pt / en / es)
- [ ] "Receber código por e-mail": digitar o e-mail → chega o código → digitar → entra.
- [ ] Código errado: mensagem de erro, sem travar.
- [ ] "Continuar com Google": volta para o app já logado (iPhone instalado na tela inicial pode abrir no Safari: se acontecer, anote).
- [ ] "Sair": volta a mostrar os botões de login; dados locais continuam.

## G. Sincronização entre 2 aparelhos
- [ ] Aparelho 1: criar gasto "Teste A". Aparelho 2 (mesma conta): aparece em até 15 min ou ao tocar "Sincronizar agora".
- [ ] Editar o mesmo gasto nos dois: vale o último editado; aparece aviso "Atualizado de outro aparelho".
- [ ] Apagar no aparelho 1 → some no 2. A foto some do Supabase Storage ~2 min depois.

## H. Sem internet
- [ ] Modo avião: criar 2 gastos e editar 1. O app mostra "Sem internet… alterações ficam salvas" e "2 alterações aguardando envio".
- [ ] Fechar o app (arrastar para fora) e abrir ainda offline: os gastos continuam lá.
- [ ] Desligar modo avião: em poucos segundos mostra "Sincronizado" e a contagem pendente some.

## I. Troca de conta no mesmo aparelho
- [ ] Sair e entrar com OUTRA conta: aparece aviso de que os dados locais serão apagados. "Cancelar" → continua deslogado, dados intactos. "OK" → aparelho limpo e mostra só os dados da nova conta.

## J. Drive antigo (só quem usava)
- [ ] Quem já tinha conectado o Drive vê o cartão "Backup antigo (Google Drive)" em Conta; "Importar backup antigo" junta (não apaga). "Desconectar do Drive" esconde o cartão.
- [ ] Quem nunca usou o Drive NÃO vê esse cartão.
