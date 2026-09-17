let sb=null, DB={analistas:[],slas:[],feriados:[],chamados:[],pausas:[],ausencias:[]};
let view=localStorage.getItem('view')||'kanban';

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

// ---------- supabase ----------
function salvarCfg(){ localStorage.setItem('sb_url',document.getElementById('sb_url').value.trim());
  localStorage.setItem('sb_anon',document.getElementById('sb_anon').value.trim()); location.reload(); }
function init(){ document.getElementById('sb_url').value=window.SUPABASE_URL||'';
  document.getElementById('sb_anon').value=window.SUPABASE_ANON||'';
  document.querySelectorAll('.tabbtn').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.tab').forEach(t=>t.classList.add('hidden'));
    document.getElementById('tab-'+b.dataset.tab).classList.remove('hidden'); });
  document.getElementById('n_data').value=nowBR(); setView(view);
  if(!window.SUPABASE_URL){ document.getElementById('cfgStatus').innerText='Informe URL e anon key.'; return; }
  sb=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON); carregar(); }
function setView(v){ view=v; localStorage.setItem('view',v);
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
  document.getElementById('cfgStatus').innerText=`Conectado: ${DB.chamados.length} chamados.`;
  fillForms(); render(); renderDash(); renderAdmin(); }

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
function rankingAnalistas(){
  const now=new Date(); const ativos=DB.analistas.filter(a=>a.status==='ativo');
  const map=ativos.map(a=>{
    const rec=DB.chamados.filter(c=>c.analista_id===a.id&&new Date(c.data_abertura).getMonth()===now.getMonth()&&new Date(c.data_abertura).getFullYear()===now.getFullYear()).length;
    const dias=diasUteisMes(now.getFullYear(),now.getMonth(),a.id);
    return {...a,recebidos:rec,dias,media:rec/dias};});
  map.sort((x,y)=>x.media-y.media||x.nome.localeCompare(y.nome)); return map; }

function fillForms(){
  document.getElementById('n_sla').innerHTML=DB.slas.map(s=>`<option value="${s.id}">${s.descricao} — ${s.prazo_horas}h</option>`).join('');
  const rank=rankingAnalistas();
  document.getElementById('n_analista').innerHTML=`<option value="">Automático (topo: ${rank[0]?rank[0].nome:'-'})</option>`+rank.map(a=>`<option value="${a.id}">${a.nome} — média ${a.media.toFixed(2)}</option>`).join('');
  document.getElementById('au_analista').innerHTML=DB.analistas.map(a=>`<option value="${a.id}">${a.nome}</option>`).join(''); }

// ---------- CRUD chamados ----------
async function abrirChamado(){
  const numero=document.getElementById('n_numero').value.trim();
  const sla_id=document.getElementById('n_sla').value;
  const dt=parseBR(document.getElementById('n_data').value.trim());
  let analista_id=document.getElementById('n_analista').value||null;
  const msg=document.getElementById('n_msg');
  if(!numero||!sla_id||!dt){ msg.innerText='Preencha nº, SLA e data válida.'; return; }
  if(!analista_id){ const r=rankingAnalistas(); analista_id=r[0]?r[0].id:null; }
  const sla=DB.slas.find(s=>s.id===sla_id);
  const venc=adicionarHorasUteis(dt,sla.prazo_horas);
  const {error}=await sb.from('chamados').insert({numero,sla_id,analista_id,status:'Aguardando Atendimento',data_abertura:dt.toISOString(),data_vencimento:venc.toISOString(),priorizado:false});
  msg.innerText=error?'Erro: '+error.message:'Aberto! Vencimento '+fmtDT(venc);
  if(!error){ document.getElementById('n_numero').value=''; carregar(); } }

async function acao(id,tipo){
  const c=DB.chamados.find(x=>x.id===id); if(!c) return;
  const agora=new Date();
  if(tipo==='posse') await sb.from('chamados').update({status:'Em atendimento',data_posse:agora.toISOString(),analista_id:c.analista_id}).eq('id',id);
  if(tipo==='cliente'){ await sb.from('chamados').update({status:'Aguardando Cliente'}).eq('id',id);
    await sb.from('chamado_pausas').insert({chamado_id:id,inicio:agora.toISOString()}); }
  if(tipo==='retornar'){ const aberta=DB.pausas.filter(p=>p.chamado_id===id&&!p.fim).sort((a,b)=>new Date(b.inicio)-new Date(a.inicio))[0];
    let dur=0; if(aberta){ dur=duracaoUtilSeg(aberta.inicio,agora);
      await sb.from('chamado_pausas').update({fim:agora.toISOString(),duracao_util_seg:dur}).eq('id',aberta.id); }
    const novoVenc=adicionarHorasUteis(new Date(c.data_vencimento),dur/3600);
    await sb.from('chamados').update({status:'Em atendimento',data_vencimento:novoVenc.toISOString()}).eq('id',id); }
  if(tipo==='resolver') await sb.from('chamados').update({status:'Resolvido',data_resolvido:agora.toISOString()}).eq('id',id);
  if(tipo==='prio') await sb.from('chamados').update({priorizado:!c.priorizado}).eq('id',id);
  carregar(); }

