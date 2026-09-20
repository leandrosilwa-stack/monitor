let sb=null, DB={analistas:[],slas:[],feriados:[],chamados:[],pausas:[],ausencias:[]};
let view='kanban';
let countdownSec=120, routerSec=120, redistModo='todos';

// ---------- utils data dd/mm/yy hh:mm:ss ----------
function fmtDT(d){ if(!d) return '-'; const x=new Date(d);
  const p=n=>String(n).padStart(2,'0');
  return `${p(x.getDate())}/${p(x.getMonth()+1)}/${String(x.getFullYear()).slice(2)} ${p(x.getHours())}:${p(x.getMinutes())}:${p(x.getSeconds())}`;}
function parseBR(s){ // dd/mm/yy hh:mm:ss
  const m=s.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if(!m) return null;
  let yy=+m[3]; if(yy<100) yy=2000+yy;
  return new Date(yy,+m[2]-1,+m[1],+m[4],+m[5],+m[6]);}
function nowBR(){ return fmtDT(new Date()); }
function parseAusBR(s){ const m=s.match(/(\d{2})\/(\d{2})\/(\d{2,4})/); if(!m) return null;
  let yy=+m[3]; if(yy<100) yy=2000+yy; return new Date(yy,+m[2]-1,+m[1]); }

// ---------- expediente 8-18, seg-sex, sem feriado ----------
function isFeriado(d){ return DB.feriados.some(f=>f.dia===d.getDate()&&f.mes===(d.getMonth()+1)); }
function isDiaUtil(d){ const w=d.getDay(); return w!==0&&w!==6&&!isFeriado(d); }
function proximoUtil8h(d){ const x=new Date(d);
  while(true){ if(isDiaUtil(x)){ const h=x.getHours()+x.getMinutes()/60;
      if(h<8){ x.setHours(8,0,0,0); return x; }
      if(h>=18){ x.setDate(x.getDate()+1); x.setHours(8,0,0,0); continue; }
      return x; }
    x.setDate(x.getDate()+1); x.setHours(8,0,0,0); } }
function normalizar(d){ const x=new Date(d); if(!isDiaUtil(x)) return proximoUtil8h(x);
  const h=x.getHours()+x.getMinutes()/60+x.getSeconds()/3600;
  if(h<8){ x.setHours(8,0,0,0); return x; } if(h>=18) return proximoUtil8h(x); return x; }
function adicionarHorasUteis(inicio, horas){
  let cur=normalizar(new Date(inicio)); let rest=horas*3600;
  while(rest>0){ const fimExp=new Date(cur); fimExp.setHours(18,0,0,0);
    const disp=(fimExp-cur)/1000;
    if(rest<=disp){ cur=new Date(cur.getTime()+rest*1000); break; }
    rest-=disp; cur=new Date(cur); cur.setDate(cur.getDate()+1); cur.setHours(8,0,0,0);
    cur=proximoUtil8h(cur); }
  return cur; }
function duracaoUtilSeg(ini,fim){
  let a=new Date(ini), b=new Date(fim); if(b<=a) return 0; let tot=0;
  let cur=normalizar(a); if(cur>b) cur=b;
  // anda dia a dia
  while(cur<b){ const fimExp=new Date(cur); fimExp.setHours(18,0,0,0);
    const limite=fimExp<b?fimExp:b;
    if(limite>cur) tot+=(limite-cur)/1000;
    cur=new Date(cur); cur.setDate(cur.getDate()+1); cur.setHours(8,0,0,0);
    cur=proximoUtil8h(cur); if(cur>b) break; }
  return Math.round(tot); }

// ---------- supabase (conexão fixa, sem localStorage) ----------
function init(){
  document.querySelectorAll('.tabbtn').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.tab').forEach(t=>t.classList.add('hidden'));
    document.getElementById('tab-'+b.dataset.tab).classList.remove('hidden'); });
  document.getElementById('n_data').value=nowBR(); setView(view);
  if(!window.SUPABASE_URL||window.SUPABASE_URL.includes('COLE_AQUI')){ document.getElementById('tab-board').innerHTML='<div class="bg-white p-4 rounded shadow">Configure <b>config.js</b> com URL e anon key do Supabase e suba no GitHub.</div>'; return; }
  sb=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON); carregar(); startAuto();
  const cd0=document.getElementById('countdown'); if(cd0) cd0.innerText='atualiza em 2:00';
  const rc0=document.getElementById('routerCountdown'); if(rc0) rc0.innerText='atualiza em 2:00'; }
function tick(){ const el=document.getElementById('countdown'); countdownSec--;
  const re=document.getElementById('routerCountdown'); routerSec--;
  if(countdownSec<=0||routerSec<=0){ countdownSec=120; routerSec=120;
    if(el) el.innerText='atualiza em 2:00'; if(re) re.innerText='atualiza em 2:00';
    carregar(); return; }
  if(el) el.innerText='atualiza em '+Math.floor(countdownSec/60)+':'+String(countdownSec%60).padStart(2,'0');
  if(re) re.innerText='atualiza em '+Math.floor(routerSec/60)+':'+String(routerSec%60).padStart(2,'0'); }
