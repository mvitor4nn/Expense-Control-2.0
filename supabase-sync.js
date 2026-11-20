/* Expense Control - sincronização Supabase v2 (login + banco + fotos).
   - Só a anon key PÚBLICA vai em CFG.key. NUNCA coloque a service_role aqui.
   - Sem URL/KEY configuradas o app continua 100% local (nada é enviado).
   - Conflitos: por item, vence o updated_at (hora da edição) mais novo.
   - Exclusões viajam como "tombstone" (deleted=true) e removem a foto do Storage.
   - Sem internet: as mudanças ficam numa fila salva no aparelho e são reenviadas sozinhas. */
(function(){
'use strict';
var CFG={url:'',key:''}; /* <- preencha: Project URL e anon/publishable key (Settings > API) */
var LIB=['vendor/supabase.js','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];
var T={expenses:'expenses',recurring:'recurring',inst:'installments',goals:'goals',incomes:'incomes'};
var BUCKET='receipts',TTL=2592000,RENEW=864000000,RM_DELAY=120000,KM='ec-sync-v1',PK=['salary','va','limit','warn','nick','budgets'];
var TX={
pt:{t:'Conta e nuvem',sub:'Entre para sincronizar seus gastos e comprovantes entre aparelhos.',g:'Continuar com Google',m:'Receber código por e-mail',em:'seu@email.com',code:'Código do e-mail',ver:'Entrar com o código',out:'Sair',now:'Sincronizar agora',
 ok:'Sincronizado',sent:'Enviamos um código para seu e-mail. Digite-o abaixo (o link do e-mail também funciona neste navegador).',err:'Falha ao sincronizar. Nova tentativa automática em breve.',off:'Nuvem não configurada neste app.',
 offline:'Sem internet. As alterações ficam salvas e serão enviadas quando a conexão voltar.',pend:'{n} alteração(ões) aguardando envio',syncing:'Sincronizando…',photos:'Enviando fotos ({i}/{n})…',
 bad_email:'Digite um e-mail válido.',bad_code:'Digite o código recebido.',wait:'Aguarde {s}s para pedir outro código.',loading:'Carregando login…',nolib:'Não consegui carregar o login. Conecte-se à internet e tente de novo.',
 swc:'Este aparelho tem dados de OUTRA conta. Para proteger sua privacidade, vamos apagar os dados locais antes de entrar com esta conta. Os dados da outra conta continuam salvos na nuvem dela. Continuar?',
 outp:'Ainda há {n} alteração(ões) não enviadas e não foi possível enviá-las agora. Sair mesmo assim?',conf_t:'Atualizado de outro aparelho',conf:'{n} item(ns) tinham uma versão mais nova em outro aparelho.',
 photo_big:'Alguma foto é grande demais e ficou só neste aparelho.',as:'Conectado como'},
en:{t:'Account & cloud',sub:'Sign in to sync your spending and receipts across devices.',g:'Continue with Google',m:'Email me a code',em:'you@email.com',code:'Email code',ver:'Sign in with code',out:'Sign out',now:'Sync now',
 ok:'Synced',sent:'We emailed you a code. Type it below (the email link also works in this browser).',err:'Sync failed. It will retry automatically soon.',off:'Cloud is not configured in this app.',
 offline:'No internet. Changes are saved and will be sent when the connection returns.',pend:'{n} change(s) waiting to upload',syncing:'Syncing…',photos:'Uploading photos ({i}/{n})…',
 bad_email:'Enter a valid email.',bad_code:'Enter the code you received.',wait:'Wait {s}s before asking for another code.',loading:'Loading sign-in…',nolib:"Couldn't load sign-in. Connect to the internet and try again.",
 swc:'This device has data from a DIFFERENT account. To protect your privacy, local data will be erased before signing in with this account. The other account\'s data stays safe in its cloud. Continue?',
 outp:'{n} change(s) are not uploaded yet and could not be sent now. Sign out anyway?',conf_t:'Updated from another device',conf:'{n} item(s) had a newer version on another device.',
 photo_big:'A photo is too large and stayed on this device only.',as:'Signed in as'},
es:{t:'Cuenta y nube',sub:'Entra para sincronizar tus gastos y comprobantes entre dispositivos.',g:'Continuar con Google',m:'Recibir código por correo',em:'tu@correo.com',code:'Código del correo',ver:'Entrar con el código',out:'Salir',now:'Sincronizar ahora',
 ok:'Sincronizado',sent:'Te enviamos un código por correo. Escríbelo abajo (el enlace del correo también funciona en este navegador).',err:'Error al sincronizar. Se reintentará automáticamente.',off:'La nube no está configurada en esta app.',
 offline:'Sin internet. Los cambios quedan guardados y se enviarán cuando vuelva la conexión.',pend:'{n} cambio(s) esperando envío',syncing:'Sincronizando…',photos:'Subiendo fotos ({i}/{n})…',
 bad_email:'Escribe un correo válido.',bad_code:'Escribe el código recibido.',wait:'Espera {s}s para pedir otro código.',loading:'Cargando inicio de sesión…',nolib:'No pude cargar el inicio de sesión. Conéctate a internet e inténtalo de nuevo.',
 swc:'Este dispositivo tiene datos de OTRA cuenta. Para proteger tu privacidad, borraremos los datos locales antes de entrar con esta cuenta. Los datos de la otra cuenta siguen guardados en su nube. ¿Continuar?',
 outp:'Aún hay {n} cambio(s) sin enviar y no se pudieron enviar ahora. ¿Salir de todos modos?',conf_t:'Actualizado desde otro dispositivo',conf:'{n} elemento(s) tenían una versión más nueva en otro dispositivo.',
 photo_big:'Una foto es demasiado grande y quedó solo en este dispositivo.',as:'Conectado como'}};
var B=function(){return window.ECBridge};
function tx(k,v){var l=(B()&&B().lang()||'pt').slice(0,2),s=(TX[l]||TX.pt)[k]||TX.pt[k]||k;if(v)for(var x in v)s=s.split('{'+x+'}').join(v[x]);return s}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function configured(){return !!(CFG.url&&CFG.key)}

/* ---------- estado persistido (meta por item, exclusões, fila de remoção de fotos) ---------- */
function blank(){return {v:1,owner:null,synced:false,cur:{},meta:{},tomb:{},rm:[],prefs:null,last:0}}
var M=blank();
try{var _r=JSON.parse(localStorage.getItem(KM));if(_r&&_r.v===1)M=Object.assign(blank(),_r)}catch(e){}
function saveM(){try{localStorage.setItem(KM,JSON.stringify(M))}catch(e){}}
function mt(k){return M.meta[k]||(M.meta[k]={})}
function tb(k){return M.tomb[k]||(M.tomb[k]={})}
function stable(o){if(o===null||typeof o!=='object')return JSON.stringify(o);if(Array.isArray(o))return '['+o.map(stable).join(',')+']';
  return '{'+Object.keys(o).sort().filter(function(k){return o[k]!==undefined}).map(function(k){return JSON.stringify(k)+':'+stable(o[k])}).join(',')+'}'}
function h32(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)+'.'+s.length.toString(36)}
/* a URL assinada e a validade NÃO entram no hash nem vão para o banco: renovar URL não conta como edição */
function core(x){var c={};Object.keys(x).forEach(function(k){if(k!=='photo'&&k!=='photoExp')c[k]=x[k]});return c}
function hashItem(x){var c=core(x);if(typeof x.photo==='string'&&x.photo.indexOf('data:')===0)c.__ph=x.photo.length+':'+x.photo.slice(-24);return h32(stable(c))}
function getPrefs(S){var o={};PK.forEach(function(k){o[k]=S[k]});return o}
function iso(ms){return new Date(ms).toISOString()}

/* ---------- fila de remoção de fotos (adiada p/ dar tempo do "Desfazer") ---------- */
function queueRm(p){if(!p)return;if(!M.rm.some(function(r){return r.path===p}))M.rm.push({path:p,at:Date.now()+RM_DELAY})}
function unRm(p){if(!p)return;M.rm=M.rm.filter(function(r){return r.path!==p})}

/* ---------- detecta o que mudou localmente desde a última sincronização ---------- */
function skip(tk,x){return tk==='expenses'&&B().isSeed(x)}
function diff(){
  var S=B().S(),now=Date.now();
  for(var tk in T){
    var arr=S[tk]||[],m=mt(tk),t=tb(tk),seen={};
    arr.forEach(function(x){
      if(!x||x.id==null||skip(tk,x))return;
      var id=String(x.id),h=hashItem(x),p=x.photoPath||'',c=m[id];seen[id]=1;
      if(t[id])delete t[id]; /* reapareceu (Desfazer): cancela a exclusão */
      if(!c)m[id]={h:h,u:now,d:1,p:p};
      else if(c.h!==h){if(c.p&&c.p!==p)queueRm(c.p);c.h=h;c.u=now;c.d=1;c.p=p}
      if(p)unRm(p);
    });
    Object.keys(m).forEach(function(id){
      if(seen[id])return;
      t[id]={u:now,p:m[id].p||''};if(m[id].p)queueRm(m[id].p);delete m[id];
    });
  }
  if(M.prefs){var ph=h32(stable(getPrefs(S)));if(M.prefs.h!==ph){M.prefs.h=ph;M.prefs.u=now;M.prefs.d=1}}
  saveM();
}
function pending(){diff();var n=0;for(var tk in T){var m=mt(tk);Object.keys(m).forEach(function(i){if(m[i].d)n++});n+=Object.keys(tb(tk)).length}
  if(M.prefs&&M.prefs.d)n++;return n}

/* ---------- fotos ---------- */
function b2b(d,mime){var b=atob(d),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Blob([u],{type:mime})}
async function upPhoto(x){
  var i=x.photo.indexOf(','),head=x.photo.slice(0,i),mm=/^data:image\/(jpeg|png|webp);base64$/.exec(head);
  if(!mm)throw new Error('foto inválida');
  var blob=b2b(x.photo.slice(i+1),'image/'+mm[1]);if(blob.size>2097152){var e=new Error('foto grande');e.big=1;throw e}
  var ext=mm[1]==='jpeg'?'jpg':mm[1],path=user.id+'/'+String(x.id).replace(/[^A-Za-z0-9_-]/g,'_')+'.'+ext;
  var r=await sb.storage.from(BUCKET).upload(path,blob,{upsert:true,contentType:'image/'+mm[1],cacheControl:'3600'});if(r.error)throw r.error;
  var s=await sb.storage.from(BUCKET).createSignedUrl(path,TTL);if(s.error)throw s.error;
  if(x.photoPath&&x.photoPath!==path)queueRm(x.photoPath);
  x.photoPath=path;x.photo=s.data.signedUrl;x.photoExp=Date.now()+TTL*1000; /* local guarda só a URL */
  var m=mt('expenses')[String(x.id)];if(m){m.h=hashItem(x);m.p=path;m.d=1} /* não altera u: subir foto não é edição */
}
async function renewPhotos(){
  var S=B().S(),now=Date.now(),need=[];
  (S.expenses||[]).forEach(function(x){
    if(!x.photoPath||x.photoPath.indexOf(user.id+'/')!==0)return;
    if(typeof x.photo==='string'&&x.photo.indexOf('data:')===0)return;
    if(!x.photo||!x.photoExp||x.photoExp-now<RENEW)need.push(x);
  });
  if(!need.length)return;
  for(var o=0;o<need.length;o+=100){
    var part=need.slice(o,o+100),r=await sb.storage.from(BUCKET).createSignedUrls(part.map(function(x){return x.photoPath}),TTL);
    if(r.error)throw r.error;
    var by={};(r.data||[]).forEach(function(d){if(d&&d.path)by[d.path]=d});
    part.forEach(function(x){var d=by[x.photoPath];
      if(d&&d.signedUrl&&!d.error){x.photo=d.signedUrl;x.photoExp=now+TTL*1000}
      else x.photoExp=now+3600000; /* arquivo ausente: tenta de novo em 1h, sem insistir a cada ciclo */});
  }
  B().persist();B().refresh();
}
async function flushRm(){
  var now=Date.now(),pre=user.id+'/',due=M.rm.filter(function(r){return r.at<=now&&r.path.indexOf(pre)===0}).map(function(r){return r.path});
  M.rm=M.rm.filter(function(r){return r.path.indexOf(pre)===0});
  if(due.length){var r=await sb.storage.from(BUCKET).remove(due);if(r.error)throw r.error;M.rm=M.rm.filter(function(x){return due.indexOf(x.path)<0})}
  clearTimeout(rmT);if(M.rm.length){var nx=Math.max(1000,Math.min.apply(null,M.rm.map(function(r){return r.at}))-Date.now()+1000);rmT=setTimeout(function(){run(false)},nx)}
}

/* ---------- baixar e mesclar (por item, vence o updated_at mais novo) ---------- */
function sane(data,id){
  var x;try{x=JSON.parse(JSON.stringify(data||{}))}catch(e){x={}}
  if(typeof x!=='object'||Array.isArray(x))x={};
  x.id=String(id);delete x.photo;delete x.photoExp; /* a URL é gerada de novo a partir do photoPath */
  if(x.photoPath!==undefined&&!(typeof x.photoPath==='string'&&x.photoPath.indexOf(user.id+'/')===0&&/^[0-9a-f-]{36}\/[A-Za-z0-9_.-]+$/.test(x.photoPath)))delete x.photoPath;
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
        else{var nx=sane(r.data,id),o=arr[i];if(o&&o.photoPath&&o.photoPath===nx.photoPath&&o.photo){nx.photo=o.photo;nx.photoExp=o.photoExp}arr[i]=nx;applied.push([id,ru])}
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
      apps[tk].forEach(function(a){var it=by[a[0]],m=mt(tk);if(it)m[a[0]]={h:hashItem(it),u:a[1],d:0,p:it.photoPath||''};else delete m[a[0]]})}
    B().persist();B().afterMerge(prefsChanged);
  }
  if(M.prefs)M.prefs.h=h32(stable(getPrefs(B().S())));
  saveM();
  if(conf)B().toast('info',tx('conf_t'),tx('conf',{n:conf}));
}

