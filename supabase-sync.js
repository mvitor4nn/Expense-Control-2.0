/* Expense Control - sincronização Supabase v3 (login + banco). Sem fotos nem comprovantes.
   - Só a anon key PÚBLICA vai em CFG.key. NUNCA coloque a service_role aqui.
   - Sem URL/KEY configuradas o app continua 100% local (nada é enviado).
   - Conflitos: por item, vence o updated_at (hora da edição) mais novo.
   - Exclusões viajam como "tombstone" (deleted=true).
   - Comprovantes foram REMOVIDOS do app: o código só apaga, uma vez por conta, arquivos antigos do bucket "receipts".
   - Sem internet: as mudanças ficam numa fila salva no aparelho e são reenviadas sozinhas. */
(function(){
'use strict';
var CFG={url:'',key:''}; /* <- preencha: Project URL e anon/publishable key (Settings > API) */
var LIB=['vendor/supabase.js','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];
var T={expenses:'expenses',recurring:'recurring',inst:'installments',goals:'goals',incomes:'incomes'};
var BUCKET='receipts' /* só para LIMPEZA de arquivos antigos; nada é enviado */,KM='ec-sync-v1',PK=['salary','va','limit','warn','nick','budgets'];
var TX={
pt:{t:'Conta e nuvem',sub:'Entre para sincronizar seus gastos entre aparelhos.',g:'Continuar com Google',m:'Receber código por e-mail',em:'seu@email.com',code:'Código do e-mail',ver:'Entrar com o código',out:'Sair',now:'Sincronizar agora',
 ok:'Sincronizado',sent:'Enviamos um código para seu e-mail. Digite-o abaixo (o link do e-mail também funciona neste navegador).',err:'Falha ao sincronizar. Nova tentativa automática em breve.',off:'Nuvem não configurada neste app.',
 offline:'Sem internet. As alterações ficam salvas e serão enviadas quando a conexão voltar.',pend:'{n} alteração(ões) aguardando envio',syncing:'Sincronizando…',
 bad_email:'Digite um e-mail válido.',bad_code:'Digite o código recebido.',wait:'Aguarde {s}s para pedir outro código.',loading:'Carregando login…',nolib:'Não consegui carregar o login. Conecte-se à internet e tente de novo.',
 swc:'Este aparelho tem dados de OUTRA conta. Para proteger sua privacidade, vamos apagar os dados locais antes de entrar com esta conta. Os dados da outra conta continuam salvos na nuvem dela. Continuar?',
 outp:'Ainda há {n} alteração(ões) não enviadas e não foi possível enviá-las agora. Sair mesmo assim?',conf_t:'Atualizado de outro aparelho',conf:'{n} item(ns) tinham uma versão mais nova em outro aparelho.',
 as:'Conectado como',zone:'Zona de risco',del_btn:'Excluir minha conta',del_sub:'Apaga para sempre sua conta e os dados na nuvem. Não dá para desfazer.',
 del_t:'Excluir conta para sempre?',del_body:'Vamos apagar da nuvem sua conta, seus gastos, recorrentes, parcelas, metas, rendas, preferências e quaisquer arquivos antigos. Isso é permanente e não pode ser desfeito. Você precisa estar com internet.',
 del_word:'APAGAR',del_type:'Para confirmar, digite {w} ou o seu e-mail:',del_go:'Excluir para sempre',del_retry:'Tentar novamente',del_cancel:'Cancelar',
 del_files:'Apagando arquivos antigos…',del_acc:'Excluindo a conta…',del_err:'Não foi possível excluir a conta. Nada foi apagado neste aparelho. Verifique a conexão e tente de novo.',
 del_offline:'Sem internet. Conecte-se para excluir a conta; nada foi apagado.',del_nosess:'Você não está conectado.',
 del_local:'Sua conta foi excluída da nuvem. Apagar também os dados deste aparelho? (OK = apagar; Cancelar = manter aqui)',del_done_t:'Conta excluída',del_done:'Sua conta e os dados na nuvem foram apagados.'},
en:{t:'Account & cloud',sub:'Sign in to sync your spending across devices.',g:'Continue with Google',m:'Email me a code',em:'you@email.com',code:'Email code',ver:'Sign in with code',out:'Sign out',now:'Sync now',
 ok:'Synced',sent:'We emailed you a code. Type it below (the email link also works in this browser).',err:'Sync failed. It will retry automatically soon.',off:'Cloud is not configured in this app.',
 offline:'No internet. Changes are saved and will be sent when the connection returns.',pend:'{n} change(s) waiting to upload',syncing:'Syncing…',
 bad_email:'Enter a valid email.',bad_code:'Enter the code you received.',wait:'Wait {s}s before asking for another code.',loading:'Loading sign-in…',nolib:"Couldn't load sign-in. Connect to the internet and try again.",
 swc:'This device has data from a DIFFERENT account. To protect your privacy, local data will be erased before signing in with this account. The other account\'s data stays safe in its cloud. Continue?',
 outp:'{n} change(s) are not uploaded yet and could not be sent now. Sign out anyway?',conf_t:'Updated from another device',conf:'{n} item(s) had a newer version on another device.',
 as:'Signed in as',zone:'Danger zone',del_btn:'Delete my account',del_sub:'Permanently deletes your account and your cloud data. This cannot be undone.',
 del_t:'Delete account forever?',del_body:'We will erase from the cloud your account, expenses, recurring items, installments, goals, income, preferences and any old files. This is permanent and cannot be undone. You need to be online.',
 del_word:'DELETE',del_type:'To confirm, type {w} or your email:',del_go:'Delete forever',del_retry:'Try again',del_cancel:'Cancel',
 del_files:'Deleting old files…',del_acc:'Deleting the account…',del_err:"Couldn't delete the account. Nothing was erased on this device. Check your connection and try again.",
 del_offline:'No internet. Connect to delete the account; nothing was erased.',del_nosess:'You are not signed in.',
 del_local:'Your cloud account was deleted. Also erase the data on this device? (OK = erase; Cancel = keep here)',del_done_t:'Account deleted',del_done:'Your account and cloud data were erased.'},
es:{t:'Cuenta y nube',sub:'Entra para sincronizar tus gastos entre dispositivos.',g:'Continuar con Google',m:'Recibir código por correo',em:'tu@correo.com',code:'Código del correo',ver:'Entrar con el código',out:'Salir',now:'Sincronizar ahora',
 ok:'Sincronizado',sent:'Te enviamos un código por correo. Escríbelo abajo (el enlace del correo también funciona en este navegador).',err:'Error al sincronizar. Se reintentará automáticamente.',off:'La nube no está configurada en esta app.',
 offline:'Sin internet. Los cambios quedan guardados y se enviarán cuando vuelva la conexión.',pend:'{n} cambio(s) esperando envío',syncing:'Sincronizando…',
 bad_email:'Escribe un correo válido.',bad_code:'Escribe el código recibido.',wait:'Espera {s}s para pedir otro código.',loading:'Cargando inicio de sesión…',nolib:'No pude cargar el inicio de sesión. Conéctate a internet e inténtalo de nuevo.',
 swc:'Este dispositivo tiene datos de OTRA cuenta. Para proteger tu privacidad, borraremos los datos locales antes de entrar con esta cuenta. Los datos de la otra cuenta siguen guardados en su nube. ¿Continuar?',
 outp:'Aún hay {n} cambio(s) sin enviar y no se pudieron enviar ahora. ¿Salir de todos modos?',conf_t:'Actualizado desde otro dispositivo',conf:'{n} elemento(s) tenían una versión más nueva en otro dispositivo.',
 as:'Conectado como',zone:'Zona de riesgo',del_btn:'Eliminar mi cuenta',del_sub:'Borra para siempre tu cuenta y los datos en la nube. No se puede deshacer.',
 del_t:'¿Eliminar la cuenta para siempre?',del_body:'Borraremos de la nube tu cuenta, gastos, recurrentes, cuotas, metas, ingresos, preferencias y cualquier archivo antiguo. Es permanente y no se puede deshacer. Necesitas conexión a internet.',
 del_word:'BORRAR',del_type:'Para confirmar, escribe {w} o tu correo:',del_go:'Eliminar para siempre',del_retry:'Reintentar',del_cancel:'Cancelar',
 del_files:'Borrando archivos antiguos…',del_acc:'Eliminando la cuenta…',del_err:'No se pudo eliminar la cuenta. No se borró nada en este dispositivo. Revisa la conexión e inténtalo de nuevo.',
 del_offline:'Sin internet. Conéctate para eliminar la cuenta; no se borró nada.',del_nosess:'No has iniciado sesión.',
 del_local:'Tu cuenta en la nube fue eliminada. ¿Borrar también los datos de este dispositivo? (OK = borrar; Cancelar = mantener aquí)',del_done_t:'Cuenta eliminada',del_done:'Tu cuenta y los datos en la nube fueron borrados.'}};
var B=function(){return window.ECBridge};
function tx(k,v){var l=(B()&&B().lang()||'pt').slice(0,2),s=(TX[l]||TX.pt)[k]||TX.pt[k]||k;if(v)for(var x in v)s=s.split('{'+x+'}').join(v[x]);return s}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function configured(){return !!(CFG.url&&CFG.key)}

/* ---------- estado persistido (meta por item, exclusões, marca da limpeza legada) ---------- */
function blank(){return {v:1,owner:null,synced:false,legacy:false,cur:{},meta:{},tomb:{},prefs:null,last:0}}
var M=blank();
try{var _r=JSON.parse(localStorage.getItem(KM));if(_r&&_r.v===1){M=Object.assign(blank(),_r);delete M.rm}}catch(e){}
function saveM(){try{localStorage.setItem(KM,JSON.stringify(M))}catch(e){}}
function mt(k){return M.meta[k]||(M.meta[k]={})}
function tb(k){return M.tomb[k]||(M.tomb[k]={})}
function stable(o){if(o===null||typeof o!=='object')return JSON.stringify(o);if(Array.isArray(o))return '['+o.map(stable).join(',')+']';
  return '{'+Object.keys(o).sort().filter(function(k){return o[k]!==undefined}).map(function(k){return JSON.stringify(k)+':'+stable(o[k])}).join(',')+'}'}
function h32(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)+'.'+s.length.toString(36)}
/* campos de foto/comprovante nunca entram no hash nem vão para o banco (recurso removido) */
var DROP={photo:1,photoExp:1,photoPath:1};
function core(x){var c={};Object.keys(x).forEach(function(k){if(!DROP[k])c[k]=x[k]});return c}
function hashItem(x){return h32(stable(core(x)))}
function getPrefs(S){var o={};PK.forEach(function(k){o[k]=S[k]});return o}
function iso(ms){return new Date(ms).toISOString()}

/* ---------- detecta o que mudou localmente desde a última sincronização ---------- */
function skip(tk,x){return tk==='expenses'&&B().isSeed(x)}
function diff(){
  var S=B().S(),now=Date.now();
  for(var tk in T){
    var arr=S[tk]||[],m=mt(tk),t=tb(tk),seen={};
    arr.forEach(function(x){
      if(!x||x.id==null||skip(tk,x))return;
      var id=String(x.id),h=hashItem(x),c=m[id];seen[id]=1;
      if(t[id])delete t[id]; /* reapareceu (Desfazer): cancela a exclusão */
      if(!c)m[id]={h:h,u:now,d:1};
      else if(c.h!==h){c.h=h;c.u=now;c.d=1}
    });
    Object.keys(m).forEach(function(id){
      if(seen[id])return;
      t[id]={u:now};delete m[id];
    });
  }
  if(M.prefs){var ph=h32(stable(getPrefs(S)));if(M.prefs.h!==ph){M.prefs.h=ph;M.prefs.u=now;M.prefs.d=1}}
  saveM();
}
function pending(){diff();var n=0;for(var tk in T){var m=mt(tk);Object.keys(m).forEach(function(i){if(m[i].d)n++});n+=Object.keys(tb(tk)).length}
  if(M.prefs&&M.prefs.d)n++;return n}

/* ---------- limpeza legada: apaga, uma vez por conta, arquivos antigos do bucket "receipts" ---------- */
function noBucket(e){return !!e&&/not\s*found|does not exist|no such bucket/i.test(String(e.message||e.error||e))}
async function purgeLegacy(){
  if(M.legacy||!user)return;
  try{await removeAllFiles(user.id)}catch(e){if(!noBucket(e))throw e}
  M.legacy=true;saveM();
}

/* ---------- baixar e mesclar (por item, vence o updated_at mais novo) ---------- */
function sane(data,id){
  var x;try{x=JSON.parse(JSON.stringify(data||{}))}catch(e){x={}}
  if(typeof x!=='object'||Array.isArray(x))x={};
  x.id=String(id);delete x.photo;delete x.photoExp;delete x.photoPath; /* dados antigos da nuvem com foto são descartados */
  return x;
}
function mergeRows(tk,rows){
  var S=B().S(),arr=S[tk]=S[tk]||[],m=mt(tk),t=tb(tk),applied=[],conf=0,idx={};
  arr.forEach(function(x,i){if(x&&x.id!=null)idx[String(x.id)]=i});
  rows.forEach(function(r){
    var id=String(r.id),ru=Date.parse(r.updated_at)||0,i=idx[id],lm=m[id],lt=t[id];
    if(i!==undefined){
      var lu=lm?lm.u:0;
      if(ru>lu){
        if(lm&&lm.d)conf++;
        if(r.deleted){arr[i]=null;delete m[id]}
        else{arr[i]=sane(r.data,id);applied.push([id,ru])}
      }
    }else{
      if(lt&&lt.u>=ru)return;          /* apaguei aqui depois da versão do servidor: continua apagado */
      if(lt)delete t[id];
      if(r.deleted)return;
      arr.push(sane(r.data,id));idx[id]=arr.length-1;applied.push([id,ru]);
    }
  });
  S[tk]=arr.filter(function(x){return x});
  return {applied:applied,conf:conf};
}
async function fetchSince(tbl,since){
  var out=[],from=0,N=1000;
  for(;;){
    var q=sb.from(tbl).select('id,data,deleted,updated_at,synced_at').eq('user_id',user.id).order('synced_at',{ascending:true}).order('id',{ascending:true}).range(from,from+N-1);
    if(since)q=q.gte('synced_at',since);
    var r=await q;if(r.error)throw r.error;
    out=out.concat(r.data||[]);if(!r.data||r.data.length<N)break;from+=N;
  }
  return out;
}
async function pull(){
  var raw={},any=false,tk;
  for(tk in T){
    var c=M.cur[tk],since=c?iso(Date.parse(c)-60000):null;
    raw[tk]=await fetchSince(T[tk],since);
    if(raw[tk].some(function(r){return !r.deleted}))any=true;
  }
  var pr=await sb.from('profiles').select('prefs,updated_at').eq('user_id',user.id).maybeSingle();if(pr.error)throw pr.error;
  var S=B().S();
  if(!M.synced&&(any||pr.data)&&S.sample&&!B().hasUserData())B().dropSeed(); /* aparelho novo: some o exemplo, entra o real */
  var conf=0,changed=false,prefsChanged=false,apps={};
  for(tk in T){
    if(!raw[tk].length)continue;
    var res=mergeRows(tk,raw[tk]);conf+=res.conf;apps[tk]=res.applied;if(res.applied.length||res.conf)changed=true;
    var mx=raw[tk].reduce(function(a,r){return r.synced_at>a?r.synced_at:a},M.cur[tk]||'');M.cur[tk]=mx;
  }
  var rp=pr.data;
  if(rp){
    var ru=Date.parse(rp.updated_at)||0;
    if(!M.prefs||ru>M.prefs.u){B().applyPrefs(rp.prefs||{});prefsChanged=true;changed=true;M.prefs={h:null,u:ru,d:0}}
  }else if(!M.prefs){var has=B().hasUserData();M.prefs={h:null,u:has?Date.now():0,d:has?1:0}}
  if(changed){
    B().normalize();S=B().S();
    for(tk in apps){var by={};(S[tk]||[]).forEach(function(x){by[String(x.id)]=x});
      apps[tk].forEach(function(a){var it=by[a[0]],m=mt(tk);if(it)m[a[0]]={h:hashItem(it),u:a[1],d:0};else delete m[a[0]]})}
    B().persist();B().afterMerge(prefsChanged);
  }
  if(M.prefs)M.prefs.h=h32(stable(getPrefs(B().S())));
  saveM();
  if(conf)B().toast('info',tx('conf_t'),tx('conf',{n:conf}));
}

/* ---------- enviar ---------- */
async function push(){
  var S=B().S(),uid=user.id;
  for(var tk in T){
    var m=mt(tk),t=tb(tk),by={},rows=[],snap=[];
    (S[tk]||[]).forEach(function(x){if(x&&x.id!=null)by[String(x.id)]=x});
    Object.keys(m).forEach(function(id){if(m[id].d&&by[id]){rows.push({user_id:uid,id:id,data:core(by[id]),deleted:false,updated_at:iso(m[id].u)});snap.push([id,m[id].h,0])}});
    Object.keys(t).forEach(function(id){rows.push({user_id:uid,id:id,data:{},deleted:true,updated_at:iso(t[id].u)});snap.push([id,t[id].u,1])});
    for(var o=0;o<rows.length;o+=200){
      var r=await sb.from(T[tk]).upsert(rows.slice(o,o+200),{onConflict:'user_id,id'});if(r.error)throw r.error;
      snap.slice(o,o+200).forEach(function(s){
        if(s[2]){if(t[s[0]]&&t[s[0]].u===s[1])delete t[s[0]]}
        else if(m[s[0]]&&m[s[0]].h===s[1])m[s[0]].d=0;
      });
      saveM();
    }
  }
  if(M.prefs&&M.prefs.d){
    var ph=M.prefs.h,pr=await sb.from('profiles').upsert({user_id:uid,prefs:getPrefs(S),updated_at:iso(M.prefs.u)},{onConflict:'user_id'});if(pr.error)throw pr.error;
    if(M.prefs.h===ph)M.prefs.d=0;
  }
}

/* ---------- ciclo de sincronização, fila e nova tentativa ---------- */
var sb=null,user=null,deleting=false,busy=false,again=false,timer,dT,rt,fails=0,status='',prog='',msg='',libFail=false,gateFor=null,coolUntil=0,sentTo='',emailVal='',codeVal='',working=false;
async function run(first){
  if(!sb||!user||!B()||M.owner!==user.id||deleting)return;
  if(busy){again=true;return}
  clearTimeout(rt);
  if(navigator.onLine===false){status='offline';render();return}
  busy=true;again=false;status='syncing';render();
  try{
    diff();await pull();await push();
    try{await purgeLegacy()}catch(le){console.warn('limpeza legada adiada',le)} /* não derruba o sync; tenta de novo no próximo ciclo */
    M.synced=true;M.last=Date.now();fails=0;status='ok';saveM();
  }catch(e){
    console.error('sync',e);fails++;status=navigator.onLine===false?'offline':'err';
    var d=Math.min(300000,4000*Math.pow(2,Math.min(fails,7)))*(0.8+Math.random()*0.4);
    rt=setTimeout(function(){run(false)},d);
  }
  busy=false;render();if(B()){B().renderAccount();try{B().renderSt()}catch(x){}}
  if(again){again=false;schedule(800)}
}
/* o diff carimba a hora da EDIÇÃO (não a da reconexão): roda 300 ms depois de cada gravação, mesmo offline */
function schedule(ms){if(!user)return;clearTimeout(dT);dT=setTimeout(function(){try{diff()}catch(e){console.error(e)}},300);clearTimeout(timer);timer=setTimeout(function(){run(false)},ms||2500)}

/* ---------- login ---------- */
function redir(){return location.origin+location.pathname}
function wipe(){M=blank();saveM();B().reset()}
async function onUser(u){
  if(!u){user=null;gateFor=null;render();B()&&B().renderAccount();return}
  if(user&&user.id===u.id){user=u;return}
  if(gateFor===u.id)return;gateFor=u.id;
  if(M.owner&&M.owner!==u.id){
    if(!window.confirm(tx('swc'))){gateFor=null;try{await sb.auth.signOut()}catch(e){}user=null;render();return}
    wipe();
  }
  if(!M.owner){M.owner=u.id;saveM()}
  user=u;msg='';sentTo='';codeVal='';render();B().renderAccount();
  try{if(location.search.indexOf('code=')>-1||location.hash.indexOf('access_token')>-1)history.replaceState(null,'',location.pathname)}catch(e){}
  run(true);
}
async function signOut(){
  if(pending()>0){await run(false);var n=pending();if(n>0&&!window.confirm(tx('outp',{n:n})))return}
  try{await sb.auth.signOut()}catch(e){}
  user=null;gateFor=null;msg='';status='';render();B().renderAccount();
}

/* ---------- excluir a conta (LGPD): arquivos antigos do Storage -> rpc -> sair -> limpar ---------- */
function derr(m,detail){var e=new Error(m);e.detail=detail;return e}
async function removeAllFiles(uid){
  var names=[],off=0,N=100,guard=0;
  for(;;){ /* lista TODAS as páginas antes de remover, para a paginação não pular arquivos */
    var r=await sb.storage.from(BUCKET).list(uid,{limit:N,offset:off,sortBy:{column:'name',order:'asc'}});if(r.error){if(noBucket(r.error))return 0;throw r.error}
    var d=r.data||[];d.forEach(function(f){if(f&&f.name&&f.id!==null)names.push(uid+'/'+f.name)});
    if(d.length<N||++guard>2000)break;off+=N;
  }
  for(var o=0;o<names.length;o+=100){var x=await sb.storage.from(BUCKET).remove(names.slice(o,o+100));if(x.error){if(noBucket(x.error))return o;throw x.error}}
  return names.length;
}
async function deleteAccount(prog){
  if(!sb||!user)throw derr(tx('del_nosess'));
  if(navigator.onLine===false)throw derr(tx('del_offline'));
  var uid=user.id,t0=0;deleting=true;clearTimeout(timer);clearTimeout(dT);clearTimeout(rt);
  while(busy&&t0++<75)await new Promise(function(r){setTimeout(r,200)}); /* espera um sync em andamento terminar */
  try{
    if(prog)prog(tx('del_files'));await removeAllFiles(uid);   /* o cascade do banco NÃO apaga o Storage: vem primeiro (inofensivo se o bucket já foi removido) */
    if(prog)prog(tx('del_acc'));var r=await sb.rpc('delete_my_account');if(r.error)throw r.error;
  }catch(e){ /* falhou: nada local foi tocado; dá para tentar de novo */
    deleting=false;console.error('delete',e);if(user)schedule(4000);
    throw derr(navigator.onLine===false?tx('del_offline'):tx('del_err'),e&&e.message);
  }
  try{await sb.auth.signOut({scope:'local'})}catch(e){} /* a sessão já não existe no servidor */
  var erase=true;try{erase=window.confirm(tx('del_local'))}catch(e){}
  user=null;gateFor=null;msg='';status='';M=blank();saveM(); /* wipe do estado do sync */
  if(erase)B().reset();
  deleting=false;render();B().renderAccount();B().toast('info',tx('del_done_t'),tx('del_done'));
  return {erased:erase};
}
function askDelete(){
  B().strongConfirm({title:tx('del_t'),body:tx('del_body'),word:tx('del_word'),email:user&&user.email||'',typeLbl:tx('del_type',{w:tx('del_word')}),
    btn:tx('del_go'),retry:tx('del_retry'),cancel:tx('del_cancel'),run:function(p){return deleteAccount(p)}});
}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)&&v.length<255}