function startAuto(){ setInterval(tick,1000); }
function setView(v){ view=v;
  document.getElementById('btnKanban').className='px-3 py-1 rounded text-sm '+(v==='kanban'?'bg-slate-900 text-white':'');
  document.getElementById('btnLista').className='px-3 py-1 rounded text-sm '+(v==='lista'?'bg-slate-900 text-white':'');
  render(); }

async function carregar(){ if(!sb) return;
  const [a,s,f,c,p,au]=await Promise.all([
    sb.from('analistas').select('*').order('nome'),
    sb.from('slas').select('*').order('descricao'),
    sb.from('feriados').select('*').order('mes').order('dia'),
    sb.from('chamados').select('*').order('data_abertura',{ascending:false}),
    sb.from('chamado_pausas').select('*'),
    sb.from('ausencias').select('*')]);
  DB={analistas:a.data||[],slas:s.data||[],feriados:f.data||[],chamados:c.data||[],pausas:p.data||[],ausencias:au.data||[]};
  fillForms(); fillFiltroAnalista(); render(); renderDash(); renderAdmin(); renderRouter(); renderAbertos(); renderResumo(); verificarNumero(); }

function fillFiltroAnalista(){ const el=document.getElementById('filtroAnalista'); if(!el) return;
  const cur=el.value; const orden=[...DB.analistas].sort((a,b)=>a.nome.localeCompare(b.nome));
  el.innerHTML='<option value="">Todos analistas</option>'+orden.map(a=>`<option value="${a.id}">${a.nome}</option>`).join('');
  el.value=cur||''; }

function renderResumo(){ const el=document.getElementById('analistasResumo'); if(!el) return;
  const hoje=new Date(); const soDia=d=>d.getFullYear()===hoje.getFullYear()&&d.getMonth()===hoje.getMonth()&&d.getDate()===hoje.getDate();
  const orden=[...DB.analistas].sort((a,b)=>(isTesteNome(a.nome)-isTesteNome(b.nome))||a.nome.localeCompare(b.nome));
  el.innerHTML=`<table class="w-full"><tr class="bg-slate-200"><th class="p-1 text-left">Analista</th><th>Hoje</th><th>Mês</th><th>Média</th></tr>${orden.map(a=>{
    const rec=DB.chamados.filter(c=>c.analista_id===a.id);
    const h=rec.filter(c=>soDia(new Date(c.data_abertura))).length;
    const m=rec.filter(c=>{ const d=new Date(c.data_abertura); return d.getMonth()===hoje.getMonth()&&d.getFullYear()===hoje.getFullYear(); }).length;
    const dias=diasUteisMes(hoje.getFullYear(),hoje.getMonth(),a.id);
    const tag=a.status!=='ativo'?' (inativo)':(ausenteHoje(a.id)?' (ausente)':'');
    return `<tr class="border-t"><td class="p-1">${a.nome}${tag}</td><td>${h}</td><td>${m}</td><td>${(m/dias).toFixed(2)}</td></tr>`; }).join('')}</table>`; }

function renderRouter(){ const el=document.getElementById('routerList'); if(!el) return;
  const arr=DB.chamados.filter(c=>c.solicitar_devolucao&&c.status==='Aguardando Cliente');
  el.innerHTML=arr.length?arr.map(c=>`<div class="flex justify-between items-center border-b py-1"><span>#${c.numero} — ${nomeAnalista(c.analista_id)} — ${fmtDT(c.data_abertura)}</span><button onclick="acao('${c.id}','devolver')" class="bg-purple-600 text-white px-2 py-0.5 rounded text-xs">Devolver chamado</button></div>`).join(''):'<div class="text-slate-500">Nenhum aguardando devolução.</div>'; }

function renderAbertos(){ const el=document.getElementById('abertosList'); if(!el) return;
  const arr=DB.chamados.filter(c=>c.status!=='Resolvido').sort((a,b)=>new Date(a.data_vencimento)-new Date(b.data_vencimento));
  el.innerHTML=arr.length?`<table class="w-full"><tr class="bg-slate-200"><th class="p-1 text-left">Nº</th><th>Analista</th><th>Status</th><th>Vencimento</th><th></th></tr>${arr.map(c=>`<tr class="border-t ${c.priorizado?'prio':''}"><td class="p-1 font-bold">${c.priorizado?'🔥 ':''}${c.numero}</td><td>${nomeAnalista(c.analista_id)}</td><td>${c.status}${c.solicitar_devolucao?' + devolução':''}</td><td>${fmtDT(c.data_vencimento)}</td><td class="whitespace-nowrap"><button onclick="acao('${c.id}','prio')" class="underline ${c.priorizado?'text-green-700':'text-red-700'} text-xs mr-2">${c.priorizado?'Despriorizar':'Priorizar'}</button><button onclick="abrirRedistUm('${c.id}')" class="underline text-blue-700 text-xs">Redistribuir</button></td></tr>`).join('')}</table>`:'<div class="text-slate-500">Nenhum chamado aberto.</div>'; }

