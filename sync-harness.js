/* Testes da LÓGICA de sincronização com um Supabase SIMULADO (em memória). Rode: node tests/sync-harness.js
   Valida diff/merge/fila/fotos/troca de conta. NÃO prova RLS, Auth, Storage nem e-mail reais: isso só o seu projeto Supabase prova. */
const vm=require('vm'),fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','supabase-sync.js'),'utf8').replace("var CFG={url:'',key:''}","var CFG={url:'http://t',key:'k'}");
const clock={t:Date.parse('2026-11-20T12:00:00Z')};let seq=0;
const tick=ms=>{clock.t+=ms};
class D extends Date{static now(){return clock.t}constructor(...a){a.length?super(...a):super(clock.t)}}
const PNG='data:image/jpeg;base64,'+Buffer.from('fakejpegbytes').toString('base64');
function Remote(){this.rows={expenses:[],recurring:[],installments:[],goals:[],incomes:[]};this.prof=null;this.files={};this.down=false;this.calls=[]}
function mkSb(remote,uid){
  const fail=()=>{if(remote.down)throw new Error('Failed to fetch')};
  const from=tbl=>({
    async upsert(rows,opt){fail();if(tbl==='profiles'){const r=Array.isArray(rows)?rows[0]:rows;if(!remote.prof||Date.parse(r.updated_at)>=Date.parse(remote.prof.updated_at))remote.prof={...r,synced_at:new Date(clock.t+(++seq)).toISOString()};return{error:null}}
      rows=[].concat(rows);for(const r of rows){if(r.user_id!==uid)return{error:{message:'RLS violation'}};
        const L=remote.rows[tbl],i=L.findIndex(x=>x.id===r.id);
        if(i>=0&&Date.parse(r.updated_at)<Date.parse(L[i].updated_at))continue; /* trigger ec_touch: ignora escrita antiga */
        const nr={...r,synced_at:new Date(clock.t+(++seq)).toISOString()};if(i>=0)L[i]=nr;else L.push(nr)}
      return{error:null}},
    select(){const q={f:[],ord:null,rg:null};
      const o={eq(c,v){q.f.push(x=>x[c]===v);return o},gte(c,v){q.f.push(x=>x[c]>=v);return o},order(c){q.ord=q.ord||c;return o},range(a,b){q.rg=[a,b];return o},
        async maybeSingle(){fail();return{data:tbl==='profiles'?remote.prof:null,error:null}},
        then(res,rej){return(async()=>{fail();let L=(remote.rows[tbl]||[]).filter(x=>q.f.every(f=>f(x)));if(q.ord)L=L.sort((a,b)=>a[q.ord]<b[q.ord]?-1:1);if(q.rg)L=L.slice(q.rg[0],q.rg[1]+1);return{data:JSON.parse(JSON.stringify(L)),error:null}})().then(res,rej)}};
      return o}});
  const storage={from:()=>({
    async upload(p,blob){fail();if(p.indexOf(uid+'/')!==0)return{error:{message:'RLS storage'}};remote.files[p]=blob.size;return{error:null}},
    async createSignedUrl(p){fail();return{data:{signedUrl:'https://sb/sign/'+p+'?t='+clock.t},error:null}},
    async createSignedUrls(ps){fail();return{data:ps.map(p=>({path:p,signedUrl:'https://sb/sign/'+p+'?t='+clock.t}))}},
    async remove(ps){fail();ps.forEach(p=>delete remote.files[p]);return{error:null}}})};
  return{from,storage,auth:{signOut:async()=>{}}};
}
function Device(remote,uid,opt){
  opt=opt||{};const ls={};const timers=[];const toasts=[];
  const S={expenses:[],recurring:[],inst:[],goals:[],incomes:[],budgets:{},salary:0,va:0,limit:70,warn:60,nick:'',sample:false};
  const win={__EC_TEST__:1,addEventListener(){},confirm:opt.confirm||(()=>true)};
  const B={S:()=>win.__S,lang:()=>'pt',locale:()=>'pt-BR',glogo:()=>'',hasUserData:()=>true,isSeed:e=>!!win.__S.sample&&/^s\d+$/.test(String(e.id)),dropSeed(){},
    persist(){return true},normalize(){},applyPrefs(p){Object.assign(win.__S,p)},afterMerge(){},refresh(){},renderSt(){},renderAccount(){},toast(k,t,m){toasts.push(t+'|'+m)},
    reset(){const s=win.__S;s.expenses=[];s.recurring=[];s.inst=[];s.goals=[];s.incomes=[];s.budgets={};s.salary=0}};
  win.__S=S;win.ECBridge=B;win.window=win;
  const ctx={window:win,document:{getElementById:()=>null,addEventListener(){},createElement:()=>({}),head:{appendChild(){}}},navigator:{get onLine(){return !opt.offline}},
    location:{origin:'https://x',pathname:'/index.html',search:'',hash:''},history:{replaceState(){}},Date:D,
    localStorage:{getItem:k=>k in ls?ls[k]:null,setItem(k,v){ls[k]=String(v)},removeItem(k){delete ls[k]}},
    setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length},clearTimeout(){},setInterval(){return 0},atob:s=>Buffer.from(s,'base64').toString('binary'),Blob,console:{log(){},error(...a){if(process.env.DBG)console.log('[err]',...a)},warn(){}},Uint8Array,Promise,JSON,Math,Object,Array,String,Number,isFinite,parseInt,Date:D};
  ctx.self=ctx;vm.createContext(ctx);vm.runInContext(SRC,ctx);
  const t=win.ECSync._t,sb=mkSb(remote,uid),user={id:uid,email:uid+'@t.com'};t.inject(sb,null);
  const dev={S,t,timers,toasts,ls,sb,user,win,
    async login(){await t.onUser(user);await dev.idle()},
    async sync(){await t.run(false);await dev.idle()},
    async idle(){for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))}};
  return dev;
}
let pass=0,fail=0;
function ok(c,m){if(c){pass++;console.log('  ok  '+m)}else{fail++;console.log('  FAIL '+m)}}
const exp=(id,name,extra)=>Object.assign({id,cat:'alimentacao',sub:'mercado',pay:'pix',name,addr:'',price:10,ts:'2026-11-01T10:00'},extra||{});
(async()=>{
  console.log('1) primeiro login: envia gastos e migra foto antiga (data:) para o Storage, guardando só a URL');
  let R=new Remote(),A=Device(R,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  A.S.expenses.push(exp('u1','mercado',{photo:PNG}),exp('u2','padaria'));A.S.goals.push({id:'g1',name:'Viagem',target:100,saved:5});A.S.salary=3000;
  await A.login();
  ok(R.rows.expenses.length===2,'2 gastos no servidor');
  const r1=R.rows.expenses.find(x=>x.id==='u1');
  ok(r1&&r1.data.photoPath==='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/u1.jpg'&&r1.data.photo===undefined,'servidor guarda photoPath e NÃO guarda foto/URL assinada');
  ok(A.S.expenses[0].photo.indexOf('https://sb/sign/')===0&&A.S.expenses[0].photoExp>clock.t,'local trocou base64 por URL assinada com validade');
  ok(Object.keys(R.files).length===1,'1 arquivo no Storage');
  ok(R.rows.goals.length===1&&R.prof&&R.prof.prefs.salary===3000,'metas e preferências enviadas');
  ok(A.t.pending()===0,'nada pendente');

  console.log('2) segundo aparelho baixa tudo e renova URL sem marcar edição');
  const B2=Device(R,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');await B2.login();
  ok(B2.S.expenses.length===2&&B2.S.goals.length===1,'aparelho B recebeu os dados');
  ok(B2.S.expenses.find(e=>e.id==='u1').photo.indexOf('https://sb/sign/')===0,'aparelho B gerou URL a partir do photoPath');
  ok(B2.t.pending()===0,'B sem pendências após baixar');

  console.log('3) conflito: vence o updated_at mais novo, por item (não a união)');
  tick(60000);A.S.expenses.find(e=>e.id==='u2').name='padaria A';A.S.expenses.find(e=>e.id==='u1').price=11;A.t.diff(); /* o diff de 300 ms carimba a hora da edição */
  tick(60000);B2.S.expenses.find(e=>e.id==='u2').name='padaria B (mais nova)';B2.t.diff();
  await B2.sync();tick(1000);await A.sync();  /* B envia a edição mais nova; A só tinha a mais antiga */
  const u2A=A.S.expenses.find(e=>e.id==='u2').name;
  ok(u2A==='padaria B (mais nova)','A adotou a edição mais nova de B no mesmo item');
  ok(A.S.expenses.find(e=>e.id==='u1').price===11,'edição de A em OUTRO item foi preservada');
  ok(A.toasts.length>=1,'A foi avisado do conflito');
  await B2.sync();ok(B2.S.expenses.find(e=>e.id==='u1').price===11,'B recebeu a edição de A no item u1');

  console.log('4) servidor rejeita escrita mais antiga (aparelho que ficou offline)');
  tick(60000);const before=R.rows.expenses.find(x=>x.id==='u2').data.name;
  await R.rows.expenses; const stale={user_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',id:'u2',data:{id:'u2',name:'VELHA'},deleted:false,updated_at:new Date(clock.t-3600e3).toISOString()};
  await A.sb.from('expenses').upsert([stale]);ok(R.rows.expenses.find(x=>x.id==='u2').data.name===before,'escrita antiga ignorada');

  console.log('5) apagar gasto: tombstone vai ao servidor, outro aparelho remove, foto sai do Storage (com atraso p/ Desfazer)');
  tick(60000);A.S.expenses=A.S.expenses.filter(e=>e.id!=='u1');await A.sync();
  ok(R.rows.expenses.find(x=>x.id==='u1').deleted===true,'linha marcada deleted=true');
  ok(Object.keys(R.files).length===1,'foto ainda existe logo após apagar (janela do Desfazer)');
  tick(130000);await A.sync();ok(Object.keys(R.files).length===0,'foto removida do Storage depois do atraso');
  await B2.sync();ok(!B2.S.expenses.some(e=>e.id==='u1'),'aparelho B também removeu o gasto');

  console.log('6) Desfazer dentro da janela cancela a remoção da foto');
  R=new Remote();const C=Device(R,'cccccccc-cccc-cccc-cccc-cccccccccccc');C.S.expenses.push(exp('u9','x',{photo:PNG}));await C.login();
  const saved=C.S.expenses[0];tick(1000);C.S.expenses=[];C.t.diff();ok(C.t.M().rm.length===1,'remoção agendada');
  C.S.expenses.push(saved);C.t.diff();ok(C.t.M().rm.length===0,'Desfazer cancelou a remoção');

  console.log('7) sem internet: fila fica salva, retry automático agendado, reenvia quando voltar');
  R=new Remote();const E=Device(R,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');await E.login();
  E.S.expenses.push(exp('u5','offline1'),exp('u6','offline2'));R.down=true;await E.sync();
  ok(E.t.pending()===2,'2 alterações pendentes');ok(E.timers.some(t=>t.ms>=3000),'nova tentativa automática agendada');
  ok(JSON.parse(E.ls['ec-sync-v1']).meta.expenses.u5.d===1,'fila persistida no aparelho (sobrevive a fechar o app)');
  R.down=false;await E.sync();ok(E.t.pending()===0&&R.rows.expenses.length===2,'reenviou tudo ao voltar a conexão');

  console.log('8) foto com falha não trava o resto');
  R=new Remote();const F=Device(R,'ffffffff-ffff-ffff-ffff-ffffffffffff');F.S.expenses.push(exp('u7','a',{photo:'data:image/svg+xml;base64,AAAA'}),exp('u8','b'));await F.login();
  ok(R.rows.expenses.length===2,'gastos enviados mesmo com foto inválida (svg recusado)');ok(F.S.expenses[0].photo.indexOf('data:image/svg')===0,'foto inválida continua local (nada perdido)');

  console.log('9) renovação das URLs antes de expirarem');
  R=new Remote();const G=Device(R,'12121212-1212-1212-1212-121212121212');G.S.expenses.push(exp('u3','p',{photo:PNG}));await G.login();
  const e0=G.S.expenses[0],oldUrl=e0.photo;tick(21*86400e3);e0.photoExp=clock.t+2*86400e3;await G.sync(); /* faltam 2 dias */
  ok(e0.photo!==oldUrl&&e0.photoExp>clock.t+25*86400e3,'URL renovada (<10 dias restantes)');ok(G.t.pending()===0,'renovar URL não gerou edição/envio');
  const e1=e0.photo;await G.sync();ok(e0.photo===e1,'não renova de novo sem necessidade');

  console.log('10) troca de conta no mesmo aparelho');
  R=new Remote();const H=Device(R,'aaaa0000-0000-0000-0000-00000000000a',{confirm:()=>false});H.S.expenses.push(exp('u1','da conta A'));await H.login();
  H.t.setM(Object.assign(H.t.M(),{}));
  const other={id:'bbbb0000-0000-0000-0000-00000000000b',email:'b@t.com'};
  await H.t.onUser(other);ok(H.S.expenses.length===1,'usuário recusou: dados da conta A NÃO foram apagados');
  H.win.confirm=()=>true;H.t.inject(mkSb(R,other.id),null);await H.t.onUser(other);await H.idle();
  ok(H.S.expenses.length===0,'usuário aceitou: dados locais da conta A foram limpos antes de mesclar');ok(H.t.M().owner===other.id,'dono local agora é a conta B');
  ok(!R.rows.expenses.some(x=>x.user_id===other.id),'nada da conta A foi enviado para a conta B');

  console.log('11) dados remotos maliciosos são saneados');
  const s=A.t.sane({name:'x',photo:'javascript:alert(1)',photoPath:'../../etc/passwd'},'q1');ok(s.photo===undefined&&s.photoPath===undefined,'photo/photoPath inválidos descartados');
  console.log('\n'+pass+' ok, '+fail+' falhas');process.exit(fail?1:0);
})().catch(e=>{console.error('ERRO NO TESTE',e);process.exit(2)});
