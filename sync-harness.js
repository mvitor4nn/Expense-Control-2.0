/* Testes da LÓGICA de sincronização com um Supabase SIMULADO (em memória). Rode: node tests/sync-harness.js
   Valida diff/merge/fila/limpeza legada/troca de conta/exclusão de conta. NÃO prova RLS, Auth, Storage nem e-mail reais: isso só o seu projeto Supabase prova. */
const vm=require('vm'),fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','supabase-sync.js'),'utf8').replace("var CFG={url:'',key:''}","var CFG={url:'http://t',key:'k'}");
const clock={t:Date.parse('2026-11-20T12:00:00Z')};let seq=0;
const tick=ms=>{clock.t+=ms};
class D extends Date{static now(){return clock.t}constructor(...a){a.length?super(...a):super(clock.t)}}
const PNG='data:image/jpeg;base64,'+Buffer.from('fakejpegbytes').toString('base64'); /* só para provar que foto antiga NUNCA sobe */
function Remote(){this.rows={expenses:[],recurring:[],installments:[],goals:[],incomes:[]};this.prof=null;this.files={};this.down=false;this.calls=[];this.rpcFail=false;this.accountGone=false;this.uploads=0;this.storageErr=false;this.noBucket=false}
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
    async upload(p,blob){fail();remote.uploads++;return{error:{message:'upload não deveria acontecer'}}},
    async remove(ps){fail();if(remote.noBucket)return{error:{message:'Bucket not found'}};remote.calls.push('remove');ps.forEach(p=>delete remote.files[p]);return{error:null}},
    async list(folder,o){fail();remote.calls.push('list');if(remote.noBucket)return{data:null,error:{message:'Bucket not found'}};if(remote.storageErr)return{data:null,error:{message:'boom'}};o=o||{};const names=Object.keys(remote.files).filter(p=>p.indexOf(folder+'/')===0).map(p=>p.slice(folder.length+1)).sort();
       return{data:names.slice(o.offset||0,(o.offset||0)+(o.limit||100)).map(n=>({name:n,id:'id-'+n})),error:null}}})};
  const rpc=async(name)=>{fail();remote.calls.push('rpc:'+name);if(remote.rpcFail)return{error:{message:'boom'}};
    remote.accountGone=true;['expenses','recurring','installments','goals','incomes'].forEach(t=>{remote.rows[t]=remote.rows[t].filter(r=>r.user_id!==uid)});remote.prof=null;return{error:null}};
  return{from,storage,rpc,auth:{signOut:async(o)=>{remote.calls.push('signOut'+(o&&o.scope?':'+o.scope:''))}}};
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
  console.log('1) primeiro login: envia gastos; foto/comprovante antigo NUNCA sobe e não vai para o banco');
  let R=new Remote(),A=Device(R,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  A.S.expenses.push(exp('u1','mercado',{photo:PNG,photoPath:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/u1.jpg',photoExp:1}),exp('u2','padaria'));A.S.goals.push({id:'g1',name:'Viagem',target:100,saved:5});A.S.salary=3000;
  await A.login();
  ok(R.rows.expenses.length===2,'2 gastos no servidor');
  const r1=R.rows.expenses.find(x=>x.id==='u1');
  ok(r1&&r1.data.photo===undefined&&r1.data.photoPath===undefined&&r1.data.photoExp===undefined,'servidor NÃO recebe photo/photoPath/photoExp');
  ok(R.uploads===0,'nenhum upload ao Storage foi tentado');
  ok(R.rows.goals.length===1&&R.prof&&R.prof.prefs.salary===3000,'metas e preferências enviadas');
  ok(A.t.pending()===0,'nada pendente');

  console.log('2) segundo aparelho baixa tudo sem pendências');
  const B2=Device(R,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');await B2.login();
  ok(B2.S.expenses.length===2&&B2.S.goals.length===1,'aparelho B recebeu os dados');
  ok(B2.S.expenses.every(e=>e.photo===undefined&&e.photoPath===undefined),'nenhum campo de foto no aparelho B');
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
  console.log('5) apagar gasto: tombstone vai ao servidor e o outro aparelho remove');
  tick(60000);A.S.expenses=A.S.expenses.filter(e=>e.id!=='u1');await A.sync();
  ok(R.rows.expenses.find(x=>x.id==='u1').deleted===true,'linha marcada deleted=true');
  await B2.sync();ok(!B2.S.expenses.some(e=>e.id==='u1'),'aparelho B também removeu o gasto');

  console.log('6) Desfazer dentro da janela cancela a exclusão pendente');
  R=new Remote();const C=Device(R,'cccccccc-cccc-cccc-cccc-cccccccccccc');C.S.expenses.push(exp('u9','x'));await C.login();
  const saved=C.S.expenses[0];tick(1000);C.S.expenses=[];C.t.diff();ok(Object.keys(C.t.M().tomb.expenses||{}).length===1,'exclusão registrada');
  C.S.expenses.push(saved);C.t.diff();ok(Object.keys(C.t.M().tomb.expenses||{}).length===0,'Desfazer cancelou a exclusão');

  console.log('7) sem internet: fila fica salva, retry automático agendado, reenvia quando voltar');
  R=new Remote();const E=Device(R,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');await E.login();
  E.S.expenses.push(exp('u5','offline1'),exp('u6','offline2'));R.down=true;await E.sync();
  ok(E.t.pending()===2,'2 alterações pendentes');ok(E.timers.some(t=>t.ms>=3000),'nova tentativa automática agendada');
  ok(JSON.parse(E.ls['ec-sync-v1']).meta.expenses.u5.d===1,'fila persistida no aparelho (sobrevive a fechar o app)');
  R.down=false;await E.sync();ok(E.t.pending()===0&&R.rows.expenses.length===2,'reenviou tudo ao voltar a conexão');

  console.log('8) limpeza legada: apaga SÓ os arquivos antigos da própria pasta, uma vez por conta');
  R=new Remote();const U8='ffffffff-ffff-ffff-ffff-ffffffffffff',F=Device(R,U8);
  for(let i=0;i<3;i++)R.files[U8+'/old'+i+'.jpg']=1;R.files['outro-uid/x.jpg']=1;F.S.expenses.push(exp('u8','b'));
  await F.login();
  ok(Object.keys(R.files).filter(p=>p.indexOf(U8+'/')===0).length===0,'3 arquivos antigos da pasta <uid>/ removidos no primeiro sync');
  ok(R.files['outro-uid/x.jpg']===1,'arquivo de outro usuário intacto');ok(F.t.M().legacy===true,'marcado como limpo');
  const listsBefore=R.calls.filter(c=>c==='list').length;await F.sync();
  ok(R.calls.filter(c=>c==='list').length===listsBefore,'não lista o Storage de novo nos próximos syncs');

  console.log('9) limpeza legada tolerante: bucket já apagado = ok; erro do Storage não derruba o sync e tenta de novo');
  R=new Remote();R.noBucket=true;const U9='12121212-1212-1212-1212-121212121212',G=Device(R,U9);G.S.expenses.push(exp('u3','p'));await G.login();
  ok(G.t.M().legacy===true&&R.rows.expenses.length===1,'bucket inexistente: marcado como limpo e sync normal');
  R=new Remote();R.storageErr=true;const U10='13131313-1313-1313-1313-131313131313',G2=Device(R,U10);G2.S.expenses.push(exp('u3','p'));await G2.login();
  ok(G2.t.M().legacy===false&&G2.t.M().synced===true&&R.rows.expenses.length===1,'erro no Storage: dados sincronizados, limpeza fica para depois');
  R.storageErr=false;R.files[U10+'/a.jpg']=1;await G2.sync();ok(G2.t.M().legacy===true&&!R.files[U10+'/a.jpg'],'próximo sync concluiu a limpeza');

  console.log('10) troca de conta no mesmo aparelho');
  R=new Remote();const H=Device(R,'aaaa0000-0000-0000-0000-00000000000a',{confirm:()=>false});H.S.expenses.push(exp('u1','da conta A'));await H.login();
  H.t.setM(Object.assign(H.t.M(),{}));
  const other={id:'bbbb0000-0000-0000-0000-00000000000b',email:'b@t.com'};
  await H.t.onUser(other);ok(H.S.expenses.length===1,'usuário recusou: dados da conta A NÃO foram apagados');
  H.win.confirm=()=>true;H.t.inject(mkSb(R,other.id),null);await H.t.onUser(other);await H.idle();
  ok(H.S.expenses.length===0,'usuário aceitou: dados locais da conta A foram limpos antes de mesclar');ok(H.t.M().owner===other.id,'dono local agora é a conta B');
  ok(!R.rows.expenses.some(x=>x.user_id===other.id),'nada da conta A foi enviado para a conta B');

  console.log('11) dados remotos maliciosos ou antigos são saneados');
  const s=A.t.sane({name:'x',photo:'javascript:alert(1)',photoPath:'../../etc/passwd'},'q1');ok(s.photo===undefined&&s.photoPath===undefined,'photo/photoPath inválidos descartados');
  const s2=A.t.sane({name:'x',photo:'data:image/jpeg;base64,AAAA',photoPath:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/u1.jpg',photoExp:5},'q2');ok(s2.photo===undefined&&s2.photoPath===undefined&&s2.photoExp===undefined,'até um photoPath válido (dado antigo da nuvem) é descartado');
  R=new Remote();const U11='14141414-1414-1414-1414-141414141414',Hh=Device(R,U11);
  R.rows.expenses.push({user_id:U11,id:'old1',data:{id:'old1',cat:'alimentacao',sub:'mercado',pay:'pix',name:'antigo',price:5,ts:'2026-10-01T10:00',photoPath:U11+'/old1.jpg'},deleted:false,updated_at:new Date(clock.t-1e6).toISOString(),synced_at:new Date(clock.t-1e6).toISOString()});
  await Hh.login();ok(Hh.S.expenses.length===1&&Hh.S.expenses[0].photoPath===undefined,'gasto antigo da nuvem chega sem photoPath');ok(Hh.t.pending()===0,'e não vira edição pendente');
  console.log('12) excluir conta: remove TODOS os arquivos (várias páginas) ANTES do rpc; sucesso desloga e limpa');
  R=new Remote();const U='dddddddd-dddd-dddd-dddd-dddddddddddd',X=Device(R,U,{confirm:()=>true});
  X.S.expenses.push(exp('d1','a'),exp('d2','b'));await X.login();
  for(let i=0;i<230;i++)R.files[U+'/f'+i+'.jpg']=1; R.files['outro-uid/x.jpg']=1; /* arquivo de OUTRO usuário nunca é tocado */
  R.calls.length=0;const prog=[];
  await X.t.deleteAccount(m=>prog.push(m));
  ok(Object.keys(R.files).filter(p=>p.indexOf(U+'/')===0).length===0,'230 arquivos da pasta <uid>/ removidos (paginação 100/100/30)');
  ok(R.files['outro-uid/x.jpg']===1,'arquivo de outro usuário intacto');
  const iRpc=R.calls.indexOf('rpc:delete_my_account'),lastRm=R.calls.lastIndexOf('remove');
  ok(iRpc>0&&lastRm>=0&&lastRm<iRpc,'todos os remove() aconteceram ANTES do rpc delete_my_account');
  ok(R.calls.indexOf('signOut:local')>iRpc,'signOut depois do rpc');
  ok(R.accountGone&&R.rows.expenses.length===0,'rpc apagou as linhas no servidor simulado');
  ok(X.t.M().owner===null&&X.t.M().synced===false,'estado do sync zerado (wipe)');
  ok(X.S.expenses.length===0,'usuário aceitou apagar dados do aparelho: estado local limpo');
  ok(X.toasts.some(t=>t.indexOf('Conta excluída')===0),'toast de conclusão exibido');
  ok(prog.length===2,'progresso informado (arquivos, conta)');

  console.log('13) falha no rpc: NADA local é limpo e dá para tentar de novo');
  R=new Remote();const U2='99999999-9999-9999-9999-999999999999',Y=Device(R,U2,{confirm:()=>true});
  Y.S.expenses.push(exp('y1','keep'));Y.S.salary=1234;await Y.login();R.files[U2+'/a.jpg']=1;R.rpcFail=true;R.calls.length=0;
  let err=null;try{await Y.t.deleteAccount()}catch(e){err=e}
  ok(!!err&&/Nada foi apagado neste aparelho/.test(err.message),'erro claro em português');
  ok(Y.S.expenses.length===1&&Y.S.salary===1234,'dados locais intactos após falha');
  ok(Y.t.M().owner===U2,'sync continua ligado à conta (não deslogou nem fez wipe)');
  ok(!R.calls.some(c=>c.indexOf('signOut')===0),'signOut NÃO foi chamado');
  R.rpcFail=false;err=null;try{await Y.t.deleteAccount()}catch(e){err=e}
  ok(!err&&R.accountGone&&Y.S.expenses.length===0,'nova tentativa funcionou e limpou');

  console.log('14) sem internet: avisa e não faz nenhuma chamada');
  R=new Remote();const U3='77777777-7777-7777-7777-777777777777',Z=Device(R,U3,{offline:false});
  Z.S.expenses.push(exp('z1','z'));await Z.login();R.calls.length=0;
  const Zo=Device(R,U3,{offline:true});Zo.S.expenses.push(exp('z2','z'));Zo.t.inject(mkSb(R,U3),Zo.user);
  err=null;try{await Zo.t.deleteAccount()}catch(e){err=e}
  ok(!!err&&/Sem internet/.test(err.message),'mensagem de que precisa de conexão');
  ok(R.calls.length===0&&Zo.S.expenses.length===1,'nenhuma chamada ao servidor e dados locais intactos');

  console.log('15) usuário escolhe MANTER os dados deste aparelho');
  R=new Remote();const U4='55555555-5555-5555-5555-555555555555',K=Device(R,U4,{confirm:()=>false});
  K.S.expenses.push(exp('k1','mantém'));await K.login();await K.t.deleteAccount();
  ok(R.accountGone&&K.S.expenses.length===1&&K.t.M().owner===null,'conta apagada, dados locais mantidos, sync zerado');

  console.log('16) data da última sincronização exposta para a tela Dados e backup');
  R=new Remote();const U5='66666666-6666-6666-6666-666666666666',Q=Device(R,U5);
  ok(Q.win.ECSync.lastSync()===0,'antes de sincronizar: 0');
  Q.S.expenses.push(exp('q1','q'));await Q.login();
  ok(Q.win.ECSync.lastSync()>0&&Q.win.ECSync.lastSync()===Q.t.M().last,'depois do sync: igual ao M.last');

  console.log('\n'+pass+' ok, '+fail+' falhas');process.exit(fail?1:0);
})().catch(e=>{console.error('ERRO NO TESTE',e);process.exit(2)});