// ---------- distribuição por média ----------
function diasUteisMes(ano,mes,analistaId){
  // dias úteis do mês - feriados - ausências
  let tot=0; const last=new Date(ano,mes+1,0).getDate();
  const aus=DB.ausencias.filter(x=>x.analista_id===analistaId);
  for(let d=1;d<=last;d++){ const dt=new Date(ano,mes,d);
    if(!isDiaUtil(dt)) continue;
    const emAus=aus.some(x=>{ const i=new Date(x.data_inicio),f=new Date(x.data_fim);
      const only=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate());
      return only>=new Date(i.getFullYear(),i.getMonth(),i.getDate())&&only<=new Date(f.getFullYear(),f.getMonth(),f.getDate());});
    if(!emAus) tot++; }
  return tot||1; }
function isTesteNome(n){ return (n||'').trim().toUpperCase()==='TESTE'; }
function isTesteId(id){ const a=DB.analistas.find(x=>x.id===id); return a?isTesteNome(a.nome):false; }
function ausenteHoje(analistaId){ const hoje=new Date(); hoje.setHours(12,0,0,0);
  return DB.ausencias.some(x=>x.analista_id===analistaId&&new Date(x.data_inicio+'T12:00:00')<=hoje&&hoje<=new Date(x.data_fim+'T12:00:00')); }
function analistaDisponivel(a){ return a.status==='ativo'&&!isTesteNome(a.nome)&&!ausenteHoje(a.id); }
function rankingAnalistas(){
  const now=new Date(); const ativos=DB.analistas.filter(analistaDisponivel);
  const map=ativos.map(a=>{
    const rec=DB.chamados.filter(c=>c.analista_id===a.id&&new Date(c.data_abertura).getMonth()===now.getMonth()&&new Date(c.data_abertura).getFullYear()===now.getFullYear()).length;
    const dias=diasUteisMes(now.getFullYear(),now.getMonth(),a.id);
    return {...a,recebidos:rec,dias,media:rec/dias};});
  map.sort((x,y)=>x.media-y.media||x.nome.localeCompare(y.nome)); return map; }

function fillForms(){
  document.getElementById('n_sla').innerHTML=DB.slas.map(s=>`<option value="${s.id}">${s.descricao} — ${s.prazo_horas}h</option>`).join('');
  const rank=rankingAnalistas();
  const teste=DB.analistas.find(a=>isTesteNome(a.nome)&&a.status==='ativo');
  document.getElementById('n_analista').innerHTML=`<option value="">Automático (topo: ${rank[0]?rank[0].nome:'-'})</option>`+rank.map(a=>`<option value="${a.id}">${a.nome} — média ${a.media.toFixed(2)}</option>`).join('')+(teste?`<option value="${teste.id}">TESTE — só para apresentação</option>`:'');
  document.getElementById('au_analista').innerHTML=DB.analistas.map(a=>`<option value="${a.id}">${a.nome}</option>`).join(''); }

// ---------- CRUD chamados ----------
function numeroExiste(n){ return DB.chamados.some(c=>c.numero.toLowerCase()===String(n||'').trim().toLowerCase()); }
function verificarNumero(){ const v=document.getElementById('n_numero').value.trim();
  const av=document.getElementById('n_aviso'), btn=document.getElementById('btnAbrir');
  const dup=v&&numeroExiste(v);
  if(av) av.innerText=dup?'Número já existe. Use outro número.':'';
  if(btn) btn.disabled=!!dup; return dup; }
async function abrirChamado(){
  const numero=document.getElementById('n_numero').value.trim();
  const sla_id=document.getElementById('n_sla').value;
  const dt=parseBR(document.getElementById('n_data').value.trim());
  let analista_id=document.getElementById('n_analista').value||null;
  const msg=document.getElementById('n_msg');
  if(!numero||!sla_id||!dt){ msg.innerText='Preencha nº, SLA e data válida.'; return; }
  if(numeroExiste(numero)){ msg.innerText='Número já existe. Use outro número.'; return; }
  if(!analista_id){ const r=rankingAnalistas(); analista_id=r[0]?r[0].id:null; }
  if(analista_id&&isTesteId(analista_id)){ if(!confirm('O chamado será cadastrado para o analista TESTE. Confirma? (só para apresentação)')) return; }
  else if(analista_id){ const an=DB.analistas.find(a=>a.id===analista_id);
    if(!an||!analistaDisponivel(an)){ msg.innerText='Analista indisponível (inativo ou ausente). Escolha outro.'; return; } }
  const sla=DB.slas.find(s=>s.id===sla_id);
  const venc=adicionarHorasUteis(dt,sla.prazo_horas);
  const {error}=await sb.from('chamados').insert({numero,sla_id,analista_id,status:'Aguardando Atendimento',data_abertura:dt.toISOString(),data_vencimento:venc.toISOString(),priorizado:false});
  msg.innerText=error?'Erro: '+error.message:'Aberto! Vencimento '+fmtDT(venc);
  if(!error){ document.getElementById('n_numero').value=''; carregar(); } }