/* ---------- enviar ---------- */
async function push(){
  var S=B().S(),uid=user.id,ex=S.expenses||[],todo=ex.filter(function(x){return typeof x.photo==='string'&&x.photo.indexOf('data:')===0&&!skip('expenses',x)}),big=0;
  for(var i=0;i<todo.length;i++){
    prog=tx('photos',{i:i+1,n:todo.length});render();
    try{await upPhoto(todo[i])}catch(e){if(e&&e.big)big++;console.warn('foto não enviada',todo[i].id,e)} /* uma foto ruim não trava o resto */
  }
  prog='';if(todo.length){B().persist();saveM()}
  if(big)B().toast('warn',tx('err').split('.')[0],tx('photo_big'));
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
var sb=null,user=null,busy=false,again=false,timer,dT,rt,rmT,fails=0,status='',prog='',msg='',libFail=false,gateFor=null,coolUntil=0,sentTo='',emailVal='',codeVal='',working=false;
async function run(first){
  if(!sb||!user||!B()||M.owner!==user.id)return;
  if(busy){again=true;return}
  clearTimeout(rt);
  if(navigator.onLine===false){status='offline';render();return}
  busy=true;again=false;status='syncing';render();
  try{
    diff();await pull();await push();await flushRm();await renewPhotos();
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
      '<div class="btns" style="margin-top:12px"><button class="btn" type="button" id="ecNow"'+(busy?' disabled':'')+'>'+esc(tx('now'))+'</button><button class="btn ghost" type="button" id="ecOut">'+esc(tx('out'))+'</button></div>';
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
  var q=function(i){return box.querySelector(i)},g=q('#ecG'),m=q('#ecM'),v=q('#ecV'),o=q('#ecOut'),nw=q('#ecNow'),e=q('#ecE'),c=q('#ecC');
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
  if(o)o.onclick=signOut;if(nw)nw.onclick=function(){run(false)};
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
window.ECSync={schedule:schedule,config:CFG,render:render,summary:function(){return user?user.email||'':''},syncNow:function(){return run(false)}};
if(window.__EC_TEST__)window.ECSync._t={M:function(){return M},setM:function(m){M=m},diff:diff,mergeRows:mergeRows,pull:pull,push:push,run:run,flushRm:flushRm,renewPhotos:renewPhotos,upPhoto:upPhoto,hashItem:hashItem,pending:pending,onUser:onUser,wipe:wipe,
  inject:function(s,u){sb=s;user=u},sane:sane};
window.addEventListener('load',boot);
})();
