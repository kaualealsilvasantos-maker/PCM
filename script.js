/* PCM — script.js  |  Correções completas + notificações */

// ========================
// Persistência
// ========================
const LS_KEY = 'pcm_v2';

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    inventario, plano, os, fornecedores,
    lastUpdated: new Date().toISOString()
  }));
  // MELHORIA 2: atualiza backup automático a cada salvamento
  try {
    localStorage.setItem(LS_AUTO_BACKUP, JSON.stringify(buildBackupPayload()));
  } catch { /* ignora se localStorage cheio */ }
}

// ========================
// Estado
// ========================
let inventario = [];
let plano = [];
let os = [];
let fornecedores = [];

// ========================
// Draft (edição sem afetar o estado central até clicar em Salvar)
// ========================
let inventarioDraft = null;
let planoDraft = null;
let hasDraftInventario = false;
let hasDraftPlano = false;

function ensureInventarioDraft() {
  if (!inventarioDraft) inventarioDraft = JSON.parse(JSON.stringify(inventario));
  hasDraftInventario = true;
}

function ensurePlanoDraft() {
  if (!planoDraft) planoDraft = JSON.parse(JSON.stringify(plano));
  hasDraftPlano = true;
}

function getInventarioSource() {
  return (inventarioDraft && hasDraftInventario) ? inventarioDraft : inventario;
}

function getPlanoSource() {
  return (planoDraft && hasDraftPlano) ? planoDraft : plano;
}

function salvarInventarioDraft() {
  if (!inventarioDraft || !hasDraftInventario) return;
  inventario = inventarioDraft;
  inventarioDraft = null;
  hasDraftInventario = false;

  // Re-sincroniza TAG/Equipamento no Plano para garantir reconhecimento imediato após salvar.
  // Mantém a arquitetura atual: inventario/plano são a fonte central.
  // 1) remove planos que não têm mais equipamento correspondente
  plano = plano.filter(p => {
    const inv = getInventarioParaPlano(p);
    return !!inv;
  });

  // 2) garante recomputação e renderizações globais
  // recomputeAndRender() já faz saveState(). Remover saveState() duplicado evita commits redundantes.
  recomputeAndRender();
}



function salvarPlanoDraft() {
  if (!planoDraft || !hasDraftPlano) return;
  plano = planoDraft;
  planoDraft = null;
  hasDraftPlano = false;

  // recomputeAndRender() já faz saveState().
  recomputeAndRender();
}



// ========================
// Utilitários gerais
// ========================
function getEl(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toNumber(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// CORREÇÃO: trava de faixa para os campos G, U, T (1 a 5).
// O atributo HTML min/max do <input> é apenas visual e não impede
// digitação manual de valores fora da faixa, o que quebrava o cálculo de GUT.
function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function toGUTValue(v) {
  return clamp(toNumber(v), 1, 5);
}

// ========================
// Datas — FIX TIMEZONE
//
// O bug clássico: new Date('2026-07-26') interpreta como UTC meia-noite,
// e ao exibir no fuso de São Paulo (UTC-3) vira 25/07.
// Solução: parsear a string ISO manualmente, sem conversão de fuso.
// ========================
function parseDateLocal(value) {
  // Aceita: 'YYYY-MM-DD' (vindo de input[type=date])
  //         Date object
  //         ISO string completo (do JSON.stringify de Date)
  if (!value) return null;
  if (value instanceof Date && !isNaN(value)) return localDateOnly(value);

  const s = String(value).trim();
  if (!s) return null;

  // YYYY-MM-DD  (entrada do input[type=date])
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return new Date(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3])
    );
  }

  // ISO completo (vindo do localStorage: "2026-07-26T03:00:00.000Z")
  // Pega apenas a parte de data e constrói local
  const isoFull = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoFull) {
    return new Date(
      Number(isoFull[1]),
      Number(isoFull[2]) - 1,
      Number(isoFull[3])
    );
  }

  // dd/mm/yyyy
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const y = br[3].length === 2 ? '20' + br[3] : br[3];
    return new Date(Number(y), Number(br[2]) - 1, Number(br[1]));
  }

  return null;
}