/* ---------- interface (dentro do cartão #ecCloud, no menu Conta) ---------- */
var box;
function when(){try{return new Date(M.last).toLocaleTimeString(B()&&B().locale())}catch(e){return ''}}
function render(){
  if(!box)box=document.getElementById('ecCloud');if(!box)return;
  var h='<h3>'+esc(tx('t'))+'</h3>';
  if(!configured())h+='<p class="sub">'+esc(tx('off'))+'</p>';
  else if(libFail)h+='<p class="sub">'+esc(tx('nolib'))+'</p>';
  else if(!sb)h+='<p class="sub">'+esc(tx('loading'))+'</p>';
  else if(user){
    var n=pending(),line=status==='syncing'?(prog||tx('syncing')):status==='err'?tx('err'):status==='offline'?tx('offline'):(M.last?tx('ok')+' · '+when():'');
    h+='<p class="sub">'+esc(tx('as'))+' <b>'+esc(user.email||'')+'</b></p><p class="g-msg" role="status">'+esc(line)+'</p>'+
      (n>0?'<p class="g-msg">'+esc(tx('pend',{n:n}))+'</p>':'')+
      '<div class="btns" style="margin-top:12px"><button class="btn" type="button" id="ecNow"'+(busy?' disabled':'')+'>'+esc(tx('now'))+'</button><button class="btn ghost" type="button" id="ecOut">'+esc(tx('out'))+'</button></div>'+
      '<div class="zone"><h4>'+esc(tx('zone'))+'</h4><p class="sub">'+esc(tx('del_sub'))+'</p><button class="btn danger" type="button" id="ecDel" style="margin-top:10px">'+esc(tx('del_btn'))+'</button></div>';
  }else{
    h+='<p class="sub">'+esc(tx('sub'))+'</p><div style="display:grid;gap:10px;margin-top:12px">'+
      '<button class="gbtn" type="button" id="ecG"'+(working?' disabled':'')+'>'+(B()&&B().glogo?B().glogo():'')+'<span>'+esc(tx('g'))+'</span></button>'+
      '<label class="sub" for="ecE" style="margin:4px 0 -4px">E-mail</label>'+
      '<input class="input" id="ecE" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="'+esc(tx('em'))+'" value="'+esc(emailVal)+'">'+
      '<button class="btn ghost" type="button" id="ecM"'+(working?' disabled':'')+'>'+esc(tx('m'))+'</button>'+
      (sentTo?'<label class="sub" for="ecC" style="margin:4px 0 -4px">'+esc(tx('code'))+'</label><input class="input" id="ecC" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*" value="'+esc(codeVal)+'"><button class="btn" type="button" id="ecV"'+(working?' disabled':'')+'>'+esc(tx('ver'))+'</button>':'')+'</div>';
  }
  if(msg)h+='<p class="g-msg" role="status">'+esc(msg)+'</p>';
  box.innerHTML=h;
  var q=function(i){return box.querySelector(i)},g=q('#ecG'),m=q('#ecM'),v=q('#ecV'),o=q('#ecOut'),nw=q('#ecNow'),dl=q('#ecDel'),e=q('#ecE'),c=q('#ecC');
  if(e)e.oninput=function(){emailVal=this.value};if(c)c.oninput=function(){codeVal=this.value};
  if(g)g.onclick=async function(){working=true;render();var r=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:redir()}});if(r.error){working=false;msg=tx('err');render()}};
  if(m)m.onclick=async function(){
    var em=(q('#ecE').value||'').trim();emailVal=em;
    if(!validEmail(em)){msg=tx('bad_email');render();return}
    if(Date.now()<coolUntil){msg=tx('wait',{s:Math.ceil((coolUntil-Date.now())/1000)});render();return}
    working=true;msg='';render();
    var r=await sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:true,emailRedirectTo:redir()}});
    working=false;if(r.error){msg=tx('err')+(r.error.status===429?' (429)':'');render();return}
    coolUntil=Date.now()+60000;sentTo=em;msg=tx('sent');render();
  };
  if(v)v.onclick=async function(){
    var cd=(q('#ecC').value||'').replace(/\s+/g,'');codeVal=cd;
    if(!/^\d{4,10}$/.test(cd)){msg=tx('bad_code');render();return}
    working=true;msg='';render();
    var r=await sb.auth.verifyOtp({email:sentTo,token:cd,type:'email'});
    working=false;if(r.error){msg=tx('bad_code');render()} /* sucesso: onAuthStateChange cuida do resto */
  };
  if(o)o.onclick=signOut;if(nw)nw.onclick=function(){run(false)};if(dl)dl.onclick=askDelete;
}