// ---------- render ----------
function nomeAnalista(id){ return DB.analistas.find(a=>a.id===id)?.nome||'-'; }
function descSla(id){ const s=DB.slas.find(x=>x.id===id); return s?`${s.descricao} (${s.prazo_horas}h)`:'-'; }
function vencido(c){ return c.status!=='Resolvido'&&new Date(c.data_vencimento)<new Date(); }
function card(c){ return `<div class="bg-white p-2 rounded shadow text-sm ${c.priorizado?'prio':''} ${vencido(c)?'vencido':''}">
  <div class="font-bold">${c.priorizado?'🔥 ':''}#${c.numero}</div>
  <div>${descSla(c.sla_id)}</div>
  <div>👤 ${nomeAnalista(c.analista_id)}</div>
  <div>Abert: ${fmtDT(c.data_abertura)}</div>
  <div>Posse: ${fmtDT(c.data_posse)}</div>
  <div>Venc: ${fmtDT(c.data_vencimento)}</div>
  <div class="flex flex-wrap gap-1 mt-2">
    ${c.status==='Aguardando Atendimento'?`<button onclick="acao('${c.id}','posse')" class="bg-blue-600 text-white px-2 py-0.5 rounded text-xs">Tomar posse</button>`:''}
    ${c.status==='Em atendimento'?`<button onclick="acao('${c.id}','cliente')" class="bg-amber-500 text-white px-2 py-0.5 rounded text-xs">Ag. Cliente</button>`:''}
    ${c.status==='Aguardando Cliente'?`<button onclick="acao('${c.id}','retornar')" class="bg-green-600 text-white px-2 py-0.5 rounded text-xs">Retornar</button>`:''}
    ${c.status!=='Resolvido'?`<button onclick="acao('${c.id}','resolver')" class="bg-slate-800 text-white px-2 py-0.5 rounded text-xs">Resolver</button>`:''}
    <button onclick="acao('${c.id}','prio')" class="border px-2 py-0.5 rounded text-xs">${c.priorizado?'Despriorizar':'Priorizar'}</button>
  </div></div>`; }

function filtrados(){ const st=document.getElementById('filtroStatus').value; const b=document.getElementById('busca').value.toLowerCase();
  return DB.chamados.filter(c=>(!st||c.status===st)&&(!b||c.numero.toLowerCase().includes(b)))
    .sort((a,b)=>(b.priorizado-a.priorizado)||(new Date(a.data_vencimento)-new Date(b.data_vencimento))); }

function render(){ const list=filtrados();
  document.getElementById('kanban').classList.toggle('hidden',view!=='kanban');
  document.getElementById('lista').classList.toggle('hidden',view!=='lista');
  if(view==='kanban'){ const cols=['Aguardando Atendimento','Em atendimento','Aguardando Cliente','Resolvido'];
    document.getElementById('kanban').innerHTML=cols.map(s=>`<div class="bg-slate-200 rounded p-2"><h3 class="font-bold text-sm mb-2">${s} (${list.filter(c=>c.status===s).length})</h3><div class="space-y-2 kanban-col">${list.filter(c=>c.status===s).map(card).join('')}</div></div>`).join(''); }
  else document.getElementById('lista').innerHTML=`<table class="w-full text-sm"><tr class="bg-slate-200"><th class="p-2 text-left">Nº</th><th>SLA</th><th>Analista</th><th>Status</th><th>Abertura</th><th>Vencimento</th><th>Ações</th></tr>${list.map(c=>`<tr class="border-t ${c.priorizado?'prio':''} ${vencido(c)?'vencido':''}"><td class="p-2 font-bold">${c.priorizado?'🔥 ':''}${c.numero}</td><td>${descSla(c.sla_id)}</td><td>${nomeAnalista(c.analista_id)}</td><td>${c.status}</td><td>${fmtDT(c.data_abertura)}</td><td>${fmtDT(c.data_vencimento)}</td><td class="p-1">${c.status==='Aguardando Atendimento'?`<button onclick="acao('${c.id}','posse')" class="text-blue-700 underline text-xs">Posse</button> `:''}${c.status==='Em atendimento'?`<button onclick="acao('${c.id}','cliente')" class="text-amber-700 underline text-xs">Ag.Cliente</button> `:''}${c.status==='Aguardando Cliente'?`<button onclick="acao('${c.id}','retornar')" class="text-green-700 underline text-xs">Retornar</button> `:''}${c.status!=='Resolvido'?`<button onclick="acao('${c.id}','resolver')" class="text-slate-800 underline text-xs">Resolver</button>`:''}</td></tr>`).join('')}</table>`; }

