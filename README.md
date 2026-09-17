# Monitor de Chamados — 100% online (GitHub + Supabase)

## 1. Banco (Supabase, 1 vez)
1. Crie projeto em supabase.com
2. SQL Editor > cole `supabase.sql` > Run
3. Settings > API > copie URL e anon key

## 2. Site (GitHub Pages)
1. Edite `config.js` com URL e anon key do Supabase
2. Suba `index.html`, `app.js`, `config.js` para o repo
3. Settings > Pages > Deploy from branch > main / root
4. Acesse `https://seu-user.github.io/seu-repo` — já abre conectado, sem login, sem configurar nada

## Regras implementadas (v1)
- Sem login, RLS anon aberto
- Chamado: numero único*, SLA select, data abertura dd/mm/yy hh:mm:ss, analista opcional
- Sempre cria `Aguardando Atendimento`; vencimento = abertura + prazo SLA em horas úteis
- Horas úteis 8h-18h, seg-sex, sem feriado. Abriu fora = conta do próx. dia útil 8h. Caiu após 18h = dia seguinte 8h
- Ações: Tomar posse (guarda data_posse), Ag.Cliente (pausa), Retornar (soma pausas úteis e prorroga vencimento), Resolver (final), Priorizar (só 🔥 visual, não muda prazo)
- Pausas múltiplas somadas (tabela chamado_pausas, só tempo útil)
- Distribuição: ranking por média mês atual = recebidos / dias úteis trabalhados (seg-sex - feriados - ausências). Menor no topo. Empate alfabética. Inativos ocultos. Vazio = topo
- Analista: nome, ativo/inativo, início 8h/9h (não muda SLA, só gestão), ausências com início/fim
- SLA: descricao + prazo horas. Feriados: dia/mês/descrição (3 variáveis editáveis)
- View Kanban/Lista com toggle salvo

## Pendente (v2, quando enviar)
- Importador de arquivo
- Regras SLA avançadas, roteamento extra, relatórios tempo abertura->posse