/* ---------- início ---------- */
function loadLib(cb){
  if(window.supabase&&window.supabase.createClient)return cb(true);
  var i=0;(function next(){
    if(i>=LIB.length)return cb(false);
    var s=document.createElement('script');s.src=LIB[i++];s.async=true;
    s.onload=function(){if(window.supabase&&window.supabase.createClient)cb(true);else{s.remove();next()}};
    s.onerror=function(){s.remove();next()};document.head.appendChild(s);
  })();
}
function init(){
  sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  sb.auth.onAuthStateChange(function(ev,s){onUser(s&&s.user)});
  sb.auth.getSession().then(function(r){onUser(r.data.session&&r.data.session.user)});
  render();
}
function boot(){
  box=document.getElementById('ecCloud');render();
  if(!configured())return;
  loadLib(function(ok){if(!ok){libFail=true;render();return}init()});
}
window.addEventListener('online',function(){if(!sb&&configured()&&libFail){libFail=false;render();loadLib(function(ok){if(!ok){libFail=true;render();return}init()});return}fails=0;if(user)run(false)});
window.addEventListener('offline',function(){if(user){status='offline';render()}});
document.addEventListener('visibilitychange',function(){if(document.hidden&&user){try{diff()}catch(e){}}if(!document.hidden&&user&&(pending()>0||Date.now()-M.last>300000))run(false)});
setInterval(function(){if(user&&!document.hidden)run(false)},900000); /* busca mudanças de outros aparelhos a cada 15 min */
window.ECSync={schedule:schedule,config:CFG,render:render,summary:function(){return user?user.email||'':''},lastSync:function(){return M.last||0},syncNow:function(){return run(false)},deleteAccount:deleteAccount};
if(window.__EC_TEST__)window.ECSync._t={M:function(){return M},setM:function(m){M=m},diff:diff,mergeRows:mergeRows,pull:pull,push:push,run:run,purgeLegacy:purgeLegacy,removeAllFiles:removeAllFiles,hashItem:hashItem,pending:pending,onUser:onUser,wipe:wipe,deleteAccount:deleteAccount,
  inject:function(s,u){sb=s;user=u},sane:sane};
window.addEventListener('load',boot);
})();
