/* Expense Control — backup na conta Google (como o backup do WhatsApp), sem servidor próprio.
 * O app guarda uma cópia dos dados num arquivo JSON na pasta privada do app no Google Drive do próprio usuário
 * (escopo drive.appdata: só o app enxerga). Backup automático a cada 4 dias ou 1 vez por semana (ou desligado),
 * mais "Fazer backup agora" e "Restaurar". Só usa a ponte window.ECBridge do index.html. Sem fotos. */
(function () {
  'use strict';

  /* ===== Cloud Console: ID do cliente OAuth (tipo Web). É público — NUNCA coloque o "client secret" aqui ===== */
  var CFG = {
    clientId: '486699175294-laq31cssivlfp3k6jsdjk78bg7c01tss.apps.googleusercontent.com',
    file: 'expense-control-backup-v2.json',
    oldSync: 'expense-control-sync-v2.json', /* versão intermediária (sincronização): apagada junto ao apagar a nuvem */
    legacy: 'expense-control-backup.json', /* backup antigo do Drive: importado automaticamente na 1ª sincronização */
    scope: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email'
  };

  var META_KEY = 'ec-sync-v3';           /* prefixo ec- : "Apagar tudo deste aparelho" já limpa */
  var KINDS = ['expenses', 'recurring', 'inst', 'incomes', 'goals'];
  var meta = null, tok = null, tokExp = 0, tc = null, waiting = null, gisP = null, running = null;
  var timer = null, lastTry = 0, started = false, tapArmed = false, msg = { k: '', t: '' };

  /* ---------- textos ---------- */
  var TX = {
    pt: {
      login_t: 'Entre para fazer backup', login_s: 'Guarde seus gastos na sua conta Google e recupere tudo ao trocar de celular.',
      login_n: 'O backup fica no seu Google Drive, numa pasta que só este app lê. Nós não vemos seus dados.', priv: 'Política de privacidade', terms: 'Termos de uso',
      desc: 'Faça backup dos seus gastos na nuvem para não perdê-los ao trocar de celular.', acc_t: 'Conta do Google', noacc: 'Nenhuma', switch: 'Trocar de conta', auto_t: 'Backup automático',
      title: 'Backup',
      sub: 'Entre com sua conta Google para guardar uma cópia dos seus gastos e recuperá-los se trocar de celular. Sem conta, tudo fica só neste aparelho.',
      google: 'Continuar com o Google', nocfg: 'O login do Google ainda não está configurado neste app. Seus dados ficam só neste aparelho.',
      as: 'Conta', last: 'Último backup', never: 'ainda não', freq: 'Backup automático', f4: 'A cada 4 dias', f7: 'Toda semana', f0: 'Desativado',
      now: 'Fazer backup agora', restore: 'Restaurar backup', out: 'Desconectar', del: 'Apagar backup da nuvem',
      loading: 'Abrindo o Google…', saving: 'Salvando backup…', saved: 'Backup salvo.', looking: 'Procurando backup…', restored: 'Backup restaurado.',
      none: 'Não há backup nesta conta ainda.', pending: 'Sem internet. Tente de novo quando voltar.',
      found: 'Encontramos um backup de {d} nesta conta. Restaurar? Ele é juntado aos dados deste aparelho e nada é apagado.',
      found_keep: 'Se você tocar em Cancelar, este aparelho é mantido e o próximo backup substitui o da nuvem.',
      restore_ask: 'Restaurar o backup de {d}? Ele é juntado aos dados deste aparelho e nada é apagado.',
      e_cancel: 'Login cancelado ou bloqueado. Se o Google mostrou "origin_mismatch", adicione o endereço do app em Origens JavaScript autorizadas no Cloud Console.',
      e_pop: 'O navegador bloqueou a janela do Google. Permita pop-ups para este app e toque de novo.',
      e_api: 'A API do Google Drive não está ativada no projeto. Ative em Cloud Console > APIs e serviços > Biblioteca > Google Drive API.',
      e_scope: 'Faltou permitir o acesso ao backup do app. Toque em Continuar com o Google e aceite.',
      e_net: 'Sem conexão com o Google. Tente de novo.', e_gen: 'Não foi possível concluir. Tente de novo.',
      out_confirm: 'Desconectar do Google? Seus gastos continuam neste aparelho; só o backup automático para.',
      del_t: 'Apagar backup da nuvem?', del_b: 'Apaga para sempre o backup guardado na sua conta Google e desconecta o app. Os gastos deste aparelho não são apagados.',
      del_w: 'EXCLUIR', del_type: 'Para confirmar, digite EXCLUIR ou o seu e-mail:', del_go: 'Apagar backup', del_retry: 'Tentar novamente', cancel: 'Cancelar'
    },
    en: {
      login_t: 'Sign in to back up', login_s: 'Keep your expenses in your Google account and get everything back when you change phones.',
      login_n: 'The backup lives in your Google Drive, in a folder only this app can read. We never see your data.', priv: 'Privacy policy', terms: 'Terms of use',
      desc: 'Back up your expenses to the cloud so you do not lose them when you change phones.', acc_t: 'Google account', noacc: 'None', switch: 'Switch account', auto_t: 'Automatic backup',
      title: 'Backup',
      sub: 'Sign in with your Google account to keep a copy of your expenses and get them back if you change phones. Without an account, everything stays on this device.',
      google: 'Continue with Google', nocfg: 'Google sign-in is not set up in this app yet. Your data stays only on this device.',
      as: 'Account', last: 'Last backup', never: 'not yet', freq: 'Automatic backup', f4: 'Every 4 days', f7: 'Weekly', f0: 'Off',
      now: 'Back up now', restore: 'Restore backup', out: 'Disconnect', del: 'Delete cloud backup',
      loading: 'Opening Google…', saving: 'Saving backup…', saved: 'Backup saved.', looking: 'Looking for a backup…', restored: 'Backup restored.',
      none: 'There is no backup on this account yet.', pending: 'Offline. Try again when you are back online.',
      found: 'We found a backup from {d} on this account. Restore it? It is merged into this device\'s data and nothing is deleted.',
      found_keep: 'If you tap Cancel, this device is kept and the next backup replaces the cloud one.',
      restore_ask: 'Restore the backup from {d}? It is merged into this device\'s data and nothing is deleted.',
      e_cancel: 'Sign-in cancelled or blocked. If Google showed "origin_mismatch", add the app address to Authorized JavaScript origins in Cloud Console.',
      e_pop: 'The browser blocked the Google window. Allow pop-ups for this app and tap again.',
      e_api: 'The Google Drive API is not enabled in the project. Enable it in Cloud Console > APIs & Services > Library > Google Drive API.',
      e_scope: 'Access to the app backup was not granted. Tap Continue with Google and accept.',
      e_net: 'No connection to Google. Try again.', e_gen: 'Could not complete. Try again.',
      out_confirm: 'Disconnect from Google? Your expenses stay on this device; only the automatic backup stops.',
      del_t: 'Delete cloud backup?', del_b: 'Permanently deletes the backup stored in your Google account and disconnects the app. Expenses on this device are not deleted.',
      del_w: 'DELETE', del_type: 'To confirm, type DELETE or your email:', del_go: 'Delete backup', del_retry: 'Try again', cancel: 'Cancel'
    },
    es: {
      login_t: 'Inicia sesión para hacer copia', login_s: 'Guarda tus gastos en tu cuenta de Google y recupéralo todo al cambiar de teléfono.',
      login_n: 'La copia queda en tu Google Drive, en una carpeta que solo esta app lee. Nosotros no vemos tus datos.', priv: 'Política de privacidad', terms: 'Términos de uso',
      desc: 'Haz una copia de tus gastos en la nube para no perderlos al cambiar de teléfono.', acc_t: 'Cuenta de Google', noacc: 'Ninguna', switch: 'Cambiar de cuenta', auto_t: 'Copia automática',
      title: 'Copia de seguridad',
      sub: 'Inicia sesión con tu cuenta de Google para guardar una copia de tus gastos y recuperarlos si cambias de teléfono. Sin cuenta, todo queda solo en este dispositivo.',
      google: 'Continuar con Google', nocfg: 'El inicio de sesión de Google aún no está configurado en esta app. Tus datos quedan solo en este dispositivo.',
      as: 'Cuenta', last: 'Última copia', never: 'aún no', freq: 'Copia automática', f4: 'Cada 4 días', f7: 'Cada semana', f0: 'Desactivada',
      now: 'Hacer copia ahora', restore: 'Restaurar copia', out: 'Desconectar', del: 'Borrar copia de la nube',
      loading: 'Abriendo Google…', saving: 'Guardando copia…', saved: 'Copia guardada.', looking: 'Buscando copia…', restored: 'Copia restaurada.',
      none: 'Aún no hay copia en esta cuenta.', pending: 'Sin internet. Inténtalo al volver.',
      found: 'Encontramos una copia del {d} en esta cuenta. ¿Restaurarla? Se une a los datos de este dispositivo y no se borra nada.',
      found_keep: 'Si tocas Cancelar, se mantiene este dispositivo y la próxima copia reemplaza la de la nube.',
      restore_ask: '¿Restaurar la copia del {d}? Se une a los datos de este dispositivo y no se borra nada.',
      e_cancel: 'Inicio cancelado o bloqueado. Si Google mostró "origin_mismatch", añade la dirección de la app en Orígenes de JavaScript autorizados en Cloud Console.',
      e_pop: 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes para esta app y toca de nuevo.',
      e_api: 'La API de Google Drive no está activada en el proyecto. Actívala en Cloud Console > APIs y servicios > Biblioteca > Google Drive API.',
      e_scope: 'Faltó permitir el acceso a la copia de la app. Toca Continuar con Google y acepta.',
      e_net: 'Sin conexión con Google. Inténtalo de nuevo.', e_gen: 'No se pudo completar. Inténtalo de nuevo.',
      out_confirm: '¿Desconectar de Google? Tus gastos siguen en este dispositivo; solo se detiene la copia automática.',
      del_t: '¿Borrar copia de la nube?', del_b: 'Borra para siempre la copia guardada en tu cuenta de Google y desconecta la app. Los gastos de este dispositivo no se borran.',
      del_w: 'ELIMINAR', del_type: 'Para confirmar, escribe ELIMINAR o tu correo:', del_go: 'Borrar copia', del_retry: 'Reintentar', cancel: 'Cancelar'
    }
  };
  function B() { return window.ECBridge; }
  function lang() { var b = B(); var l = b && b.lang && b.lang(); return TX[l] ? l : 'pt'; }
  function T(k, v) { var t = TX[lang()][k] || TX.pt[k] || k; if (v) for (var x in v) t = t.split('{' + x + '}').join(v[x]); return t; }

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function configured() { return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(CFG.clientId); }
  function ss(v) { /* JSON estável (chaves ordenadas) */
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(ss).join(',') + ']';
    return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ':' + ss(v[k]); }).join(',') + '}';
  }
  function hash(s) { /* cyrb53 */
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, c;
    for (var i = 0; i < s.length; i++) { c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function newMeta() { return { v: 3, email: '', freq: 4, last: 0, hash: '', fileId: '' }; }
  function loadMeta() {
    try { localStorage.removeItem('ec-sync-v1'); localStorage.removeItem('ec-sync-v2'); } catch (e) {} /* restos de versões anteriores */
    try { var m = JSON.parse(localStorage.getItem(META_KEY)); if (m && m.v === 3) { if ([0, 4, 7].indexOf(+m.freq) < 0) m.freq = 4; return m; } } catch (e) {}
    return newMeta();
  }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
  function tokValid() { return !!tok && Date.now() < tokExp - 30000; }
  function friendly(e) {
    var m = String((e && (e.message || e.error)) || e || '');
    if (/popup_closed|access_denied|denied/i.test(m)) return T('e_cancel');
    if (/popup_failed/i.test(m)) return T('e_pop');
    if (/accessNotConfigured|has not been used|SERVICE_DISABLED/i.test(m)) return T('e_api');
    if (/insufficientPermissions|insufficient.*scope|ACCESS_TOKEN_SCOPE/i.test(m)) return T('e_scope');
    if (/failed to fetch|network|load failed|offline/i.test(m) || (e && e.name === 'TypeError')) return T('e_net');
    var d = m.replace(/\s+/g, ' ').trim().slice(0, 90); /* detalhe técnico para diagnóstico */
    return T('e_gen') + (d ? ' [' + d + ']' : '');
  }
  function rerender() { try { B() && B().renderAccount && B().renderAccount(); } catch (e) {} }
  function setMsg(k, t) { msg = { k: k, t: t || '' }; rerender(); }

  /* ---------- estado local -> itens e preferências ---------- */
  function collect() {
    var b = B(), S = b.S(), m = {};
    KINDS.forEach(function (k) {
      (S[k] || []).forEach(function (x) {
        if (!x || x.id == null) return;
        if (k === 'expenses' && b.isSeed(x)) return; /* exemplos do app não vão para a nuvem */
        m[k + '|' + x.id] = { kind: k, id: String(x.id), data: x, h: hash(ss(x)) };
      });
    });
    return m;
  }
  function prefsFrom(x) {
    x = x || {};
    return { salary: isFinite(x.salary) ? +x.salary : 0, va: isFinite(x.va) ? +x.va : 0, limit: isFinite(x.limit) ? +x.limit : 70,
      warn: isFinite(x.warn) ? +x.warn : 60, budgets: x.budgets && typeof x.budgets === 'object' ? x.budgets : {} };
  }
  function prefsNow() { return prefsFrom(B().S()); }
  function prefsDefault(p) { return !p.salary && !p.va && !Object.keys(p.budgets).length; }

  /* ---------- Google: token (Google Identity Services) ---------- */
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisP) return gisP;
    gisP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { gisP = null; rej(new Error('network')); };
      document.head.appendChild(s);
    });
    return gisP;
  }
  function ensureTc() {
    if (tc) return tc;
    tc = google.accounts.oauth2.initTokenClient({
      client_id: CFG.clientId, scope: CFG.scope,
      callback: function (r) {
        var w = waiting; waiting = null; if (!w) return;
        if (r && r.access_token) { tok = r.access_token; tokExp = Date.now() + (+r.expires_in || 3600) * 1000; w.res(); }
        else w.rej(new Error((r && (r.error || r.error_description)) || 'denied'));
      },
      error_callback: function (e) { var w = waiting; waiting = null; if (w) w.rej(new Error((e && e.type) || 'popup_closed')); }
    });
    return tc;
  }
  /* Chamar direto de um toque do usuário: o navegador só deixa abrir a janela do Google dentro de um gesto. */
  function requestToken(force) {
    return new Promise(function (res, rej) {
      if (force) { tok = null; tokExp = 0; }
      if (tokValid()) { res(); return; }
      function go() {
        try {
          ensureTc(); waiting = { res: res, rej: rej };
          var o = { prompt: force || !(meta && meta.email) ? 'select_account' : '' };
          if (!force && meta && meta.email) o.login_hint = meta.email;
          tc.requestAccessToken(o);
        } catch (e) { rej(e); }
      }
      if (window.google && google.accounts && google.accounts.oauth2) go(); else loadGis().then(go, rej);
    });
  }
  function token(interactive) {
    if (tokValid()) return Promise.resolve();
    if (!interactive) { armTap(); return Promise.reject(new Error('needtap')); }
    return requestToken();
  }
  /* sem token válido (app recém-aberto, passou 1h): na próxima tocada na tela, renova e sincroniza */
  function armTap() {
    if (tapArmed || !meta || !meta.email) return;
    tapArmed = true;
    var h = function () {
      document.removeEventListener('click', h, true); document.removeEventListener('touchend', h, true);
      tapArmed = false;
      if (!running) sync(true).catch(function () {});
    };
    document.addEventListener('click', h, true);
    document.addEventListener('touchend', h, { capture: true, passive: true });
  }

  /* ---------- Google Drive (pasta privada do app) ---------- */
  function api(url, opt, asText) {
    opt = opt || {}; opt.headers = Object.assign({ Authorization: 'Bearer ' + tok }, opt.headers || {});
    return fetch(url, opt).then(function (r) {
      if (r.ok) return r.status === 204 ? null : (asText ? r.text() : r.json());
      if (r.status === 401) { tok = null; tokExp = 0; throw new Error('needtap'); }
      return r.text().then(function (t) { var e = new Error('http ' + r.status + ' ' + t.replace(/\s+/g, ' ').slice(0, 220)); e.status = r.status; throw e; });
    });
  }
  var DRIVE = 'https://www.googleapis.com/drive/v3/files';
  function findFile(name) {
    return api(DRIVE + '?spaces=appDataFolder&orderBy=' + encodeURIComponent('modifiedTime desc') + '&q=' + encodeURIComponent("name='" + name + "'") +
      '&fields=' + encodeURIComponent('files(id,modifiedTime)')).then(function (j) { return (j.files && j.files[0]) || null; });
  }
  function legacyOf(p) { /* backup antigo do app: { state: { expenses:[], recurring:[], ... } } */
    var items = {}, st = p && p.state;
    if (!st || typeof st !== 'object') return null;
    var seed = function (x) { return !!st.sample && /^s\d+$/.test(String(x && x.id)); };
    KINDS.forEach(function (k) {
      (Array.isArray(st[k]) ? st[k] : []).forEach(function (x) {
        if (!x || x.id == null || (k === 'expenses' && seed(x))) return;
        items[k + '|' + x.id] = { kind: k, id: String(x.id), data: x };
      });
    });
    return { items: items, prefs: prefsFrom(st) };
  }
  /* procura o backup: o novo; se não houver, o antigo do app. Devolve { items, prefs, ts } ou null */
  async function findBackup() {
    var f = null;
    if (meta.fileId) {
      try { var q = await api(DRIVE + '/' + meta.fileId + '?alt=media'); if (q && q.items) return pack(q); }
      catch (e) { if (e.status !== 404) throw e; meta.fileId = ''; }
    }
    f = await findFile(CFG.file);
    if (f) { meta.fileId = f.id; var p = await api(DRIVE + '/' + f.id + '?alt=media'); if (p && p.items) return pack(p, f.modifiedTime); }
    var lf = await findFile(CFG.legacy);
    if (lf) { var o = legacyOf(await api(DRIVE + '/' + lf.id + '?alt=media')); if (o && Object.keys(o.items).length) { o.ts = Date.parse(lf.modifiedTime) || 0; return o; } }
    return null;
  }
  function pack(p, mt) { return { items: (p.items && typeof p.items === 'object') ? p.items : {}, prefs: p.prefs || null, ts: +p.ts || Date.parse(mt) || 0 }; }
  async function upload(payload) {
    var body = JSON.stringify(payload);
    if (meta.fileId) {
      try { await api('https://www.googleapis.com/upload/drive/v3/files/' + meta.fileId + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body }); return; }
      catch (e) { if (e.status !== 404) throw e; meta.fileId = ''; }
    }
    var bd = 'ecb' + Date.now().toString(36);
    var mp = '--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: CFG.file, parents: ['appDataFolder'] }) +
      '\r\n--' + bd + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + bd + '--';
    var j = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body: mp });
    meta.fileId = j.id;
  }

  /* ---------- backup e restauração ---------- */
  function snapshot() {
    var cur = collect(), items = {};
    Object.keys(cur).forEach(function (k) { items[k] = { kind: cur[k].kind, id: cur[k].id, data: cur[k].data }; });
    var prefs = prefsNow();
    return { items: items, prefs: prefs, h: hash(ss({ i: items, p: prefs })) };
  }
  function dirty() { return snapshot().h !== meta.hash; }
  function dueNow() {
    return !!meta && !!meta.email && meta.freq > 0 && Date.now() - (meta.last || 0) >= meta.freq * 86400000 && dirty();
  }
  async function doBackup() { /* o token já precisa estar válido */
    var sn = snapshot();
    await upload({ v: 3, ts: Date.now(), items: sn.items, prefs: sn.prefs });
    meta.hash = sn.h; meta.last = Date.now(); saveMeta();
  }
  function applyRestore(bk) { /* junta: só entra o que falta neste aparelho; nada é apagado */
    var b = B(), S = b.S(), n = 0;
    if (Object.keys(bk.items).length && S.sample && !b.hasUserData()) { b.dropSeed(); S = b.S(); }
    var have = {}; Object.keys(collect()).forEach(function (k) { have[k] = 1; });
    Object.keys(bk.items).forEach(function (key) {
      var r = bk.items[key], p = key.indexOf('|'), kind = key.slice(0, p), id = key.slice(p + 1), arr = S[kind];
      if (!Array.isArray(arr) || have[key] || !r || !r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return;
      r.data.id = id; arr.push(r.data); n++;
    });
    var prefsCh = false;
    if (bk.prefs && prefsDefault(prefsNow())) { b.applyPrefs(prefsFrom(bk.prefs)); prefsCh = true; }
    b.normalize(); b.persist(); b.afterMerge(prefsCh ? prefsNow() : null); b.renderSt();
    return n;
  }
  function when(ts) { return ts ? stamp(ts) : '—'; }

  /* ---------- ações (cada uma roda dentro de um toque do usuário) ---------- */
  function guard(fn) {
    if (running) return running;
    if (navigator.onLine === false) { setMsg('err', T('pending')); return Promise.resolve(false); }
    running = (async function () { return fn(); })().catch(function (e) {
      if (e && e.message === 'needtap') { armTap(); return false; }
      setMsg('err', friendly(e)); return false;
    }).finally(function () { running = null; });
    return running;
  }
  function backupNow() {
    return guard(async function () {
      setMsg('', T('saving'));
      await requestToken(); await doBackup();
      setMsg('ok', T('saved')); return true;
    });
  }
  function restoreNow() {
    return guard(async function () {
      setMsg('', T('looking'));
      await requestToken();
      var bk = await findBackup();
      if (!bk) { setMsg('', T('none')); return false; }
      if (!confirm(T('restore_ask', { d: when(bk.ts) }))) { setMsg('', ''); return false; }
      applyRestore(bk); meta.hash = ''; saveMeta(); /* o que veio do backup passa a contar como "ainda não salvo" até o próximo backup */
      setMsg('ok', T('restored')); return true;
    });
  }
  async function signInGoogle(force) {
    sheetClose();
    setMsg('', T('loading'));
    try {
      await requestToken(!!force);
      var u = await api('https://www.googleapis.com/oauth2/v3/userinfo');
      var em = String((u && u.email) || '').toLowerCase();
      if (!em) throw new Error('sem e-mail');
      if (meta.email !== em) { meta.email = em; meta.last = 0; meta.hash = ''; meta.fileId = ''; }
      saveMeta();
      setMsg('', T('looking'));
      var bk = await findBackup();
      if (bk) {
        var has = B().hasUserData(), q = T('found', { d: when(bk.ts) }) + (has ? '\n\n' + T('found_keep') : '');
        if (confirm(q)) { applyRestore(bk); meta.hash = ''; saveMeta(); setMsg('ok', T('restored')); return; }
      }
      setMsg('', T('saving'));
      await doBackup();
      setMsg('ok', T('saved'));
    } catch (e) { setMsg('err', friendly(e)); }
  }
  function disconnect() {
    if (!confirm(T('out_confirm'))) return;
    try { if (tok && window.google && google.accounts) google.accounts.oauth2.revoke(tok, function () {}); } catch (e) {}
    tok = null; tokExp = 0; meta = newMeta(); saveMeta(); msg = { k: '', t: '' }; rerender();
  }
  function delCloud() {
    var b = B();
    b.strongConfirm({
      title: T('del_t'), body: T('del_b'), word: T('del_w'), email: meta.email, typeLbl: T('del_type'), btn: T('del_go'), retry: T('del_retry'), cancel: T('cancel'),
      run: async function () {
        try {
          await requestToken();
          var names = [CFG.file, CFG.oldSync, CFG.legacy];
          for (var i = 0; i < names.length; i++) { var f = await findFile(names[i]); if (f) await api(DRIVE + '/' + f.id, { method: 'DELETE' }); }
        } catch (e) { throw new Error(friendly(e)); }
        try { if (tok && window.google && google.accounts) google.accounts.oauth2.revoke(tok, function () {}); } catch (e) {}
        tok = null; tokExp = 0; meta = newMeta(); saveMeta(); msg = { k: '', t: '' }; rerender();
      }
    });
  }
  function setFreq(n) { n = +n; if ([0, 4, 7].indexOf(n) < 0) return; meta.freq = n; saveMeta(); sheetClose(); rerender(); tick(); }

  /* ---------- backup automático ---------- */
  /* Na hora do backup o acesso do Google pode ter vencido (dura ~1h). Aí espera o próximo toque na tela
     (a janela do Google só abre dentro de um gesto) e salva em seguida. Sem toque = sem incômodo. */
  function armTap() {
    if (tapArmed || !meta || !meta.email) return;
    tapArmed = true;
    var h = function () {
      document.removeEventListener('click', h, true); document.removeEventListener('touchend', h, true);
      tapArmed = false;
      if (dueNow() && !running) guard(async function () { await requestToken(); await doBackup(); rerender(); return true; });
    };
    document.addEventListener('click', h, true);
    document.addEventListener('touchend', h, { capture: true, passive: true });
  }
  function tick() {
    if (!dueNow() || running) return;
    if (navigator.onLine === false) return;
    if (tokValid()) guard(async function () { await doBackup(); rerender(); return true; });
    else armTap();
  }

  /* ---------- tela (cartão #ecCloud na aba Conta) ---------- */
  function stamp(ms) { try { return new Date(ms).toLocaleString(B().locale(), { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return new Date(ms).toLocaleString(); } }
  var GSVG = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  /* janelas que sobem de baixo (as mesmas do resto do app) */
  function sheetOk() { var b = B(); return !!(b && b.openSheet && b.sheetHead); }
  function sheet(html) { if (sheetOk()) B().openSheet(html); }
  function sheetClose() { var b = B(); if (b && b.closeSheet) b.closeSheet(); }
  var GO = '<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  function row(act, title, sub, extra) {
    return '<button class="set-row" type="button" ' + act + (extra && extra.danger ? ' style="color:var(--bad)"' : '') + '><span class="set-t"><span>' + esc(title) + '</span>' +
      (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + (extra && extra.check ? '<span style="margin-left:auto;color:var(--accent);font-size:20px;line-height:1" aria-hidden="true">✓</span>' : (extra && extra.nogo ? '' : GO)) + '</button>';
  }
  function freqName() { return T(meta && meta.freq === 7 ? 'f7' : meta && meta.freq === 0 ? 'f0' : 'f4'); }
  function loginSheet() {
    if (!sheetOk()) { signInGoogle(); return; }
    sheet(B().sheetHead(T('login_t')) +
      '<div style="padding:2px 2px 6px"><p class="sub" style="margin:4px 0 18px">' + esc(T('login_s')) + '</p>' +
      '<button class="btn" type="button" data-ecact="google" style="width:100%;height:52px;border-radius:999px;background:var(--surface2);border:1px solid var(--line);color:var(--ink);box-shadow:none;display:flex;align-items:center;justify-content:center;gap:12px;font-weight:700">' +
      GSVG + '<span>' + esc(T('google')) + '</span></button>' +
      '<p class="note" style="margin:16px 2px 0;text-align:center">' + esc(T('login_n')) + '</p>' +
      '<p class="note legal-links" style="margin:10px 0 4px"><a href="privacy.html">' + esc(T('priv')) + '</a> · <a href="terms.html">' + esc(T('terms')) + '</a></p></div>');
  }
  function accountSheet() {
    sheet(B().sheetHead(T('acc_t')) +
      '<p class="sub" style="margin:4px 0 16px">' + esc(meta.email) + '</p>' +
      '<div class="btns"><button class="btn" type="button" data-ecact="switch">' + esc(T('switch')) + '</button></div>' +
      '<div class="btns" style="margin-top:10px"><button class="btn ghost" type="button" data-ecact="out">' + esc(T('out')) + '</button></div>');
  }
  function freqSheet() {
    sheet(B().sheetHead(T('auto_t')) + '<div class="set-list" style="margin-top:8px">' +
      [[4, 'f4'], [7, 'f7'], [0, 'f0']].map(function (o) { return row('data-ecfreq="' + o[0] + '"', T(o[1]), '', { check: +meta.freq === o[0], nogo: true }); }).join('') + '</div>');
  }
  function render() {
    var el = document.getElementById('ecCloud'); if (!el) return;
    var m = msg.t ? '<p class="g-msg" role="status" style="margin:12px 2px 0;' + (msg.k === 'err' ? 'color:var(--bad);font-weight:600' : '') + '">' + esc(msg.t) + '</p>' : '';
    if (!configured()) { el.innerHTML = '<p class="sub">' + esc(T('nocfg')) + '</p>'; return; }
    var on = !!(meta && meta.email);
    var h = '<p class="sub" style="margin:2px 2px 14px">' + esc(T('desc')) + '</p>' +
      '<p class="sub" style="margin:0 2px 14px;color:var(--ink);font-weight:600">' + esc(T('last')) + ': ' + esc(on && meta.last ? stamp(meta.last) : T('never')) + '</p>' +
      '<div class="btns"><button class="btn" type="button" data-ecact="now">' + esc(T('now')) + '</button></div>' + m +
      '<div class="set-list" style="margin-top:18px">' +
      row('data-ecact="account"', T('acc_t'), on ? meta.email : T('noacc')) +
      row('data-ecact="freq"', T('auto_t'), on ? freqName() : T('f0')) + '</div>';
    if (on) {
      h += '<div class="set-list" style="margin-top:12px">' + row('data-ecact="restore"', T('restore'), '') +
        row('data-ecact="del"', T('del'), '', { danger: true, nogo: true }) + '</div>';
    }
    el.innerHTML = h;
  }
  function wireUi() {
    document.addEventListener('click', function (ev) {
      var f = ev.target.closest && ev.target.closest('[data-ecfreq]');
      if (f) { setFreq(f.getAttribute('data-ecfreq')); return; }
      var t = ev.target.closest && ev.target.closest('[data-ecact]'); if (!t) return;
      var a = t.getAttribute('data-ecact'), on = !!(meta && meta.email);
      if (a === 'google') signInGoogle(false);
      else if (a === 'switch') signInGoogle(true);
      else if (a === 'now') { if (on) backupNow(); else loginSheet(); }
      else if (a === 'account') { if (on) accountSheet(); else loginSheet(); }
      else if (a === 'freq') { if (on) freqSheet(); else loginSheet(); }
      else if (a === 'restore') restoreNow();
      else if (a === 'out') { sheetClose(); disconnect(); }
      else if (a === 'del') delCloud();
    });
  }

  /* ---------- API usada pelo index.html ---------- */
  window.ECSync = {
    schedule: function () { if (!meta || !meta.email) return; clearTimeout(timer); timer = setTimeout(tick, 2500); },
    summary: function () { return meta && meta.email ? meta.email : ''; },
    lastSync: function () { return meta && meta.last ? meta.last : 0; },
    render: render,
    sync: function () { tick(); return Promise.resolve(); }
  };

  function init() {
    if (started) return; started = true;
    meta = loadMeta(); wireUi(); render();
    if (!configured()) return;
    loadGis().catch(function () {}); /* já carrega: a janela do Google só abre dentro do toque, sem esperar download */
    tick();
  }
  window.addEventListener('online', function () { tick(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  meta = loadMeta();
  setTimeout(init, 1200); /* depois do boot do app */
})();