function localDateOnly(d) {
  // Garante que não há hora no objeto para evitar desvios
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toISODate(d) {
  // Converte para 'YYYY-MM-DD' para uso em input[type=date] — sempre local
  const date = parseDateLocal(d);
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatDateBR(d) {
  const date = parseDateLocal(d);
  if (!date) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function addDays(date, days) {
  const d = parseDateLocal(date);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a, b) {
  // Diferença em dias (a - b)
  const da = parseDateLocal(a);
  const db = parseDateLocal(b);
  if (!da || !db) return null;
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

function hoje() {
  return localDateOnly(new Date());
}

// ========================
// GUT e Criticidade
// ========================
function calcularGUT(l) {
  const G = toGUTValue(l.G);
  const U = toGUTValue(l.U);
  const T = toGUTValue(l.T);
  l.G = G; l.U = U; l.T = T;
  const gut = G * U * T;
  l.GUT = gut;
  l.criticidade = classificarCriticidade(gut);
}

function classificarCriticidade(gut) {
  if (gut <= 0)   return 'Baixa';
  if (gut <= 39)  return 'Baixa';
  if (gut <= 79)  return 'Média';
  if (gut <= 124) return 'Alta';
  return 'Crítica';
}

// ========================
// Periodicidade
// ========================
const PERIODICIDADES = ['Semanal','Quinzenal','Mensal','Bimestral','Trimestral','Semestral','Anual'];

// MANTIDO para compatibilidade com buildBadge e diffDays (aproximação em dias)
function periodicidadeToDays(p) {
  const map = { Semanal:7, Quinzenal:15, Mensal:30, Bimestral:60, Trimestral:90, Semestral:180, Anual:365 };
  return map[p] ?? null;
}

// Calcula Próxima Data usando calendário real (meses e anos exatos)
// Exemplos: 24/06/2026 + Mensal = 24/07/2026; + Semestral = 24/12/2026; + Anual = 24/06/2027
function addPeriodo(date, periodicidade) {
  const d = parseDateLocal(date);
  if (!d) return null;
  switch (periodicidade) {
    case 'Semanal':    return addDays(d, 7);
    case 'Quinzenal':  return addDays(d, 15);
    case 'Mensal':     return addMeses(d, 1);
    case 'Bimestral':  return addMeses(d, 2);
    case 'Trimestral': return addMeses(d, 3);
    case 'Semestral':  return addMeses(d, 6);
    case 'Anual':      return addMeses(d, 12);
    default:           return null;
  }
}

function addMeses(date, meses) {
  const d = parseDateLocal(date);
  if (!d) return null;
  // Preserva o dia original; se o mês destino não tem esse dia, usa o último dia
  const dia = d.getDate();
  const novoMes = d.getMonth() + meses;
  const ano = d.getFullYear() + Math.floor(novoMes / 12);
  const mes = ((novoMes % 12) + 12) % 12;
  // Testa se o dia existe no mês destino
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  return new Date(ano, mes, Math.min(dia, ultimo));
}

// ========================
// Cruzamento Inventário × Plano
// ========================
function normalizeKey(s) {
  return String(s ?? '').trim().toLowerCase();
}

function getPlanoParaEquip(linhaInv) {
  const tagInv = normalizeKey(linhaInv.tag);
  if (tagInv) {
    const byTag = plano.find(p => normalizeKey(p.tag) === tagInv);
    if (byTag) return byTag;
  }
  const equipInv = normalizeKey(linhaInv.equipamento);
  if (!equipInv) return null;
  return plano.find(p => normalizeKey(p.equipamento) === equipInv) || null;
}

// ========================
// FONTE ÚNICA DE VERDADE — Cálculo de Próxima Manutenção
// ========================
//
// Esta é a ÚNICA função que calcula próxima manutenção no sistema inteiro.
// Todas as telas (Inventário, Plano PCM, Notificações, Cronograma) consomem
// este resultado — nunca recalculam por conta própria.
//
// Diferente de addPeriodo() simples, esta função avança iterativamente até
// encontrar a primeira ocorrência >= hoje, garantindo que equipamentos cuja
// última manutenção foi há muitos períodos mostrem a data FUTURA correta,
// não a primeira ocorrência passada.
//
// Retorna: { proxima: Date, diff: number, status: 'late'|'near'|'today'|'ok' }
// ou null se dados insuficientes.
function calcularStatusManutencao(linhaInv) {
  const p = getPlanoParaEquip(linhaInv);
  if (!linhaInv.ultimaManutencao || !p?.periodicidade) return null;

  const base = parseDateLocal(linhaInv.ultimaManutencao);
  if (!base) return null;

  const h = hoje();
  let current = addPeriodo(base, p.periodicidade);
  let guard = 0;

  // Avança até encontrar a primeira ocorrência >= hoje
  while (current && diffDays(current, h) < 0 && guard < 2000) {
    guard++;
    current = addPeriodo(current, p.periodicidade);
  }

  if (!current) return null;

  const diff = diffDays(current, h); // positivo = futuro, 0 = hoje, negativo = atrasado
  let status;
  if (diff === 0)  status = 'today';
  else if (diff < 0)  status = 'late';
  else if (diff <= 7) status = 'near';
  else                status = 'ok';

  return { proxima: current, diff, status };
}

// Wrapper que atualiza linhaInv.proximaManutencao a partir da função canônica
function calcularProximaManutencao(linhaInv) {
  const res = calcularStatusManutencao(linhaInv);
  linhaInv.proximaManutencao = res?.proxima ?? null;
}

// Usado pelo Plano PCM — mesma lógica, via getInventarioParaPlano
function calcularProximaDataPlano(p) {
  const inv = getInventarioParaPlano(p);
  if (!inv) return null;
  const res = calcularStatusManutencao(inv);
  return res?.proxima ?? null;
}

// ========================
// Badge de manutenção
// ========================
// Aceita: Date, string de data, ou objeto {proxima, diff} de calcularStatusManutencao.
function buildBadge(dataOuStatus) {
  if (!dataOuStatus) return null;

  let diff, proxima;
  if (dataOuStatus instanceof Date || typeof dataOuStatus === 'string') {
    proxima = parseDateLocal(dataOuStatus);
    if (!proxima) return null;
    diff = diffDays(proxima, hoje());
  } else {
    // objeto {proxima, diff, status}
    proxima = dataOuStatus.proxima;
    diff    = dataOuStatus.diff;
  }

  if (diff === null) return null;
  if (diff < 0)   return { kind: 'late', label: '🔴 Atrasada',        extra: `Atrasada há ${Math.abs(diff)} dia(s)`,               days: diff };
  if (diff === 0) return { kind: 'near', label: '🔵 Hoje',            extra: `Programada para hoje — ${formatDateBR(proxima)}`,     days: diff };
  if (diff <= 7)  return { kind: 'near', label: '🟡 Revisão próxima', extra: `Faltam ${diff} dia(s) — ${formatDateBR(proxima)}`,    days: diff };
  return               { kind: 'ok',   label: '🟢 Em dia',           extra: `Em ${diff} dia(s) — ${formatDateBR(proxima)}`,        days: diff };
}

// ========================
// Recomputar todos
// ========================
function atualizarComputados(l) {
  calcularGUT(l);

  const res = calcularStatusManutencao(l);
  l.proximaManutencao = res?.proxima ?? null;
  l._manutStatus = res; // cache: usado por notificações e badge sem recalcular

  if (l.statusManual) return;

  if (!res) {
    l.status = 'Pendente';
    return;
  }
  // Status automático: atrasado ou próximo → Em Manutenção; ok → Operando
  if (res.status === 'late' || res.status === 'near' || res.status === 'today') {
    l.status = 'Em Manutenção';
  } else {
    l.status = 'Operando';
  }
}

function recomputeAll() {
  inventario.forEach(l => atualizarComputados(l));
}

// ========================
// NOTIFICAÇÕES
// ========================
// Consome o cache _manutStatus já calculado por recomputeAll() — zero recálculo.
function atualizarNotificacoes() {
  const alertas = [];
  for (const l of inventario) {
    const res = l._manutStatus;
    if (!res) continue;
    const badge = buildBadge(res);
    if (!badge || badge.kind === 'ok') continue;
    alertas.push({ equip: l.equipamento || l.tag || '(sem nome)', badge });
  }
  // Atrasadas (diff < 0) primeiro, depois hoje, depois próximas
  alertas.sort((a, b) => a.badge.days - b.badge.days);

  const badgeEl = getEl('notifBadge');
  const listEl  = getEl('notifList');

  if (alertas.length === 0) {
    badgeEl.style.display = 'none';
    listEl.innerHTML = '<div class="notif-empty">Nenhuma notificação pendente.</div>';
    return;
  }

  badgeEl.style.display = 'inline-block';
  badgeEl.textContent   = alertas.length;

  listEl.innerHTML = alertas.map(a => `
    <div class="notif-item ${a.badge.kind}">
      <div class="notif-item-icon">${a.badge.days < 0 ? '🚨' : a.badge.days === 0 ? '🔵' : '⚠️'}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${escapeHtml(a.equip)}</div>
        <div class="notif-item-sub">${escapeHtml(a.badge.extra)}</div>
      </div>
    </div>
  `).join('');
}

function toggleNotifPanel() {
  const panel = getEl('notifPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Fecha painel ao clicar fora
document.addEventListener('click', e => {
  const wrap = getEl('notifWrap');
  if (wrap && !wrap.contains(e.target)) {
    const panel = getEl('notifPanel');
    if (panel) panel.style.display = 'none';
  }
});

function exibirToastInicial() {
  // Usa o cache já calculado por recomputeAll — sem recalcular
  const atrasadas = inventario.filter(l => l._manutStatus?.status === 'late');
  const proximas  = inventario.filter(l => l._manutStatus?.status === 'near' || l._manutStatus?.status === 'today');

  let msg = '';
  if (atrasadas.length > 0) msg += `🚨 ${atrasadas.length} manutenção(ões) atrasada(s). `;
  if (proximas.length  > 0) msg += `⚠️ ${proximas.length} manutenção(ões) vence(m) em até 7 dias.`;

  if (!msg) return;
  const toast = getEl('toastAlert');
  getEl('toastMsg').textContent = msg.trim();
  toast.style.display = 'flex';
  setTimeout(() => { toast.style.display = 'none'; }, 8000);
}

// ========================
// RENDER — helpers de célula
// ========================
function criarTdText(value, setter) {
  const td = document.createElement('td');
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = value ?? '';
  // CORREÇÃO BUG: usar 'blur' e NÃO chamar rerender durante digitação
  // Apenas salva o dado no objeto; render só ocorre ao sair do campo
          inp.addEventListener('input', () => { ensureInventarioDraft(); setter(inp.value); });
          inp.addEventListener('blur', () => { ensureInventarioDraft(); setter(inp.value); });




  td.appendChild(inp);
  return td;
}

function criarTdNum(value, min, max, setter) {
  const td = document.createElement('td');
  const inp = document.createElement('input');
  inp.type = 'number';
  if (min !== undefined) inp.min = min;
  if (max !== undefined) inp.max = max;
  inp.step = '1';
  inp.value = value ?? '';
  inp.addEventListener('input', () => setter(toNumber(inp.value)));
  td.appendChild(inp);
  return td;
}

function criarTdSelect(value, options, setter) {
  const td = document.createElement('td');
  const sel = document.createElement('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => setter(sel.value));
  td.appendChild(sel);
  return td;
}

function criarBtnExcluir(cb) {
  const td = document.createElement('td');
  td.style.width = '40px';
  const btn = document.createElement('button');
  btn.className = 'btn btn-danger btn-sm';
  btn.title = 'Excluir';
  btn.textContent = '✕';
  btn.addEventListener('click', cb);
  td.appendChild(btn);
  return td;
}

// ========================
// RENDER — Inventário (transposto)
// ========================
function renderInventario() {
  const tbody = getEl('tbodyInventario');
  tbody.innerHTML = '';

  const emptyEl = getEl('emptyInventario');
  const invSource = getInventarioSource();

  if (invSource.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  const linhas = [...invSource].sort((a, b) => String(a.tag ?? '').localeCompare(String(b.tag ?? '')));


  const atributos = [
    { key: 'tag', label: 'TAG', type: 'text' },
    { key: 'equipamento', label: 'Equipamento', type: 'text' },
    { key: 'fabricante', label: 'Fabricante', type: 'text' },
    { key: 'modelo', label: 'Modelo', type: 'text' },
    { key: 'nSerie', label: 'N° Série', type: 'text' },
    { key: 'patrimonio', label: 'Patrimônio', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['Operando','Em Manutenção','Pendente'] },
    { key: 'G', label: 'G (1-5)', type: 'number' },
    { key: 'U', label: 'U (1-5)', type: 'number' },
    { key: 'T', label: 'T (1-5)', type: 'number' },
    { key: 'GUT', label: 'GUT', type: 'readonly' },
    { key: 'criticidade', label: 'Criticidade', type: 'readonly' },
    { key: 'setor', label: 'Setor', type: 'text' },
    { key: 'responsavel', label: 'Responsável', type: 'text' },
    { key: 'ultimaManutencao', label: 'Última Manut.', type: 'date' },
    { key: 'proximaManutencao', label: 'Próxima Manut.', type: 'badge' },
    { key: '__del', label: '', type: 'del' }
  ];

  atributos.forEach(attr => {
    const tr = document.createElement('tr');

    // Coluna de label fixo
    const tdLabel = document.createElement('td');
    tdLabel.className = 'col-fixed';
    tdLabel.textContent = attr.label;
    tr.appendChild(tdLabel);

    linhas.forEach(l => {
      const td = document.createElement('td');
      td.className = 'col-equip';

      switch (attr.type) {
        case 'text': {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = l[attr.key] ?? '';
          // Atualiza dado no input; não re-renderiza a tabela
          inp.addEventListener('input', () => { l[attr.key] = inp.value; });
          inp.addEventListener('blur', () => {
            const oldVal = l[attr.key];
            l[attr.key] = inp.value;
            // MELHORIA 1: propaga alterações de TAG e Equipamento para o Plano (somente no draft)
            if (attr.key === 'tag' || attr.key === 'equipamento') {
              if (!planoDraft && plano.length > 0) ensurePlanoDraft();
              if (planoDraft) {
                planoDraft.forEach(p => {
                  if (attr.key === 'tag' && normalizeKey(p.tag) === normalizeKey(oldVal)) p.tag = inp.value;
                  if (attr.key === 'equipamento' && normalizeKey(p.equipamento) === normalizeKey(oldVal)) p.equipamento = inp.value;
                });
              }
            }
            renderInventario();
          });

          td.appendChild(inp);
          break;
        }
        case 'number': {
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.min = 1; inp.max = 5; inp.step = 1;
          inp.value = l[attr.key] ?? 1;
          inp.style.width = '70px';
          inp.addEventListener('input', () => {
            ensureInventarioDraft();
            l[attr.key] = toGUTValue(inp.value);
            // Atualiza apenas os campos readonly sem re-renderizar a tabela
            atualizarReadonlysPorEquip(l);
          });

          td.appendChild(inp);
          break;
        }
        case 'select': {
          const sel = document.createElement('select');
          ['Operando','Em Manutenção','Pendente'].forEach(opt => {
            const o = document.createElement('option');
            o.value = opt; o.textContent = opt;
            if (opt === (l.status ?? 'Operando')) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', () => {
            ensureInventarioDraft();
            l.statusManual = true;
            l.status = sel.value;
            recomputeAll();
            renderDashboard();
          });

          td.appendChild(sel);
          break;
        }
        case 'readonly': {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.readOnly = true;
          inp.className = 'readonly-inp';
          inp.value = l[attr.key] ?? '';
          inp.dataset.equip = l.tag || l.equipamento;
          inp.dataset.attr = attr.key;
          td.appendChild(inp);
          break;
        }
        case 'date': {
          const inp = document.createElement('input');
          inp.type = 'date';
          // FIX TIMEZONE: usar toISODate que constrói a partir do objeto local
          inp.value = toISODate(l.ultimaManutencao);
          inp.addEventListener('change', () => {
            ensureInventarioDraft();
            // FIX: parsear como data local, não UTC
            l.ultimaManutencao = inp.value ? parseDateLocal(inp.value) : null;
            // CORREÇÃO: registrar uma nova manutenção destrava o status manual,
            // permitindo que o cálculo automático (Operando/Em Manutenção/Pendente)
            // volte a valer. Antes, uma vez marcado manualmente, o status ficava
            // travado para sempre, mesmo após a manutenção ser concluída.
            l.statusManual = false;
            // Não propaga no estado central até clicar em Salvar
            renderInventario();
          });

          td.appendChild(inp);
          break;
        }
        case 'badge': {
          const badge = buildBadge(l.proximaManutencao);
          if (badge) {
            td.innerHTML = `
              <span class="badge ${badge.kind}">${escapeHtml(badge.label)}</span>
              <div class="badge-sub">${escapeHtml(badge.extra)}</div>
            `;
          }
          break;
        }
        case 'del': {
          const btn = document.createElement('button');
          btn.className = 'btn btn-danger btn-sm';
          btn.textContent = '✕';
          btn.title = 'Excluir equipamento';
          btn.addEventListener('click', () => {
            if (confirm('Excluir este equipamento? O plano vinculado a ele também será removido.')) {
              ensureInventarioDraft();
              const src = getInventarioSource();
              const idx = src.indexOf(l);
              if (idx > -1) {
                // remove da edição (draft)
                src.splice(idx, 1);
              }
              // remove planos vinculados também apenas no draft do Plano (se existir)
              if (planoDraft) {
                sincronizarRemocaoPlano(l);
              }
              renderInventario();
            }
          });

          td.appendChild(btn);
          break;
        }
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// Atualiza somente os campos readonly (GUT, criticidade) sem re-renderizar a tabela toda
function atualizarReadonlysPorEquip(l) {
  document.querySelectorAll(`input[data-attr="GUT"]`).forEach(inp => {
    const key = inp.dataset.equip;
    const equip = inventario.find(e => (e.tag || e.equipamento) === key);
    if (equip) inp.value = equip.GUT ?? '';
  });
  document.querySelectorAll(`input[data-attr="criticidade"]`).forEach(inp => {
    const key = inp.dataset.equip;
    const equip = inventario.find(e => (e.tag || e.equipamento) === key);
    if (equip) inp.value = equip.criticidade ?? '';
  });
}

// ========================
// RENDER — Plano PCM
// ========================
function renderPlano() {
  const tbody = getEl('tbodyPlano');
  tbody.innerHTML = '';

  const emptyEl = getEl('emptyPlano');
  const planoSource = getPlanoSource();
  if (planoSource.length === 0) { emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';

  planoSource.forEach((p, idx) => {

    const tr = document.createElement('tr');

    // TAG — somente leitura, vinda do Inventário
    const tdTag = document.createElement('td');
    tdTag.innerHTML = `<span style="font-weight:700;color:#1d4ed8;font-size:13px;">${escapeHtml(p.tag || '—')}</span>`;
    tr.appendChild(tdTag);

    // Equipamento — somente leitura, vindo do Inventário
    const tdEquip = document.createElement('td');
    tdEquip.innerHTML = `<span style="font-size:13px;color:#374151;">${escapeHtml(p.equipamento || '—')}</span>`;
    tr.appendChild(tdEquip);

    // Periodicidade — editável
    tr.appendChild(criarTdSelect(p.periodicidade, PERIODICIDADES, v => {
      ensurePlanoDraft();
      p.periodicidade = v;
      // Não propaga no estado central até clicar em Salvar
      renderPlano();
    }));


    // Atividade — editável
    const tdAtiv = document.createElement('td');
    const inpAtiv = document.createElement('input');
    inpAtiv.type = 'text';
    inpAtiv.value = p.atividade ?? '';
    inpAtiv.addEventListener('input', () => { ensurePlanoDraft(); p.atividade = inpAtiv.value; });
    inpAtiv.addEventListener('blur', () => { ensurePlanoDraft(); p.atividade = inpAtiv.value; renderPlano(); });
    tdAtiv.appendChild(inpAtiv);

    tr.appendChild(tdAtiv);

    // Responsável — editável
    const tdResp = document.createElement('td');
    const inpResp = document.createElement('input');
    inpResp.type = 'text';
    inpResp.value = p.responsavel ?? '';
    inpResp.addEventListener('input', () => { ensurePlanoDraft(); p.responsavel = inpResp.value; });
    inpResp.addEventListener('blur', () => { ensurePlanoDraft(); p.responsavel = inpResp.value; renderPlano(); });
    tdResp.appendChild(inpResp);

    tr.appendChild(tdResp);

    // Próxima Data (calculada — readonly)
    const tdProx = document.createElement('td');
    const proxDate = calcularProximaDataPlano(p);
    if (proxDate) {
      const badge = buildBadge(proxDate);
      tdProx.innerHTML = `
        <div style="font-weight:600;font-size:13px">${formatDateBR(proxDate)}</div>
        ${badge ? `<div class="badge-sub">${escapeHtml(badge.extra)}</div>` : ''}
      `;
    } else {
      const inv = getInventarioParaPlano(p);
      const msg = !inv
        ? '<span style="color:#ef4444;font-size:12px">Equipamento não encontrado</span>'
        : !inv.ultimaManutencao
          ? '<span style="color:#9ca3af;font-size:12px">Aguardando última manutenção</span>'
          : '<span style="color:#9ca3af;font-size:12px">Selecione a periodicidade</span>';
      tdProx.innerHTML = msg;
    }
    tr.appendChild(tdProx);

    // Excluir
    tr.appendChild(criarBtnExcluir(() => {
      if (confirm('Excluir este plano?')) {
        ensurePlanoDraft();
        // remove do draft (se existir); idx é do array planoSource que aponta para draft/plano
        const src = getPlanoSource();
        src.splice(idx, 1);
        renderPlano();
      };

    }));

    tbody.appendChild(tr);
  });
}

// CORREÇÃO: usa a mesma prioridade de busca (TAG primeiro, depois nome)
// que getPlanoParaEquip(), evitando resultados divergentes entre as telas
// de Inventário e Plano PCM quando TAG e nome apontam para equipamentos diferentes.
function getInventarioParaPlano(p) {
  const tagP = normalizeKey(p.tag);
  if (tagP) {
    const byTag = inventario.find(l => normalizeKey(l.tag) === tagP);
    if (byTag) return byTag;
  }
  const equipP = normalizeKey(p.equipamento);
  if (!equipP) return null;
  return inventario.find(l => normalizeKey(l.equipamento) === equipP) || null;
}

// ========================
// RENDER — OS
// ========================
function renderOS() {
  const tbody = getEl('tbodyOS');
  tbody.innerHTML = '';

  const emptyEl = getEl('emptyOS');
  if (os.length === 0) { emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';

  os.forEach((o, idx) => {
    const tr = document.createElement('tr');

    // Nº OS
    const tdNum = document.createElement('td');
    const inpNum = document.createElement('input');
    inpNum.type = 'text'; inpNum.value = o.numero ?? '';
    inpNum.addEventListener('input', () => { o.numero = inpNum.value; });
    inpNum.addEventListener('blur', () => saveState());
    tdNum.appendChild(inpNum);
    tr.appendChild(tdNum);

    // Data
    const tdData = document.createElement('td');
    const inpData = document.createElement('input');
    inpData.type = 'date';
    inpData.value = toISODate(o.data);
    inpData.addEventListener('change', () => {
      o.data = inpData.value ? parseDateLocal(inpData.value) : null;
      saveState();
    });
    tdData.appendChild(inpData);
    tr.appendChild(tdData);

    // Equipamento
    const tdEquip = document.createElement('td');
    const inpEquip = document.createElement('input');
    inpEquip.type = 'text'; inpEquip.value = o.equipamento ?? '';
    inpEquip.addEventListener('input', () => { o.equipamento = inpEquip.value; });
    inpEquip.addEventListener('blur', () => saveState());
    tdEquip.appendChild(inpEquip);
    tr.appendChild(tdEquip);

    // Tipo
    const tdTipo = document.createElement('td');
    const inpTipo = document.createElement('input');
    inpTipo.type = 'text'; inpTipo.value = o.tipo ?? '';
    inpTipo.addEventListener('input', () => { o.tipo = inpTipo.value; });
    inpTipo.addEventListener('blur', () => saveState());
    tdTipo.appendChild(inpTipo);
    tr.appendChild(tdTipo);

    // Descrição
    const tdDesc = document.createElement('td');
    const inpDesc = document.createElement('input');
    inpDesc.type = 'text'; inpDesc.value = o.descricao ?? '';
    inpDesc.addEventListener('input', () => { o.descricao = inpDesc.value; });
    inpDesc.addEventListener('blur', () => saveState());
    tdDesc.appendChild(inpDesc);
    tr.appendChild(tdDesc);

    // Horas
    const tdHoras = document.createElement('td');
    const inpHoras = document.createElement('input');
    inpHoras.type = 'number'; inpHoras.min = 0; inpHoras.step = 0.5;
    inpHoras.value = o.horas ?? 0; inpHoras.style.width = '80px';
    inpHoras.addEventListener('input', () => { o.horas = toNumber(inpHoras.value); });
    inpHoras.addEventListener('blur', () => saveState());
    tdHoras.appendChild(inpHoras);
    tr.appendChild(tdHoras);

    // Custo
    const tdCusto = document.createElement('td');
    const inpCusto = document.createElement('input');
    inpCusto.type = 'number'; inpCusto.min = 0; inpCusto.step = 0.01;
    inpCusto.value = o.custo ?? 0; inpCusto.style.width = '100px';
    inpCusto.addEventListener('input', () => { o.custo = toNumber(inpCusto.value); });
    inpCusto.addEventListener('blur', () => saveState());
    tdCusto.appendChild(inpCusto);
    tr.appendChild(tdCusto);

    // Status
    tr.appendChild(criarTdSelect(o.status ?? 'Aberta', ['Aberta','Em Andamento','Concluída','Cancelada'], v => {
      o.status = v; saveState();
    }));

    // Excluir
    tr.appendChild(criarBtnExcluir(() => {
      if (confirm('Excluir esta OS?')) {
        os.splice(idx, 1);
        renderOS();
        saveState();
      }
    }));

    tbody.appendChild(tr);
  });
}

// ========================
// RENDER — Fornecedores
// ========================
function renderFornecedores() {
  const tbody = getEl('tbodyFornecedores');
  tbody.innerHTML = '';

  const emptyEl = getEl('emptyForn');
  if (fornecedores.length === 0) { emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';

  fornecedores.forEach((f, idx) => {
    const tr = document.createElement('tr');

    const campos = [
      { key: 'nome', type: 'text' },
      { key: 'contato', type: 'text' },
      { key: 'telefone', type: 'tel' },
      { key: 'email', type: 'email' },
      { key: 'servico', type: 'text' },
      { key: 'observacoes', type: 'text' }
    ];

    campos.forEach(c => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = c.type; inp.value = f[c.key] ?? '';
      inp.addEventListener('input', () => { f[c.key] = inp.value; });
      inp.addEventListener('blur', () => saveState());
      td.appendChild(inp);
      tr.appendChild(td);
    });

    tr.appendChild(criarBtnExcluir(() => {
      if (confirm('Excluir este fornecedor?')) {
        fornecedores.splice(idx, 1);
        renderFornecedores();
        saveState();
      }
    }));

    tbody.appendChild(tr);
  });
}

// ========================
// RENDER — Dashboard
// ========================
let chartStatus = null;
let chartCrit = null;

function renderDashboard() {
  recomputeAll();

  const total = inventario.length;
  const operando = inventario.filter(l => l.status === 'Operando').length;
  const manut = inventario.filter(l => l.status === 'Em Manutenção').length;
  const pend = inventario.filter(l => l.status === 'Pendente').length;

  getEl('kpiTotal').textContent = total;
  getEl('kpiOperando').textContent = operando;
  getEl('kpiManut').textContent = manut;
  getEl('kpiPend').textContent = pend;

  // Qtd por tipo
  const map = new Map();
  for (const l of inventario) {
    const key = String(l.equipamento ?? '').trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  const qtdArr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const qtdEl = getEl('qtdEquipamentos');
  qtdEl.innerHTML = qtdArr.length
    ? qtdArr.slice(0, 50).map(([k, v]) =>
        `<div class="qtd-item"><span>${escapeHtml(k)}</span><b>${v} un</b></div>`
      ).join('')
    : '<div style="color:#9ca3af;font-size:13px">Sem dados de equipamentos.</div>';

  // Gráfico pizza
  const ctxStatus = getEl('graficoStatus');
  if (chartStatus) chartStatus.destroy();
  chartStatus = new Chart(ctxStatus, {
    type: 'pie',
    data: {
      labels: ['Operando','Em Manutenção','Pendente'],
      datasets: [{ data: [operando, manut, pend], backgroundColor: ['#16a34a','#d97706','#94a3b8'] }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } }
    }
  });

  // Gráfico barra criticidade
  const critLabels = ['Baixa','Média','Alta','Crítica'];
  const critCounts = { Baixa:0, Média:0, Alta:0, Crítica:0 };
  for (const l of inventario) {
    const c = l.criticidade ?? 'Baixa';
    if (critCounts[c] !== undefined) critCounts[c]++;
  }

  const ctxGut = getEl('graficoGut');
  if (chartCrit) chartCrit.destroy();
  chartCrit = new Chart(ctxGut, {
    type: 'bar',
    data: {
      labels: critLabels,
      datasets: [{
        label: 'Equipamentos',
        data: critLabels.map(k => critCounts[k] || 0),
        backgroundColor: ['#22c55e','#f59e0b','#f97316','#ef4444'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

// ========================
// Render completo
// ========================
function recomputeAndRender(save = true) {
  recomputeAll();
  renderInventario();
  renderPlano();
  renderOS();
  renderFornecedores();
  renderDashboard();
  atualizarNotificacoes();
  // Atualiza cronograma se a aba estiver ativa
  if (getEl('cronograma')?.classList.contains('active')) renderCronograma();
  if (save) saveState();
}

// ========================
// CRUD — Adicionar
// ========================
function adicionarEquipamento() {
  inventario.push({
    tag: '', equipamento: '', fabricante: '', modelo: '',
    nSerie: '', patrimonio: '', status: 'Operando', statusManual: false,
    G: 1, U: 1, T: 1, GUT: 1, criticidade: 'Baixa',
    setor: '', responsavel: '',
    ultimaManutencao: null, proximaManutencao: null
  });
  recomputeAndRender();
}

function adicionarPlano() {
  // Monta lista de equipamentos do Inventário ainda sem plano
  const equipsSemPlano = inventario.filter(inv => {
    if (!inv.tag && !inv.equipamento) return false;
    return !plano.some(p =>
      (inv.tag && normalizeKey(p.tag) === normalizeKey(inv.tag)) ||
      (inv.equipamento && normalizeKey(p.equipamento) === normalizeKey(inv.equipamento))
    );
  });

  if (equipsSemPlano.length === 0 && inventario.length > 0) {
    mostrarToast('Todos os equipamentos já possuem plano cadastrado.', '✅');
    return;
  }
  if (inventario.length === 0) {
    mostrarToast('Cadastre equipamentos no Inventário antes de criar um Plano.', '⚠️');
    return;
  }

  // Abre modal de seleção
  abrirModalSelecionarEquipamento(equipsSemPlano);
}

function abrirModalSelecionarEquipamento(equips) {
  // Remove modal anterior se existir
  const old = document.getElementById('modalSelecionarEquip');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modalSelecionarEquip';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;
    display:flex;align-items:center;justify-content:center;padding:16px;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);
    width:100%;max-width:480px;max-height:80vh;display:flex;flex-direction:column;
    overflow:hidden;
  `;

  modal.innerHTML = `
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:15px;font-weight:800;color:#1a1a2e;">Adicionar ao Plano PCM</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Selecione o equipamento</div>
      </div>
      <button id="btnFecharModalEquip" style="background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280;padding:4px 8px;border-radius:6px;">✕</button>
    </div>
    <div style="overflow-y:auto;flex:1;padding:12px 16px;display:flex;flex-direction:column;gap:6px;" id="listaEquipsModal">
      ${equips.length === 0
        ? `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">Todos os equipamentos já têm plano.</div>`
        : equips.map((inv, i) => `
          <button class="modal-equip-btn" data-idx="${i}" style="
            text-align:left;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;
            background:#fff;cursor:pointer;transition:background .12s,border-color .12s;
            display:flex;flex-direction:column;gap:2px;
          ">
            <span style="font-weight:700;font-size:13px;color:#1d4ed8;">${escapeHtml(inv.tag || '—')}</span>
            <span style="font-size:12px;color:#374151;">${escapeHtml(inv.equipamento || 'Sem nome')}</span>
            ${inv.setor ? `<span style="font-size:11px;color:#9ca3af;">${escapeHtml(inv.setor)}</span>` : ''}
          </button>
        `).join('')}
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Hover nos botões de equipamento
  modal.querySelectorAll('.modal-equip-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#eff6ff';
      btn.style.borderColor = '#93c5fd';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#fff';
      btn.style.borderColor = '#e5e7eb';
    });
    btn.addEventListener('click', () => {
      const inv = equips[parseInt(btn.dataset.idx)];
      ensurePlanoDraft();

      planoDraft.push({
        tag: inv.tag ?? '',
        equipamento: inv.equipamento ?? '',
        periodicidade: 'Mensal',
        atividade: '',
        responsavel: inv.responsavel ?? ''
      });

      overlay.remove();
      renderPlano();
    });
  });

  document.getElementById('btnFecharModalEquip').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function mostrarToast(msg, icon = 'ℹ️') {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;top:calc(var(--topbar-h) + 12px);left:50%;transform:translateX(-50%);
    background:#1e293b;color:#fff;border-radius:10px;padding:12px 20px;
    display:flex;align-items:center;gap:10px;z-index:700;
    box-shadow:0 4px 12px rgba(0,0,0,.2);font-size:13px;font-weight:600;
    animation:slideDown .3s ease;white-space:nowrap;
  `;
  t.innerHTML = `<span>${icon}</span><span>${escapeHtml(msg)}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ========================
// MELHORIA 1 — Sincronização Inventário → Plano
// ========================

// Remove do Plano todas as entradas vinculadas a um equipamento do Inventário
function sincronizarRemocaoPlano(linhaInv) {
  const tagInv = normalizeKey(linhaInv.tag);
  const equipInv = normalizeKey(linhaInv.equipamento);
  for (let i = plano.length - 1; i >= 0; i--) {
    const p = plano[i];
    const match =
      (tagInv && normalizeKey(p.tag) === tagInv) ||
      (equipInv && normalizeKey(p.equipamento) === equipInv);
    if (match) plano.splice(i, 1);
  }
}

// Propaga alteração de TAG ou Equipamento do Inventário para o Plano
function sincronizarEdicaoPlano(linhaInv, campo, oldVal, newVal) {
  if (normalizeKey(oldVal) === normalizeKey(newVal)) return;
  plano.forEach(p => {
    if (campo === 'tag' && normalizeKey(p.tag) === normalizeKey(oldVal)) {
      p.tag = newVal;
    }
    if (campo === 'equipamento' && normalizeKey(p.equipamento) === normalizeKey(oldVal)) {
      p.equipamento = newVal;
    }
  });
}

// ========================
// MELHORIA 2 — Sistema de Backup e Restauração JSON
// ========================

const LS_AUTO_BACKUP = 'pcm_v2_autobackup';

// Serializa estado completo para objeto JSON
function buildBackupPayload() {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    inventario: inventario.map(l => ({
      ...l,
      ultimaManutencao: toISODate(l.ultimaManutencao) || null,
      proximaManutencao: toISODate(l.proximaManutencao) || null
    })),
    plano,
    os: os.map(o => ({ ...o, data: toISODate(o.data) || null })),
    fornecedores
  };
}

// ========================
// Exportar Backup (JSON)
// ========================
function exportarBackup() {
  const payload = buildBackupPayload();
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2,'0');
  const mm = String(hoje.getMonth()+1).padStart(2,'0');
  const yyyy = hoje.getFullYear();
  const nome = `pcm_backup_${yyyy}${mm}${dd}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast(`Backup exportado: ${nome}`, '📥');
}

// ========================
// Importar Backup (JSON)
// ========================
function importarBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!validarBackup(data)) {
          mostrarToast('Arquivo inválido ou corrompido.', '❌');
          return;
        }
        abrirModalConfirmacaoRestore(data);
      } catch {
        mostrarToast('Erro ao ler o arquivo JSON.', '❌');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function validarBackup(data) {
  return data && (Array.isArray(data.inventario) || Array.isArray(data.plano));
}

function aplicarBackup(data) {
  inventario = Array.isArray(data.inventario) ? data.inventario : [];
  plano = Array.isArray(data.plano) ? data.plano : [];
  os = Array.isArray(data.os) ? data.os : [];
  fornecedores = Array.isArray(data.fornecedores) ? data.fornecedores : [];

  // Normaliza datas
  for (const l of inventario) {
    l.ultimaManutencao = parseDateLocal(l.ultimaManutencao);
    l.proximaManutencao = null;
  }
  for (const o of os) {
    o.data = parseDateLocal(o.data);
  }

  recomputeAndRender();
  saveState();
}

function abrirModalConfirmacaoRestore(data) {
  const old = document.getElementById('modalRestoreConfirm');
  if (old) old.remove();

  const totalEquip = Array.isArray(data.inventario) ? data.inventario.length : 0;
  const totalPlano = Array.isArray(data.plano) ? data.plano.length : 0;
  const totalOS = Array.isArray(data.os) ? data.os.length : 0;
  const exportDate = data.exportedAt
    ? new Date(data.exportedAt).toLocaleString('pt-BR')
    : 'data desconhecida';

  const overlay = document.createElement('div');
  overlay.id = 'modalRestoreConfirm';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:950;
    display:flex;align-items:center;justify-content:center;padding:16px;
  `;

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.22);
                width:100%;max-width:420px;overflow:hidden;">
      <div style="background:#dc2626;padding:16px 20px;">
        <div style="font-size:15px;font-weight:800;color:#fff;">⚠️ Restaurar Backup</div>
        <div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:2px;">Esta ação substituirá todos os dados atuais.</div>
      </div>
      <div style="padding:20px;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#991b1b;">
          Exportado em: <strong>${exportDate}</strong><br>
          ${totalEquip} equipamentos · ${totalPlano} planos · ${totalOS} ordens de serviço
        </div>
        <p style="font-size:13px;color:#374151;margin-bottom:16px;">
          Deseja substituir <strong>todos os dados atuais</strong> pelos dados deste backup?<br>
          <span style="color:#6b7280;font-size:12px;">Os dados atuais serão perdidos permanentemente.</span>
        </p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="btnCancelarRestore" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;color:#374151;">Cancelar</button>
          <button id="btnConfirmarRestore" style="padding:9px 18px;border:none;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer;font-size:13px;font-weight:700;">Restaurar dados</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById('btnCancelarRestore').onclick = () => overlay.remove();
  document.getElementById('btnConfirmarRestore').onclick = () => {
    overlay.remove();
    aplicarBackup(data);
    mostrarToast('Backup restaurado com sucesso!', '✅');
  };
}

// ========================
// Restaurar último backup automático
// ========================
function restaurarAutoBackup() {
  try {
    const raw = localStorage.getItem(LS_AUTO_BACKUP);
    if (!raw) { mostrarToast('Nenhum backup automático encontrado.', '⚠️'); return; }
    const data = JSON.parse(raw);
    if (!validarBackup(data)) { mostrarToast('Backup automático inválido.', '❌'); return; }
    abrirModalConfirmacaoRestore(data);
  } catch {
    mostrarToast('Erro ao acessar backup automático.', '❌');
  }
}

// Painel do backup (dropdown pequeno na topbar)
function toggleBackupPanel() {
  const existing = document.getElementById('backupPanel');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('btnBackup');
  const rect = btn.getBoundingClientRect();

  const panel = document.createElement('div');
  panel.id = 'backupPanel';
  panel.style.cssText = `
    position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;
    background:#fff;border:1px solid #e5e7eb;border-radius:12px;
    box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:500;min-width:210px;overflow:hidden;
  `;

  const items = [
    { icon: '📥', label: 'Exportar Backup', fn: () => { panel.remove(); exportarBackup(); } },
    { icon: '📤', label: 'Restaurar Backup', fn: () => { panel.remove(); importarBackup(); } },
    { icon: '🔄', label: 'Restaurar Auto-Backup', fn: () => { panel.remove(); restaurarAutoBackup(); } },
  ];

  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display:flex;align-items:center;gap:10px;width:100%;padding:11px 16px;
      background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;
      color:#374151;text-align:left;transition:background .1s;
      ${i < items.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}
    `;
    btn.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
    btn.onmouseenter = () => btn.style.background = '#f8fafc';
    btn.onmouseleave = () => btn.style.background = 'none';
    btn.onclick = item.fn;
    panel.appendChild(btn);
  });

  document.body.appendChild(panel);
  setTimeout(() => document.addEventListener('click', function closer(e) {
    if (!panel.contains(e.target) && e.target.id !== 'btnBackup') {
      panel.remove();
      document.removeEventListener('click', closer);
    }
  }), 10);
}

function adicionarOS() {
  // CORREÇÃO: usar o maior número já existente (não o length),
  // evitando números repetidos após exclusões.
  const maiorNum = os.reduce((max, o) => {
    const n = parseInt(String(o.numero ?? '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const n = maiorNum + 1;
  os.push({
    numero: String(n).padStart(4, '0'),
    data: null, equipamento: '', tipo: '',
    descricao: '', horas: 0, custo: 0, status: 'Aberta'
  });
  renderOS();
  saveState();
}

function adicionarFornecedor() {
  fornecedores.push({
    nome: '', contato: '', telefone: '',
    email: '', servico: '', observacoes: ''
  });
  renderFornecedores();
  saveState();
}

// ========================
// Navegação
// ========================
function abrirTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  getEl(id).classList.add('active');
  const btn = document.querySelector(`.nav-btn[data-tab="${id}"]`);
  if (btn) btn.classList.add('active');
  if (id === 'dash') renderDashboard();
  if (id === 'cronograma') renderCronograma();
}

// ========================
// Init
// ========================
function initFromStorage() {
  const saved = loadState();
  if (!saved) return;

  inventario = Array.isArray(saved.inventario) ? saved.inventario : [];
  plano = Array.isArray(saved.plano) ? saved.plano : [];
  os = Array.isArray(saved.os) ? saved.os : [];
  fornecedores = Array.isArray(saved.fornecedores) ? saved.fornecedores : [];

  // Normaliza datas do JSON para objetos Date locais (sem conversão UTC)
  for (const l of inventario) {
    l.ultimaManutencao = parseDateLocal(l.ultimaManutencao);
    l.proximaManutencao = null; // recalculado
  }
  for (const o of os) {
    o.data = parseDateLocal(o.data);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initFromStorage();
  recomputeAndRender(false);

  setTimeout(() => {
    exibirToastInicial();
  }, 800);

  window.addEventListener('beforeunload', () => saveState());
});

// ========================
// CRONOGRAMA ANUAL
// ========================

let cronogramaAno = new Date().getFullYear();
let painelProxAberto = false;

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── Geração de datas ─────────────────────────────────────────────────────────
// Itera a partir da última manutenção e coleta todas as ocorrências no ano alvo.
// O loop não reinicia: parte sempre da data base e avança indefinidamente até
// ultrapassar o fim do ano alvo, garantindo continuidade em qualquer ano futuro.
function gerarDatasCronograma(linhaInv, planoLinha, ano) {
  if (!linhaInv.ultimaManutencao || !planoLinha?.periodicidade) return [];
  const base = parseDateLocal(linhaInv.ultimaManutencao);
  if (!base) return [];

  const inicioAno = new Date(ano, 0, 1);
  const fimAno    = new Date(ano, 11, 31);
  const datas = [];

  // Origem: a ÚLTIMA manutenção cadastrada.
  // Gera continuidade avançando em cima da própria sequência (não reinicia por mês atual).
  // Sempre começando na PRÓXIMA ocorrência após a base.
  let current = addPeriodo(base, planoLinha.periodicidade);
  let guard = 0;

  // Avança até ficar dentro/antes do ano alvo (primeira ocorrência >= inicioAno)
  while (current && current < inicioAno && guard < 20000) {
    guard++;
    current = addPeriodo(current, planoLinha.periodicidade);
  }

  // Coleta todas as ocorrências do ano alvo, avançando sem reiniciar.
  while (current && current <= fimAno && guard < 20000) {
    guard++;
    if (current.getFullYear() === ano) {
      datas.push(new Date(current.getTime()));
    }
    current = addPeriodo(current, planoLinha.periodicidade);
  }

  return datas;
}


// ── Classificação por situação ────────────────────────────────────────────────
// Compara cada data com hoje; funciona corretamente para qualquer ano.
function classificarData(d) {
  const diff = diffDays(d, hoje());
  if (diff === null) return 'ok';
  if (diff === 0)  return 'today';
  if (diff < 0)   return 'late';
  if (diff <= 7)  return 'near';
  return 'ok';
}

function chipClass(tipo) {
  const map = { today: 'chip-today', late: 'chip-late', near: 'chip-near' };
  return map[tipo] ?? 'chip-ok';
}

// Situação geral do equipamento para o filtro de Situação no Cronograma.
// Usa calcularStatusManutencao — mesma lógica do Inventário e Notificações.
function situacaoGeral(linhaInv) {
  // Não depende de cache stale durante troca de filtros/ano no Cronograma.
  // Mantém consistência com o estado calculado atual.
  // (Cache será recalculado somente após commit via Salvar.)
  const res = calcularStatusManutencao(linhaInv);
  return res?.status ?? 'ok';
}


// ── Build de linhas ───────────────────────────────────────────────────────────
// Fonte única: Inventário × Plano PCM. Nenhum dado próprio do cronograma.
function buildLinhasCronograma() {
  const linhas = [];
  for (const inv of inventario) {
    const p = getPlanoParaEquip(inv);
    if (!p?.periodicidade || !inv.ultimaManutencao) continue;

    const datas  = gerarDatasCronograma(inv, p, cronogramaAno);
    const porMes = Array.from({ length: 12 }, () => []);
    for (const d of datas) porMes[d.getMonth()].push(d);

    const equipRaw = String(inv.equipamento ?? '').trim();
    const respRaw  = String(p.responsavel ?? inv.responsavel ?? '').trim();

    linhas.push({
      inv,
      plano: p,
      tag:   String(inv.tag ?? '').trim() || '—',

      // Valores reais para FISIOLOGIA DOS FILTROS (NUNCA use '—' como valor de filtro)
      equip: equipRaw,
      resp:  respRaw,

      // Valores de exibição (podem conter '—')
      equipLabel: equipRaw || '—',
      respLabel:  respRaw  || '—',

      freq:  p.periodicidade,
      porMes,
      datas,
      situacao: situacaoGeral(inv) // usa calcularStatusManutencao internamente
    });
  }
  return linhas;
}


// ── Filtros ───────────────────────────────────────────────────────────────────
// IMPORTANTE: Os selects são sempre populados a partir da lista COMPLETA de
// equipamentos cadastrados — nunca a partir de uma lista já filtrada.
// Recebe todasLinhas como parâmetro para não reconstruir a lista duas vezes.
function popularFiltrosCronograma(todasLinhas) {
  const selEquip = getEl('filtroEquip');
  const selResp  = getEl('filtroResp');
  if (!selEquip || !selResp) return;

  const norm = v => String(v ?? '').trim();

  // Captura os valores ANTES de reconstruir o innerHTML
  const prevEquip = norm(selEquip.value);
  const prevResp  = norm(selResp.value);

  const equips = [...new Set(todasLinhas.map(l => l.equip).map(norm).filter(Boolean))].sort();
  const resps  = [...new Set(todasLinhas.map(l => l.resp).map(norm).filter(Boolean))].sort();


  selEquip.innerHTML = '<option value="">Todos</option>' +
    equips.map(e => `<option value="${escapeHtml(e)}"${e === prevEquip ? ' selected' : ''}>${escapeHtml(e)}</option>`).join('');

  selResp.innerHTML = '<option value="">Todos</option>' +
    resps.map(r => `<option value="${escapeHtml(r)}"${r === prevResp ? ' selected' : ''}>${escapeHtml(r)}</option>`).join('');

  // Restaura explicitamente os valores após reconstrução
  selEquip.value = prevEquip || '';
  selResp.value  = prevResp  || '';
}


// Aplica filtros sempre sobre a lista original completa, nunca sobre resultado parcial.
// Ordem: lista completa → Equipamento → Situação → Responsável → renderiza.
function aplicarFiltros(todasLinhas) {
  const filtEquip = String(getEl('filtroEquip')?.value ?? '').trim();
  const filtSit   = String(getEl('filtroSituacao')?.value ?? '').trim();
  const filtResp  = String(getEl('filtroResp')?.value ?? '').trim();

  const norm = v => String(v ?? '').trim();

  return todasLinhas.filter(l => {
    const equipNorm = norm(l.equip);
    const respNorm  = norm(l.resp);

    // Equipamento: '' = Todos
    if (filtEquip !== '' && equipNorm !== filtEquip) return false;

    // Responsável: '' = Todos
    if (filtResp !== '' && respNorm !== filtResp) return false;

    // Situação: '' = Todas (usa l.situacao já calculado por situacaoGeral)
    if (filtSit !== '') {
      if (filtSit === 'ok'   && l.situacao !== 'ok')   return false;
      if (filtSit === 'near' && l.situacao !== 'near') return false;
      if (filtSit === 'late' && l.situacao !== 'late') return false;
    }

    return true;
  });
}



// ── Render principal ──────────────────────────────────────────────────────────
// Reconstrói a tabela inteira a cada chamada. Fonte única: buildLinhasCronograma().
// Fluxo: lista completa → popular selects (preservando seleção) → filtrar → renderizar.
function renderCronograma() {
  // Evita que a atualização de filtros/painel lateral quebre o estado visual do calendário.
  const freqAutoWrap = getEl('freqAutoWrap');
  const freqAutoValor = getEl('freqAutoValor');
  if (freqAutoWrap && freqAutoValor) {
    freqAutoWrap.style.display = 'none';
    freqAutoValor.textContent = '';
  }
  // Cronograma sempre deve refletir o estado CENTRAL confirmado,
  // não rascunhos do usuário.
  // (Não usamos inventarioDraft/planoDraft aqui intencionalmente.)
  const anoLabel = getEl('cronogramaAnoLabel');

  // DIAGNÓSTICO (temporário): rastrear fluxo de render do Cronograma
  console.log('[Cronograma] renderCronograma() chamado. cronogramaAno=', cronogramaAno);


  if (anoLabel) anoLabel.textContent = cronogramaAno;

  // 1. Constrói a lista COMPLETA (fonte única de verdade)
  const todasLinhas = buildLinhasCronograma();

  // 2. Popula os selects a partir da lista completa, preservando seleção atual
  popularFiltrosCronograma(todasLinhas);

  // 3. Lê os valores dos filtros APÓS popular (garante que os values estão corretos)
  const filtEquip = (getEl('filtroEquip')?.value  ?? '').trim();
  const filtSit   = (getEl('filtroSituacao')?.value ?? '').trim();
  const filtResp  = (getEl('filtroResp')?.value ?? '').trim();


  // 4. Indicador automático de frequência (só quando um equipamento específico está filtrado)
  const freqWrap  = getEl('freqAutoWrap');
  const freqValor = getEl('freqAutoValor');
  if (freqWrap && freqValor) {
      if (filtEquip) {
      const norm = v => String(v ?? '').trim();
      const linhaEquip = todasLinhas.find(l => norm(l.equip) === norm(filtEquip));
      freqValor.textContent = linhaEquip?.freq ?? '';
      freqWrap.style.display = linhaEquip ? 'flex' : 'none';
    } else {
      freqWrap.style.display = 'none';
    }
  }


  // 5. Aplica filtros sobre a lista completa
  const linhas = aplicarFiltros(todasLinhas);

// DEBUG TEMPORÁRIO — divergência de filtros no cronograma
  console.log("Ano:", cronogramaAno);
  console.log("Filtro Equipamento:", filtEquip);
  console.log("Todas:", todasLinhas.length);
  console.log("Filtradas:", linhas.length);
  console.table(
    linhas.map(l => ({
      tag: l.tag,
      equip: l.equip,
      resp: l.resp,
      situacao: l.situacao
    }))
  );

  const wrap = getEl('cronogramaWrap');

  // `emptyCronograma` pode não existir no HTML (ou pode variar conforme versões).
  // O Cronograma deve continuar renderizando mesmo sem ele.
  const empty = getEl('emptyCronograma');

  if (!wrap) {
    console.error('[Cronograma] cronogramaWrap ausente. render abortado.');
    return;
  }

  if (linhas.length === 0) {
    // Sem dependência do elemento vazio estático:
    // renderiza mensagem dinâmica dentro do container.
    wrap.innerHTML = '<div class="empty-state" style="padding:48px 24px;text-align:center;color:#6b7280;background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin-top:2px;">Nenhum dado disponível.</div>';
    return;
  }

  if (empty) empty.style.display = 'none';


  const mesAtual = new Date().getMonth();
  const anoAtual = new Date().getFullYear();


  const table = document.createElement('table');
  table.className = 'cron-table';

  // Cabeçalho
  const thead  = document.createElement('thead');
  const trHead = document.createElement('tr');

  const thInfo = document.createElement('th');
  thInfo.className = 'cron-th-info';
  thInfo.textContent = 'Equipamento';
  trHead.appendChild(thInfo);

  MESES_ABREV.forEach((m, i) => {
    const th = document.createElement('th');
    th.className = 'cron-th-mes' +
      (i === mesAtual && cronogramaAno === anoAtual ? ' mes-atual' : '');
    th.textContent = m;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  // Corpo
  const tbody = document.createElement('tbody');
  linhas.forEach(linha => {
    const tr = document.createElement('tr');

    const tdInfo = document.createElement('td');
    tdInfo.className = 'cron-info-cell';
    tdInfo.innerHTML =
      `<div class="cron-tag">${escapeHtml(linha.tag)}</div>` +
      `<div class="cron-equip" title="${escapeHtml(linha.equipLabel)}">${escapeHtml(linha.equipLabel)}</div>` +
      `<div class="cron-meta">${escapeHtml(linha.freq)} · ${escapeHtml(linha.respLabel)}</div>`;
    tr.appendChild(tdInfo);


    linha.porMes.forEach((datas, mesIdx) => {

      const td = document.createElement('td');
      td.className = 'cron-mes-cell' +
        (mesIdx === mesAtual && cronogramaAno === anoAtual ? ' mes-atual-col' : '');

      if (!datas.length) {
        td.innerHTML = '<span class="cron-vazio">—</span>';
      } else {
        const chips = document.createElement('div');
        // Para frequências densas (≥4 datas/mês) usa layout em grid 2 colunas
        const usaGrid = datas.length >= 4;
        chips.className = 'cron-chips' + (usaGrid ? ' cron-chips-grid' : '');
        datas.forEach(d => {
          const tipo  = classificarData(d);
          const chip  = document.createElement('div');
          chip.className   = `cron-chip ${chipClass(tipo)}`;
          chip.textContent = d.getDate();
          const label = { today:'Hoje', late:'Atrasada', near:'Próxima', ok:'Futura' }[tipo];
          chip.title = `${formatDateBR(d)} — ${label}`;
          chips.appendChild(chip);
        });
        td.appendChild(chips);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.innerHTML = '';
  wrap.appendChild(table);
}

// ── Navegação de ano ──────────────────────────────────────────────────────────
function cronogramaAnoAnterior() { cronogramaAno--; renderCronograma(); }
function cronogramaAnoProximo()  { cronogramaAno++; renderCronograma(); }

function cronogramaHoje() {
  cronogramaAno = new Date().getFullYear();
  renderCronograma();
  setTimeout(() => {
    const mesAtual = new Date().getMonth();
    const ths = document.querySelectorAll('.cron-th-mes');
    ths[mesAtual]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, 100);
}

// ── Painel Próximas Manutenções ───────────────────────────────────────────────
function togglePainelProxManut() {
  const painel = getEl('painelProxManut');
  if (!painel) return;
  painelProxAberto = !painelProxAberto;
  painel.classList.toggle('aberto', painelProxAberto);
  if (painelProxAberto) renderPainelProxManut();
}

function renderPainelProxManut() {
  const lista = getEl('listaPainelProxManut');
  if (!lista) return;

  const items = [];
  for (const inv of inventario) {
    const p = getPlanoParaEquip(inv);
    if (!p?.periodicidade || !inv.ultimaManutencao) continue;

    // Usa o cache calculado por recomputeAll — mesma fonte que Inventário e Notificações
    const res = inv._manutStatus ?? calcularStatusManutencao(inv);
    if (!res) continue;

    const diff = res.diff ?? 0;
    const tipo = res.status === 'today' ? 'today'
               : res.status === 'late'  ? 'late'
               : res.status === 'near'  ? 'near' : 'ok';

    items.push({
      equip: inv.equipamento || '—',
      tag:   inv.tag         || '—',
      data:  res.proxima,
      diff,
      resp:  p.responsavel   || inv.responsavel || '—',
      freq:  p.periodicidade,
      tipo
    });
  }

  items.sort((a, b) => a.diff - b.diff);

  if (!items.length) {
    lista.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:20px 0;">Nenhum plano configurado.</div>';
    return;
  }

  lista.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'prox-manut-item';

    const diffLabel = item.diff === 0 ? 'Hoje'
      : item.diff < 0 ? `Atrasada há ${Math.abs(item.diff)}d`
      : `Em ${item.diff} dia(s)`;

    const badgeClass = item.tipo === 'late' ? 'late'
      : (item.tipo === 'near' || item.tipo === 'today') ? 'near' : 'ok';

    const corData = item.tipo === 'late' ? 'var(--danger)'
      : (item.tipo === 'near' || item.tipo === 'today') ? 'var(--warn)' : 'var(--success)';

    div.innerHTML =
      `<div class="pm-tag">${escapeHtml(item.tag)}</div>` +
      `<div class="pm-equip">${escapeHtml(item.equip)}</div>` +
      `<div class="pm-data" style="color:${corData};">${formatDateBR(item.data)} <span class="pm-badge ${badgeClass}">${diffLabel}</span></div>` +
      `<div class="pm-meta">${escapeHtml(item.freq)} · ${escapeHtml(item.resp)}</div>`;

    div.addEventListener('click', () => {
      togglePainelProxManut();
      cronogramaAno = item.data.getFullYear();
      renderCronograma();
      setTimeout(() => {
        const cells = document.querySelectorAll('.cron-info-cell');
        for (const cell of cells) {
          if (cell.querySelector('.cron-equip')?.textContent?.trim() === item.equip) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
          }
        }
      }, 150);
    });

    lista.appendChild(div);
  });
}

// ========================
// Exposição global dos novos métodos
// ========================
window.renderCronograma = renderCronograma;
window.cronogramaHoje = cronogramaHoje;
window.cronogramaAnoAnterior = cronogramaAnoAnterior;
window.cronogramaAnoProximo = cronogramaAnoProximo;
window.togglePainelProxManut = togglePainelProxManut;

// Exports globais
window.abrirTab = abrirTab;
window.adicionarEquipamento = adicionarEquipamento;
window.adicionarPlano = adicionarPlano;
window.adicionarOS = adicionarOS;
window.adicionarFornecedor = adicionarFornecedor;
window.toggleNotifPanel = toggleNotifPanel;
window.salvarInventarioDraft = salvarInventarioDraft;
window.salvarPlanoDraft = salvarPlanoDraft;
// MELHORIA 2 — Backup
window.exportarBackup = exportarBackup;

window.importarBackup = importarBackup;
window.restaurarAutoBackup = restaurarAutoBackup;
window.toggleBackupPanel = toggleBackupPanel;