// ---------- dashboard / admin ----------
function renderDash(){ const n=new Date(); const mes=DB.chamados.filter(c=>new Date(c.data_abertura).getMonth()===n.getMonth());
  const k=[['Abertos',DB.chamados.filter(c=>c.status!=='Resolvido').length],['Aguard.Atend.',DB.chamados.filter(c=>c.status==='Aguardando Atendimento').length],['Vencidos',DB.chamados.filter(vencido).length],['Resolvidos mês',mes.filter(c=>c.status==='Resolvido').length],['No prazo',DB.chamados.filter(c=>c.status!=='Resolvido'&&!vencido(c)).length]];
  document.getElementById('kpis').innerHTML=k.map(x=>`<div class="bg-white p-3 rounded shadow text-center"><div class="text-2xl font-bold">${x[1]}</div><div class="text-xs">${x[0]}</div></div>`).join('');
  document.getElementById('mediaTable').innerHTML=`<table class="w-full"><tr class="bg-slate-200"><th class="p-1 text-left">Analista</th><th>Recebidos</th><th>Dias úteis trab.</th><th>Média/dia</th></tr>${rankingAnalistas().map(a=>`<tr class="border-t"><td class="p-1">${a.nome}</td><td>${a.recebidos}</td><td>${a.dias}</td><td>${a.media.toFixed(2)}</td></tr>`).join('')}</table>`; }

async function addAnalista(){ const nome=document.getElementById('a_nome').value.trim(); const ini=+document.getElementById('a_inicio').value;
  if(!nome) return; await sb.from('analistas').insert({nome,status:'ativo',inicio_expediente:ini}); document.getElementById('a_nome').value=''; carregar(); }
async function toggleAnalista(id,st){ await sb.from('analistas').update({status:st==='ativo'?'inativo':'ativo'}).eq('id',id); carregar(); }
async function addAusencia(){ const analista_id=document.getElementById('au_analista').value;
  const i=parseAusBR(document.getElementById('au_ini').value); const f=parseAusBR(document.getElementById('au_fim').value);
  if(!analista_id||!i||!f) return alert('Datas dd/mm/yy');
  await sb.from('ausencias').insert({analista_id,data_inicio:i.toISOString().slice(0,10),data_fim:f.toISOString().slice(0,10),motivo:document.getElementById('au_mot').value}); carregar(); }
async function addSla(){ const descricao=document.getElementById('s_desc').value.trim(); const prazo=+document.getElementById('s_prazo').value;
  if(!descricao||!prazo) return; await sb.from('slas').insert({descricao,prazo_horas:prazo}); carregar(); }
async function addFeriado(){ const dia=+document.getElementById('f_dia').value,mes=+document.getElementById('f_mes').value,descricao=document.getElementById('f_desc').value.trim();
  if(!dia||!mes||!descricao) return; await sb.from('feriados').upsert({dia,mes,descricao},{onConflict:'dia,mes'}); carregar(); }
function renderAdmin(){
  document.getElementById('analistasList').innerHTML=DB.analistas.map(a=>`<div class="flex justify-between border-b py-1"><span>${a.nome} — ${a.status} — início ${a.inicio_expediente}h</span><button onclick="toggleAnalista('${a.id}','${a.status}')" class="underline text-blue-700">${a.status==='ativo'?'Inativar':'Ativar'}</button></div>`).join('');
  document.getElementById('ausList').innerHTML=DB.ausencias.map(x=>`<div class="border-b py-1">${nomeAnalista(x.analista_id)}: ${x.data_inicio} → ${x.data_fim} ${x.motivo||''}</div>`).join('');
  document.getElementById('slaList').innerHTML=DB.slas.map(s=>`<div class="border-b py-1">${s.descricao} — ${s.prazo_horas}h</div>`).join('');
  document.getElementById('ferList').innerHTML=DB.feriados.map(f=>`<div class="border-b py-1">${String(f.dia).padStart(2,'0')}/${String(f.mes).padStart(2,'0')} — ${f.descricao}</div>`).join(''); }

init();