async function fecharPausaUtil(chamado_id, agora){
  const aberta=DB.pausas.filter(p=>p.chamado_id===chamado_id&&!p.fim).sort((a,b)=>new Date(b.inicio)-new Date(a.inicio))[0];
  let dur=0; if(aberta){ dur=duracaoUtilSeg(aberta.inicio,agora);
    await sb.from('chamado_pausas').update({fim:agora.toISOString(),duracao_util_seg:dur}).eq('id',aberta.id); }
  return dur; }

async function acao(id,tipo){
  const c=DB.chamados.find(x=>x.id===id); if(!c) return;
  const agora=new Date();
  if(tipo==='posse') await sb.from('chamados').update({status:'Em atendimento',data_posse:agora.toISOString(),analista_id:c.analista_id}).eq('id',id);
  if(tipo==='cliente'){ await sb.from('chamados').update({status:'Aguardando Cliente',solicitar_devolucao:false}).eq('id',id);
    await sb.from('chamado_pausas').insert({chamado_id:id,inicio:agora.toISOString()}); }
  if(tipo==='retornar'){ const dur=await fecharPausaUtil(id,agora);
    const novoVenc=adicionarHorasUteis(new Date(c.data_vencimento),dur/3600);
    await sb.from('chamados').update({status:'Em atendimento',data_vencimento:novoVenc.toISOString(),solicitar_devolucao:false}).eq('id',id); }
  if(tipo==='solicitar'){ if(c.status!=='Aguardando Cliente') return alert('Só pode solicitar com status Aguardando Cliente.');
    await sb.from('chamados').update({solicitar_devolucao:true}).eq('id',id); }
  if(tipo==='devolver'){ const dur=await fecharPausaUtil(id,agora);
    const novoVenc=adicionarHorasUteis(new Date(c.data_vencimento),dur/3600);
    await sb.from('chamados').update({status:'Em atendimento',data_vencimento:novoVenc.toISOString(),solicitar_devolucao:false}).eq('id',id); }
  if(tipo==='resolver') await sb.from('chamados').update({status:'Resolvido',data_resolvido:agora.toISOString(),solicitar_devolucao:false}).eq('id',id);
  if(tipo==='prio') await sb.from('chamados').update({priorizado:!c.priorizado}).eq('id',id);
  carregar(); }

// ---------- render ----------
function nomeAnalista(id){ return DB.analistas.find(a=>a.id===id)?.nome||'-'; }
function descSla(id){ const s=DB.slas.find(x=>x.id===id); return s?`${s.descricao} (${s.prazo_horas}h)`:'-'; }
function vencido(c){ return c.status!=='Resolvido'&&new Date(c.data_vencimento)<new Date(); }
// ---------- aging (% do prazo consumido, só tempo útil) ----------
function agingInfo(c){ const sla=DB.slas.find(s=>s.id===c.sla_id); if(!sla||!sla.prazo_horas) return null;
  const total=sla.prazo_horas*3600; if(total<=0) return null;
  const fim=c.status==='Resolvido'&&c.data_resolvido?new Date(c.data_resolvido):new Date();
  let cons=duracaoUtilSeg(c.data_abertura,fim);
  for(const p of DB.pausas.filter(x=>x.chamado_id===c.id)){
    cons-=p.fim?(p.duracao_util_seg||duracaoUtilSeg(p.inicio,p.fim)):duracaoUtilSeg(p.inicio,fim); }
  cons=Math.max(0,cons);
  return {pct:cons/total*100}; }
function agingBar(c){ const a=agingInfo(c); if(!a) return '';
  const p=Math.round(a.pct), w=Math.min(100,p);
  const cor=p<50?'#16a34a':(p<100?'#ca8a04':'#dc2626');
  return `<div class="mt-1"><div class="flex justify-between text-xs"><span>AGING</span><span style="color:${cor};font-weight:bold">${p}%</span></div><div class="h-1.5 bg-slate-200 rounded"><div class="h-1.5 rounded" style="width:${w}%;background:${cor}"></div></div></div>`; }
