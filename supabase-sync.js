/* Expense Control — sincronização na nuvem (Supabase).
 * Só usa a ponte window.ECBridge do index.html. Dados: tabelas ec_items / ec_prefs (RLS: cada usuário só vê o que é seu).
 * Sem fotos, sem Storage. Fila offline: tudo o que mudou fica pendente (hash por item) e vai quando a internet voltar.
 * Conflito: se o mesmo item mudou nos dois lados, vale o deste aparelho (e ele é reenviado). */
(function () {
  'use strict';

  /* ===== PREENCHA (valores públicos: Project URL e anon/publishable key — NUNCA a service_role) ===== */
  var CFG = {
    url: 'https://irnlbwvijmapwjkgyunf.supabase.co',
    key: 'sb_publishable_VWYVqAlQTb9qkxxMOED1GQ_RMp5mOON', /* chave pública (publishable) */
    lib: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js' /* versão fixa; veja o README para hospedar local */
  };

  var META_KEY = 'ec-sync-v1';           /* casa com o padrão ec- que "Apagar tudo deste aparelho" já limpa */
  var KINDS = ['expenses', 'recurring', 'inst', 'incomes', 'goals'];
  var client = null, session = null, meta = null, running = null, libP = null;
  var msg = { k: '', t: '' }, timer = null, lastTry = 0, started = false;

  /* ---------- textos ---------- */
  var TX = {
    pt: {
      title: 'Conta na nuvem', sub: 'Entre para guardar e usar seus gastos em outros aparelhos. Sem conta, tudo fica só neste aparelho.',
      nocfg: 'A nuvem ainda não está configurada neste app. Seus dados ficam só neste aparelho.',
      email: 'E-mail', pass: 'Senha (mín. 8 caracteres)', signin: 'Entrar', signup: 'Criar conta', loading: 'Carregando…',
      as: 'Conectado como', last: 'Última sincronização', never: 'ainda não', now: 'Sincronizar agora', out: 'Sair', del: 'Excluir conta e dados da nuvem',
      syncing: 'Sincronizando…', synced: 'Sincronizado.', pending: 'Sem internet: as mudanças ficam guardadas e vão quando voltar.',
      confirm_mail: 'Conta criada. Abra o e-mail de confirmação e depois entre.',
      e_cred: 'E-mail ou senha incorretos.', e_exists: 'Esse e-mail já tem conta. Use "Entrar".', e_net: 'Sem conexão com a nuvem. Tente de novo.',
      e_rate: 'Muitas tentativas. Aguarde um pouco.', e_gen: 'Não foi possível concluir. Tente de novo.', e_fill: 'Preencha e-mail e senha (mín. 8 caracteres).',
      out_confirm: 'Sair desta conta? Os dados continuam na nuvem e serão removidos deste aparelho.',
      out_unsynced: 'Não deu para sincronizar agora. Sair mesmo assim apaga mudanças ainda não enviadas. Continuar?',
      del_t: 'Excluir conta e dados?', del_b: 'Apaga para sempre a conta e todos os gastos, metas e preferências guardados na nuvem, e limpa este aparelho. Não dá para desfazer.',
      del_w: 'EXCLUIR', del_type: 'Para confirmar, digite EXCLUIR ou o seu e-mail:', del_go: 'Excluir tudo', del_retry: 'Tentar novamente', cancel: 'Cancelar'
    },
    en: {
      title: 'Cloud account', sub: 'Sign in to keep your expenses and use them on other devices. Without an account, everything stays on this device.',
      nocfg: 'Cloud sync is not set up in this app yet. Your data stays only on this device.',
      email: 'Email', pass: 'Password (min. 8 characters)', signin: 'Sign in', signup: 'Create account', loading: 'Loading…',
      as: 'Signed in as', last: 'Last sync', never: 'not yet', now: 'Sync now', out: 'Sign out', del: 'Delete account and cloud data',
      syncing: 'Syncing…', synced: 'Synced.', pending: 'Offline: changes are kept and will be sent when you are back online.',
      confirm_mail: 'Account created. Open the confirmation email, then sign in.',
      e_cred: 'Wrong email or password.', e_exists: 'This email already has an account. Use "Sign in".', e_net: 'No connection to the cloud. Try again.',
      e_rate: 'Too many attempts. Please wait a moment.', e_gen: 'Could not complete. Try again.', e_fill: 'Enter email and password (min. 8 characters).',
      out_confirm: 'Sign out? Your data stays in the cloud and will be removed from this device.',
      out_unsynced: 'Could not sync right now. Signing out anyway erases changes not yet sent. Continue?',
      del_t: 'Delete account and data?', del_b: 'Permanently deletes your account and all expenses, goals and preferences stored in the cloud, and clears this device. This cannot be undone.',
      del_w: 'DELETE', del_type: 'To confirm, type DELETE or your email:', del_go: 'Delete everything', del_retry: 'Try again', cancel: 'Cancel'
    },
    es: {
      title: 'Cuenta en la nube', sub: 'Inicia sesión para guardar tus gastos y usarlos en otros dispositivos. Sin cuenta, todo queda solo en este dispositivo.',
      nocfg: 'La nube aún no está configurada en esta app. Tus datos quedan solo en este dispositivo.',
      email: 'Correo', pass: 'Contraseña (mín. 8 caracteres)', signin: 'Entrar', signup: 'Crear cuenta', loading: 'Cargando…',
      as: 'Conectado como', last: 'Última sincronización', never: 'aún no', now: 'Sincronizar ahora', out: 'Salir', del: 'Eliminar cuenta y datos de la nube',
      syncing: 'Sincronizando…', synced: 'Sincronizado.', pending: 'Sin internet: los cambios se guardan y se envían al volver.',
      confirm_mail: 'Cuenta creada. Abre el correo de confirmación y luego entra.',
      e_cred: 'Correo o contraseña incorrectos.', e_exists: 'Ese correo ya tiene cuenta. Usa "Entrar".', e_net: 'Sin conexión con la nube. Inténtalo de nuevo.',
      e_rate: 'Demasiados intentos. Espera un momento.', e_gen: 'No se pudo completar. Inténtalo de nuevo.', e_fill: 'Escribe correo y contraseña (mín. 8 caracteres).',
      out_confirm: '¿Salir de esta cuenta? Los datos siguen en la nube y se quitarán de este dispositivo.',
      out_unsynced: 'No se pudo sincronizar ahora. Salir igual borra los cambios aún no enviados. ¿Continuar?',
      del_t: '¿Eliminar cuenta y datos?', del_b: 'Borra para siempre la cuenta y todos los gastos, metas y preferencias guardados en la nube, y limpia este dispositivo. No se puede deshacer.',
      del_w: 'ELIMINAR', del_type: 'Para confirmar, escribe ELIMINAR o tu correo:', del_go: 'Eliminar todo', del_retry: 'Reintentar', cancel: 'Cancelar'
    }
  };
  function lang() { var b = B(); var l = b && b.lang && b.lang(); return TX[l] ? l : 'pt'; }
  function T(k) { return TX[lang()][k] || TX.pt[k] || k; }

  /* ---------- utilidades ---------- */
  function B() { return window.ECBridge; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function configured() { return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(CFG.url) && CFG.key.length > 20; }
  function ss(v) { /* JSON estável (chaves ordenadas): o jsonb do Postgres reordena chaves */
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
  function tsKey(t) { return String(t || '').replace(/(\.\d+)/, function (m) { return (m + '000000').slice(0, 7); }); } /* fração com 6 dígitos p/ comparar texto */
  function newMeta() { return { v: 1, uid: '', cursor: '', items: {}, last: 0 }; }
  function loadMeta() {
    try { var m = JSON.parse(localStorage.getItem(META_KEY)); if (m && m.v === 1 && m.items && typeof m.items === 'object') return m; } catch (e) {}
    return newMeta();
  }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
  function friendly(e) {
    var m = String((e && (e.message || e.error_description)) || e || '');
    if (/invalid login|invalid credentials/i.test(m)) return T('e_cred');
    if (/already (been )?registered|already exists/i.test(m)) return T('e_exists');
    if (/failed to fetch|network|load failed|offline/i.test(m)) return T('e_net');
    if (/rate limit|too many|over_.*limit/i.test(m)) return T('e_rate');
    return T('e_gen');
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

  /* ---------- biblioteca e cliente ---------- */
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    if (libP) return libP;
    libP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = CFG.lib; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { res(); };
      s.onerror = function () { libP = null; rej(new Error('network')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  function ensure() {
    if (client) return Promise.resolve(client);
    if (!configured()) return Promise.reject(new Error('not configured'));
    return loadLib().then(function () {
      client = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      client.auth.onAuthStateChange(function (ev, s) { /* sem await aqui dentro (evita travar a biblioteca) */
        session = s || null;
        setTimeout(rerender, 0);
      });
      return client;
    });
  }

  /* ---------- sincronização ---------- */
  async function pull() {
    var b = B(), rows = [], page = 0, from = meta.cursor || '1970-01-01T00:00:00Z', maxTs = meta.cursor || '';
    for (;;) {
      var r = await client.from('ec_items').select('kind,id,data,deleted,updated_at').gte('updated_at', from)
        .order('updated_at', { ascending: true }).order('id', { ascending: true }).range(page * 1000, page * 1000 + 999);
      if (r.error) throw r.error;
      rows = rows.concat(r.data || []);
      if (!r.data || r.data.length < 1000) break;
      page++;
    }
    var S = b.S(), cur = collect(), touched = [], changed = false;
    if (rows.some(function (x) { return !x.deleted; }) && S.sample && !b.hasUserData()) { b.dropSeed(); cur = collect(); changed = true; }
    rows.forEach(function (r) {
      if (tsKey(r.updated_at) > tsKey(maxTs)) maxTs = r.updated_at;
      var arr = S[r.kind]; if (!Array.isArray(arr)) return;
      var key = r.kind + '|' + r.id, loc = cur[key], mh = meta.items[key];
      if (r.deleted) {
        if (loc && mh !== undefined && loc.h === mh) { /* sem mudança local: aplica a exclusão */
          for (var i = arr.length - 1; i >= 0; i--) if (String(arr[i].id) === r.id) arr.splice(i, 1);
          delete meta.items[key]; touched.push(key); changed = true;
        } else if (!loc) { delete meta.items[key]; }
        return; /* se houve mudança local depois, o local vence e será reenviado */
      }
      var d = r.data; if (!d || typeof d !== 'object' || Array.isArray(d)) return; d.id = r.id;
      if (loc) {
        if (mh === undefined) { if (hash(ss(d)) === loc.h) meta.items[key] = loc.h; return; } /* 1º contato: igual = ok; diferente = local vence */
        if (loc.h !== mh) return;                                                            /* mudou aqui: local vence */
        if (hash(ss(d)) === loc.h) return;                                                   /* nada novo */
        for (var j = 0; j < arr.length; j++) if (String(arr[j].id) === r.id) { arr[j] = d; break; }
        touched.push(key); changed = true;
      } else {
        if (mh !== undefined) return;                                                        /* apagado aqui e ainda não enviado */
        arr.push(d); touched.push(key); changed = true;
      }
    });
    if (changed) {
      b.normalize(); b.persist();
      var after = collect();
      touched.forEach(function (k) { if (after[k]) meta.items[k] = after[k].h; else delete meta.items[k]; });
    }
    var prefsChanged = false;
    var pr = await client.from('ec_prefs').select('data,updated_at').maybeSingle();
    if (pr.error) throw pr.error;
    if (pr.data && pr.data.data && typeof pr.data.data === 'object') {
      var local = prefsNow(), lh = hash(ss(local)), remote = prefsFrom(pr.data.data), rh = hash(ss(remote)), apply = false;
      if (meta.prefs === undefined) { if (rh === lh) meta.prefs = lh; else apply = prefsDefault(local); }
      else if (meta.prefs === lh && rh !== lh) apply = true;
      if (apply) { b.applyPrefs(remote); b.persist(); meta.prefs = hash(ss(prefsNow())); prefsChanged = true; changed = true; }
    }
    if (maxTs) meta.cursor = maxTs;
    saveMeta();
    return { changed: changed, prefs: prefsChanged };
  }

  async function push() {
    var cur = collect(), uid = session.user.id, ops = [];
    Object.keys(cur).forEach(function (k) {
      if (meta.items[k] !== cur[k].h) ops.push({ key: k, h: cur[k].h, row: { user_id: uid, kind: cur[k].kind, id: cur[k].id, data: cur[k].data, deleted: false } });
    });
    Object.keys(meta.items).forEach(function (k) {
      if (!cur[k]) { var p = k.split('|'); ops.push({ key: k, del: true, row: { user_id: uid, kind: p[0], id: p.slice(1).join('|'), data: {}, deleted: true } }); }
    });
    for (var i = 0; i < ops.length; i += 200) {
      var chunk = ops.slice(i, i + 200);
      var r = await client.from('ec_items').upsert(chunk.map(function (o) { return o.row; }), { onConflict: 'user_id,kind,id' });
      if (r.error) throw r.error;
      chunk.forEach(function (o) { if (o.del) delete meta.items[o.key]; else meta.items[o.key] = o.h; });
      saveMeta();
    }
    var p = prefsNow(), ph = hash(ss(p));
    if (meta.prefs !== ph) {
      var rp = await client.from('ec_prefs').upsert({ user_id: uid, data: p }, { onConflict: 'user_id' });
      if (rp.error) throw rp.error;
      meta.prefs = ph; saveMeta();
    }
  }

  function sync() {
    if (running) return running;
    if (!client || !session) return Promise.resolve(false);
    if (navigator.onLine === false) { setMsg('', T('pending')); return Promise.reject(new Error('offline')); }
    lastTry = Date.now();
    running = (async function () {
      var res = await pull();
      await push();
      meta.last = Date.now(); saveMeta();
      if (res.changed) { var b = B(); b.afterMerge(res.prefs ? prefsNow() : null); b.renderSt(); }
      msg = { k: 'ok', t: T('synced') };
      rerender();
      return true;
    })().catch(function (e) { msg = { k: 'err', t: friendly(e) }; rerender(); throw e; })
      .finally(function () { running = null; });
    return running;
  }
  function syncQuiet() { return sync().catch(function () {}); }

  /* ---------- ações de conta ---------- */
  async function afterSignedIn() {
    var uid = session.user.id;
    if (meta.uid && meta.uid !== uid) { B().reset(); meta = newMeta(); } /* outra conta neste aparelho: limpa os dados da anterior */
    meta.uid = uid; saveMeta();
    await syncQuiet();
  }
  function creds() {
    var el = document.getElementById('ecCloud');
    var e = el && el.querySelector('#ecEmail'), p = el && el.querySelector('#ecPass');
    var em = e ? e.value.trim() : '', pw = p ? p.value : '';
    if (!/^\S+@\S+\.\S+$/.test(em) || pw.length < 8) { setMsg('err', T('e_fill')); return null; }
    return { email: em, password: pw };
  }
  async function signIn() {
    var c = creds(); if (!c) return;
    setMsg('', T('loading'));
    try {
      await ensure();
      var r = await client.auth.signInWithPassword(c);
      if (r.error) throw r.error;
      session = r.data.session; msg = { k: '', t: '' };
      await afterSignedIn(); rerender();
    } catch (e) { setMsg('err', friendly(e)); }
  }
  async function signUp() {
    var c = creds(); if (!c) return;
    setMsg('', T('loading'));
    try {
      await ensure();
      var r = await client.auth.signUp(c);
      if (r.error) throw r.error;
      if (r.data && r.data.session) { session = r.data.session; msg = { k: '', t: '' }; await afterSignedIn(); rerender(); }
      else setMsg('ok', T('confirm_mail'));
    } catch (e) { setMsg('err', friendly(e)); }
  }
  async function signOut() {
    if (!confirm(T('out_confirm'))) return;
    setMsg('', T('syncing'));
    try { await sync(); }
    catch (e) { if (!confirm(T('out_unsynced'))) { setMsg('err', friendly(e)); return; } }
    try { await client.auth.signOut(); } catch (e) {}
    session = null; meta = newMeta(); saveMeta(); msg = { k: '', t: '' };
    B().reset(); rerender();
  }
  function delAccount() {
    var b = B(), em = session && session.user && session.user.email;
    b.strongConfirm({
      title: T('del_t'), body: T('del_b'), word: T('del_w'), email: em, typeLbl: T('del_type'), btn: T('del_go'), retry: T('del_retry'), cancel: T('cancel'),
      run: async function () {
        var r = await client.rpc('ec_delete_account');
        if (r.error) throw new Error(friendly(r.error));
        try { await client.auth.signOut(); } catch (e) {}
        session = null; meta = newMeta(); saveMeta(); msg = { k: '', t: '' };
        b.reset(); rerender();
      }
    });
  }

  /* ---------- tela (cartão #ecCloud na aba Conta) ---------- */
  function stamp(ms) { try { return new Date(ms).toLocaleString(B().locale(), { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return new Date(ms).toLocaleString(); } }
  function render() {
    var el = document.getElementById('ecCloud'); if (!el) return;
    var keepE = el.querySelector('#ecEmail'), keepP = el.querySelector('#ecPass');
    var ev = keepE ? keepE.value : '', pv = keepP ? keepP.value : '';
    var m = msg.t ? '<p class="g-msg" role="status"' + (msg.k === 'err' ? ' style="color:var(--bad);font-weight:600"' : '') + '>' + esc(msg.t) + '</p>' : '';
    var h = '<h3>' + esc(T('title')) + '</h3>';
    if (!configured()) {
      h += '<p class="sub">' + esc(T('nocfg')) + '</p>';
    } else if (session && session.user) {
      h += '<p class="sub">' + esc(T('as')) + ' <b>' + esc(session.user.email || '') + '</b></p>' +
        '<div class="rowline" style="margin-top:10px"><span class="sub">' + esc(T('last')) + '</span><b>' + esc(meta && meta.last ? stamp(meta.last) : T('never')) + '</b></div>' + m +
        '<div class="btns" style="margin-top:12px"><button class="btn" type="button" data-ecact="now">' + esc(T('now')) + '</button>' +
        '<button class="btn ghost" type="button" data-ecact="out">' + esc(T('out')) + '</button></div>' +
        '<div class="btns" style="margin-top:10px"><button class="btn ghost" type="button" data-ecact="del" style="color:var(--bad)">' + esc(T('del')) + '</button></div>';
    } else {
      h += '<p class="sub">' + esc(T('sub')) + '</p>' +
        '<div class="field" style="margin-top:12px"><label for="ecEmail">' + esc(T('email')) + '</label><input class="input" id="ecEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false"></div>' +
        '<div class="field" style="margin-top:10px"><label for="ecPass">' + esc(T('pass')) + '</label><input class="input" id="ecPass" type="password" autocomplete="current-password" minlength="8"></div>' + m +
        '<div class="btns" style="margin-top:12px"><button class="btn" type="button" data-ecact="in">' + esc(T('signin')) + '</button>' +
        '<button class="btn ghost" type="button" data-ecact="up">' + esc(T('signup')) + '</button></div>';
    }
    el.innerHTML = h;
    var e2 = el.querySelector('#ecEmail'), p2 = el.querySelector('#ecPass');
    if (e2) e2.value = ev; if (p2) p2.value = pv;
  }

  function wireUi() {
    var el = document.getElementById('ecCloud'); if (!el) return;
    el.addEventListener('click', function (ev) {
      var t = ev.target.closest && ev.target.closest('[data-ecact]'); if (!t) return;
      var a = t.getAttribute('data-ecact');
      if (a === 'in') signIn(); else if (a === 'up') signUp();
      else if (a === 'now') { setMsg('', T('syncing')); syncQuiet(); }
      else if (a === 'out') signOut(); else if (a === 'del') delAccount();
    });
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target && (ev.target.id === 'ecEmail' || ev.target.id === 'ecPass')) { ev.preventDefault(); signIn(); }
    });
  }

  /* ---------- API usada pelo index.html ---------- */
  window.ECSync = {
    schedule: function () { if (!session) return; clearTimeout(timer); timer = setTimeout(syncQuiet, 2500); },
    summary: function () { return session && session.user ? (session.user.email || '') : ''; },
    lastSync: function () { return meta && meta.last ? meta.last : 0; },
    render: render,
    sync: function () { return syncQuiet(); }
  };

  function hasStoredSession() {
    try { for (var i = 0; i < localStorage.length; i++) { if (/^sb-.*-auth-token$/.test(localStorage.key(i))) return true; } } catch (e) {}
    return false;
  }
  function init() {
    if (started) return; started = true;
    meta = loadMeta(); wireUi(); render();
    if (!configured() || !hasStoredSession()) return;
    ensure().then(function () { return client.auth.getSession(); }).then(function (r) {
      session = r && r.data ? r.data.session : null;
      if (session) { if (!meta.uid) { meta.uid = session.user.id; saveMeta(); } rerender(); syncQuiet(); }
    }).catch(function () {});
  }
  window.addEventListener('online', function () { if (session) syncQuiet(); });
  document.addEventListener('visibilitychange', function () {
    if (!session) return;
    if (document.hidden) { clearTimeout(timer); syncQuiet(); }
    else if (Date.now() - lastTry > 30000) syncQuiet();
  });
  meta = loadMeta();
  setTimeout(init, 1200); /* depois do boot do app */
})();