function card(c){
  const emDev=c.solicitar_devolucao&&c.status==='Aguardando Cliente';
  let btns='';
  if(c.status==='Aguardando Atendimento') btns=`<button onclick="acao('${c.id}','posse')" class="bg-blue-600 text-white px-2 py-0.5 rounded text-xs">Iniciar atendimento</button>`;
  else if(c.status==='Em atendimento') btns=`<button onclick="acao('${c.id}','cliente')" class="bg-amber-500 text-white px-2 py-0.5 rounded text-xs">Ag. Cliente</button> <button onclick="acao('${c.id}','resolver')" class="bg-slate-800 text-white px-2 py-0.5 rounded text-xs">Resolver</button>`;
  else if(emDev) btns='';
  else if(c.status==='Aguardando Cliente') btns=`<button onclick="acao('${c.id}','solicitar')" class="bg-purple-600 text-white px-2 py-0.5 rounded text-xs">Solicitar devolução</button>`;
  else if(c.status==='Resolvido') btns='';
  return `<div class="bg-white p-2 rounded shadow text-sm ${c.priorizado?'prio':''} ${vencido(c)?'vencido':''}">
  <div class="font-bold">${c.priorizado?'🔥 ':''}#${c.numero}</div>
  <div>👤 ${nomeAnalista(c.analista_id)}</div>
  <div>Abert: ${fmtDT(c.data_abertura)}</div>
  <div>Posse: ${fmtDT(c.data_posse)}</div>
  <div>Venc: ${fmtDT(c.data_vencimento)}</div>
  ${c.status==='Resolvido'?`<div>Resolv: ${fmtDT(c.data_resolvido)}</div>`:''}
  ${agingBar(c)}
  ${emDev?'<div class="text-xs font-bold text-purple-700">↩ Aguardando devolução</div>':''}
  ${btns?`<div class="flex flex-wrap gap-1 mt-2">${btns}</div>`:''}</div>`; }

function filtrados(){ const st=document.getElementById('filtroStatus').value; const b=document.getElementById('busca').value.toLowerCase();
  const fa=document.getElementById('filtroAnalista'); const aid=fa?fa.value:'';
  return DB.chamados.filter(c=>(!st||c.status===st)&&(!aid||c.analista_id===aid)&&(!b||c.numero.toLowerCase().includes(b)))
    .sort((a,b)=>(b.priorizado-a.priorizado)||(new Date(a.data_vencimento)-new Date(b.data_vencimento))); }

function render(){ const list=filtrados();
  document.getElementById('kanban').classList.toggle('hidden',view!=='kanban');
  document.getElementById('lista').classList.toggle('hidden',view!=='lista');
  if(view==='kanban'){
    const defs=[
      {t:'Aguardando Atendimento',f:c=>c.status==='Aguardando Atendimento'},
      {t:'Em atendimento',f:c=>c.status==='Em atendimento'},
      {t:'Aguardando Cliente',f:c=>c.status==='Aguardando Cliente'&&!c.solicitar_devolucao},
      {t:'Devolução solicitada',f:c=>c.solicitar_devolucao&&c.status==='Aguardando Cliente'},
      {t:'Resolvido',f:c=>c.status==='Resolvido'}];
    document.getElementById('kanban').innerHTML=defs.map(d=>{ const arr=list.filter(d.f);
      return `<div class="bg-slate-200 rounded p-2"><h3 class="font-bold text-sm mb-2">${d.t} (${arr.length})</h3><div class="space-y-2 kanban-col">${arr.map(card).join('')}</div></div>`; }).join(''); }
  else document.getElementById('lista').innerHTML=`<table class="w-full text-sm"><tr class="bg-slate-200"><th class="p-2 text-left">Nº</th><th>SLA</th><th>Analista</th><th>Status</th><th>Abertura</th><th>Vencimento</th><th>Ações</th></tr>${list.map(c=>`<tr class="border-t ${c.priorizado?'prio':''} ${vencido(c)?'vencido':''}"><td class="p-2 font-bold">${c.priorizado?'🔥 ':''}${c.numero}</td><td>${descSla(c.sla_id)}</td><td>${nomeAnalista(c.analista_id)}</td><td>${c.status}${c.solicitar_devolucao?' + devolução':''}</td><td>${fmtDT(c.data_abertura)}</td><td>${fmtDT(c.data_vencimento)}</td><td class="p-1">${c.status==='Aguardando Atendimento'?`<button onclick="acao('${c.id}','posse')" class="text-blue-700 underline text-xs">Iniciar</button> `:''}${c.status==='Em atendimento'?`<button onclick="acao('${c.id}','cliente')" class="text-amber-700 underline text-xs">Ag.Cliente</button> `:''}${c.status==='Aguardando Cliente'&&!c.solicitar_devolucao?`<button onclick="acao('${c.id}','retornar')" class="text-green-700 underline text-xs">Retornar</button> <button onclick="acao('${c.id}','solicitar')" class="text-purple-700 underline text-xs">Solicitar</button> `:''}${c.status!=='Resolvido'?`<button onclick="acao('${c.id}','resolver')" class="text-slate-800 underline text-xs">Resolver</button>`:''}</td></tr>`).join('')}</table>`; }

// ---------- redistribuir (por chamado, ordem de roteamento) ----------
let redistUmId=null;
function abrirRedistUm(id){ const c=DB.chamados.find(x=>x.id===id); if(!c) return;
  redistUmId=id;
  document.getElementById('modalTitle').innerText='Redistribuir #'+c.numero+' ('+nomeAnalista(c.analista_id)+' → ?)';
  const rank=rankingAnalistas();
  document.getElementById('redistDestino').innerHTML=rank.map(a=>`<option value="${a.id}">${a.nome} — média ${a.media.toFixed(2)}</option>`).join('')||'<option value="">Sem analista disponível</option>';
  document.getElementById('redistList').innerHTML=`<div class="border-b py-1">#${c.numero} — ${c.status} — venc ${fmtDT(c.data_vencimento)}</div><p class="text-xs text-slate-500 mt-2">Ordem de roteamento: menor média primeiro, empate alfabética. Só ativos e presentes.</p>`;
  document.getElementById('modalRedist').classList.remove('hidden'); }
function fecharModal(){ document.getElementById('modalRedist').classList.add('hidden'); redistUmId=null; }
async function confirmarRedist(){ const dest=document.getElementById('redistDestino').value; if(!dest) return alert('Sem analista disponível.');
  if(!redistUmId) return alert('Nenhum chamado selecionado.');
  await sb.from('chamados').update({analista_id:dest}).eq('id',redistUmId);
  fecharModal(); carregar(); }

// ---------- importar resolvidos (CSV) ----------
function abrirModalImport(){ document.getElementById('importResult').innerHTML=''; document.getElementById('modalImport').classList.remove('hidden'); }
function fecharModalImport(){ document.getElementById('modalImport').classList.add('hidden'); }
function normTxt(s){ return (s||'').replace(/ /g,' ').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' '); }
function parseCSVLine(line){ const out=[]; let cur='',q=false;
  for(let i=0;i<line.length;i++){ const ch=line[i];
    if(q){ if(ch==='"'){ if(line[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=ch; }
    else if(ch==='"') q=true; else if(ch===','){ out.push(cur); cur=''; } else cur+=ch; }
  out.push(cur); return out.map(s=>s.trim()); }
async function processarImport(){ const inp=document.getElementById('importFile'); const res=document.getElementById('importResult');
  if(!inp.files.length) return alert('Escolha o arquivo CSV.');
  const text=(await inp.files[0].text()).replace(/^\uFEFF/,'');
  const lines=text.split(/\r?\n/).filter(l=>l.trim()!=='');
  if(lines.length<2){ res.innerText='Arquivo vazio.'; return; }
  const head=normTxt(lines[0]);
  const modo=head.includes('encerramento')?'resolvido':(head.includes('aguardando')?'aguardando':null);
  if(!modo){ res.innerText='Cabeçalho não reconhecido. Use o formato de Resolvidos (encerramento) ou Aguardando (aguardando).'; return; }
  const slaMap={}, anaMap={};
  DB.slas.forEach(s=>slaMap[normTxt(s.descricao)]=s.id);
  DB.analistas.forEach(a=>anaMap[normTxt(a.nome)]=a.id);
  const vistos=new Set(DB.chamados.map(c=>c.numero.toLowerCase()));
  const ok=[], rej=[], pausasPend=[];
  for(let i=1;i<lines.length;i++){ const col=parseCSVLine(lines[i]);
    if(col.length<7){ rej.push(`linha ${i+1}: colunas incompletas`); continue; }
    const [id,ab,po,terceira,ve,desc,prop]=col;
    if(!id){ rej.push(`linha ${i+1}: sem ID`); continue; }
    if(vistos.has(id.toLowerCase())){ rej.push(`${id}: ID duplicado`); continue; }
    const sla_id=slaMap[normTxt(desc)];
    if(!sla_id){ rej.push(`${id}: SLA não cadastrado (${desc})`); continue; }
    const analista_id=anaMap[normTxt(prop)];
    if(!analista_id){ rej.push(`${id}: analista não cadastrado (${prop})`); continue; }
    const dAb=parseBR(ab), dPo=parseBR(po), dX=parseBR(terceira), dVe=parseBR(ve);
    if(!dAb||!dPo||!dX||!dVe){ rej.push(`${id}: data inválida`); continue; }
    vistos.add(id.toLowerCase());
    if(modo==='resolvido') ok.push({numero:id,sla_id,analista_id,status:'Resolvido',data_abertura:dAb.toISOString(),data_posse:dPo.toISOString(),data_resolvido:dX.toISOString(),data_vencimento:dVe.toISOString(),priorizado:false,solicitar_devolucao:false});
    else { ok.push({numero:id,sla_id,analista_id,status:'Aguardando Cliente',data_abertura:dAb.toISOString(),data_posse:dPo.toISOString(),data_vencimento:dVe.toISOString(),priorizado:false,solicitar_devolucao:false});
      pausasPend.push({numero:id,inicio:dX.toISOString()}); } }
  let ins=0;
  for(let k=0;k<ok.length;k+=100){ const {error}=await sb.from('chamados').insert(ok.slice(k,k+100));
    if(error){ res.innerHTML=`Erro ao inserir: ${error.message}`; return; } ins+=Math.min(100,ok.length-k); }
  if(pausasPend.length){ const nums=pausasPend.map(p=>p.numero);
    const {data:ids,error:e2}=await sb.from('chamados').select('id,numero').in('numero',nums);
    if(e2){ res.innerHTML=`Chamados inseridos, mas falha ao registrar pausas: ${e2.message}`; return; }
    const byNum={}; (ids||[]).forEach(r=>byNum[r.numero]=r.id);
    const rows=pausasPend.filter(p=>byNum[p.numero]).map(p=>({chamado_id:byNum[p.numero],inicio:p.inicio}));
    for(let k=0;k<rows.length;k+=100){ const {error:e3}=await sb.from('chamado_pausas').insert(rows.slice(k,k+100));
      if(e3){ res.innerHTML=`Chamados inseridos, mas falha nas pausas: ${e3.message}`; return; } } }
  res.innerHTML=`<div class="font-bold text-green-700 mb-2">${ins} importados (${modo==='resolvido'?'Resolvidos':'Aguardando Cliente'}), ${rej.length} rejeitados.</div>`+(rej.length?`<div class="max-h-60 overflow-auto">${rej.map(r=>`<div class="border-b py-0.5">${r}</div>`).join('')}</div>`:'');
  carregar(); }

// ---------- dashboard / admin (TESTE excluído dos indicadores) ----------
function chamadosEquipe(){ return DB.chamados.filter(c=>!isTesteId(c.analista_id)); }
function renderDash(){ const n=new Date(); const eq=chamadosEquipe(); const mes=eq.filter(c=>new Date(c.data_abertura).getMonth()===n.getMonth());
  const k=[['Abertos',eq.filter(c=>c.status!=='Resolvido').length],['Aguard.Atend.',eq.filter(c=>c.status==='Aguardando Atendimento').length],['Vencidos',eq.filter(vencido).length],['Resolvidos mês',mes.filter(c=>c.status==='Resolvido').length],['No prazo',eq.filter(c=>c.status!=='Resolvido'&&!vencido(c)).length]];
  document.getElementById('kpis').innerHTML=k.map(x=>`<div class="bg-white p-3 rounded shadow text-center"><div class="text-2xl font-bold">${x[1]}</div><div class="text-xs">${x[0]}</div></div>`).join('');
  document.getElementById('mediaTable').innerHTML=`<table class="w-full"><tr class="bg-slate-200"><th class="p-1 text-left">Analista</th><th>Recebidos</th><th>Dias úteis trab.</th><th>Média/dia</th></tr>${[...DB.analistas].filter(a=>!isTesteNome(a.nome)).sort((a,b)=>a.nome.localeCompare(b.nome)).map(a=>{
    const rec=DB.chamados.filter(c=>c.analista_id===a.id&&new Date(c.data_abertura).getMonth()===n.getMonth()&&new Date(c.data_abertura).getFullYear()===n.getFullYear()).length;
    const dias=diasUteisMes(n.getFullYear(),n.getMonth(),a.id);
    const tag=a.status!=='ativo'?' (inativo)':(ausenteHoje(a.id)?' (ausente)':'');
    return `<tr class="border-t"><td class="p-1">${a.nome}${tag}</td><td>${rec}</td><td>${dias}</td><td>${(rec/dias).toFixed(2)}</td></tr>`; }).join('')}</table>`; }

async function addAnalista(){ const nome=document.getElementById('a_nome').value.trim(); const ini=+document.getElementById('a_inicio').value;
  if(!nome) return; await sb.from('analistas').insert({nome,status:'ativo',inicio_expediente:ini}); document.getElementById('a_nome').value=''; carregar(); }
async function toggleAnalista(id,st){ await sb.from('analistas').update({status:st==='ativo'?'inativo':'ativo'}).eq('id',id); carregar(); }
async function alterarInicio(id,atual){ const novo=atual===8?9:8; await sb.from('analistas').update({inicio_expediente:novo}).eq('id',id); carregar(); }
async function excluirAusencia(id){ if(!confirm('Excluir este cadastro de ausência?')) return; await sb.from('ausencias').delete().eq('id',id); carregar(); }
async function editarAusencia(id){ const x=DB.ausencias.find(a=>a.id===id); if(!x) return;
  const ni=prompt('Início dd/mm/yy:',fmtAus(x.data_inicio)); if(ni===null) return;
  const nf=prompt('Fim dd/mm/yy:',fmtAus(x.data_fim)); if(nf===null) return;
  const i=parseAusBR(ni.trim()), f=parseAusBR(nf.trim()); if(!i||!f||f<i) return alert('Datas inválidas.');
  await sb.from('ausencias').update({data_inicio:i.toISOString().slice(0,10),data_fim:f.toISOString().slice(0,10)}).eq('id',id); carregar(); }
function fmtAus(iso){ const d=new Date(iso+'T12:00:00'); const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}`; }
async function addAusencia(){ const analista_id=document.getElementById('au_analista').value;
  const i=parseAusBR(document.getElementById('au_ini').value); const f=parseAusBR(document.getElementById('au_fim').value);
  if(!analista_id||!i||!f) return alert('Datas dd/mm/yy');
  await sb.from('ausencias').insert({analista_id,data_inicio:i.toISOString().slice(0,10),data_fim:f.toISOString().slice(0,10),motivo:document.getElementById('au_mot').value}); carregar(); }
async function addSla(){ const descricao=document.getElementById('s_desc').value.trim(); const prazo=+document.getElementById('s_prazo').value;
  if(!descricao||!prazo) return; await sb.from('slas').insert({descricao,prazo_horas:prazo}); carregar(); }
async function editarSla(id){ const s=DB.slas.find(x=>x.id===id); if(!s) return;
  const np=prompt('Novo prazo em horas úteis:',s.prazo_horas); if(np===null) return;
  const prazo=parseInt(np,10); if(!prazo||prazo<=0) return alert('Prazo inválido.');
  await sb.from('slas').update({prazo_horas:prazo}).eq('id',id); carregar(); }
async function excluirSla(id){ if(DB.chamados.some(c=>c.sla_id===id)) return alert('SLA em uso por chamados, não pode excluir.');
  if(!confirm('Excluir este SLA?')) return; await sb.from('slas').delete().eq('id',id); carregar(); }
function isVariavel(desc){ return (desc||'').toLowerCase().includes('variável')||(desc||'').toLowerCase().includes('variavel'); }
async function editarFeriado(id){ const f=DB.feriados.find(x=>x.id===id); if(!f) return;
  const nd=prompt('Novo dia (1-31):',f.dia); if(nd===null) return;
  const nm=prompt('Novo mês (1-12):',f.mes); if(nm===null) return;
  const dia=parseInt(nd,10), mes=parseInt(nm,10);
  if(!dia||dia<1||dia>31||!mes||mes<1||mes>12) return alert('Dia/mês inválidos.');
  const {error}=await sb.from('feriados').update({dia,mes}).eq('id',id);
  if(error) return alert('Erro: '+error.message+' (já existe feriado nesse dia/mês?)'); carregar(); }
async function addFeriado(){ const dia=+document.getElementById('f_dia').value,mes=+document.getElementById('f_mes').value,descricao=document.getElementById('f_desc').value.trim();
  if(!dia||!mes||!descricao) return; await sb.from('feriados').upsert({dia,mes,descricao},{onConflict:'dia,mes'}); carregar(); }
function renderAdmin(){
  const orden=[...DB.analistas].sort((a,b)=> (isTesteNome(a.nome)-isTesteNome(b.nome)) || a.nome.localeCompare(b.nome));
  document.getElementById('analistasList').innerHTML=orden.map(a=>`<div class="flex flex-wrap justify-between gap-2 border-b py-1"><span>${a.nome} — ${a.status} — início ${a.inicio_expediente}h${isTesteNome(a.nome)?' (TESTE: fora dos indicadores)':''}</span><span class="flex gap-2"><button onclick="alterarInicio('${a.id}',${a.inicio_expediente})" class="underline text-green-700">Alterar 8h/9h</button><button onclick="toggleAnalista('${a.id}','${a.status}')" class="underline text-blue-700">${a.status==='ativo'?'Inativar':'Ativar'}</button></span></div>`).join('');
  document.getElementById('ausList').innerHTML=DB.ausencias.map(x=>`<div class="flex flex-wrap justify-between gap-2 border-b py-1"><span>${nomeAnalista(x.analista_id)}: ${x.data_inicio} → ${x.data_fim} ${x.motivo||''}</span><span class="flex gap-2"><button onclick="editarAusencia('${x.id}')" class="underline text-green-700">Editar</button><button onclick="excluirAusencia('${x.id}')" class="underline text-red-700">Excluir</button></span></div>`).join('');
  document.getElementById('slaList').innerHTML=DB.slas.map(s=>`<div class="flex flex-wrap justify-between gap-2 border-b py-1"><span>${s.descricao} — ${s.prazo_horas}h</span><span class="flex gap-2"><button onclick="editarSla('${s.id}')" class="underline text-green-700">Editar</button><button onclick="excluirSla('${s.id}')" class="underline text-red-700">Excluir</button></span></div>`).join('');
  document.getElementById('ferList').innerHTML=DB.feriados.map(f=>`<div class="flex flex-wrap justify-between gap-2 border-b py-1"><span>${String(f.dia).padStart(2,'0')}/${String(f.mes).padStart(2,'0')} — ${f.descricao}</span>${isVariavel(f.descricao)?`<button onclick="editarFeriado('${f.id}')" class="underline text-green-700">Editar</button>`:''}</div>`).join(''); }

init();
