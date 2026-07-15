// ============================================================================
// objectives.js — lib COMPARTILHADA entre "Relatório Real-Time" e "Insights".
// Concentra a classificação de campanhas por objetivo (vendas, alcance,
// tráfego, engajamento, leads) e os fetchers que buscam campanhas/anúncios
// por conta. Se alterar algo aqui, confira as DUAS abas antes de publicar.
// ============================================================================

function getAct(actions, types) {
  if (!Array.isArray(actions)) return 0;
  for (const t of types) {
    const f = actions.find(a => a.action_type === t);
    if (f) return parseFloat(f.value) || 0;
  }
  return 0;
}
const A_PURCHASE = ['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase','onsite_web_purchase'];
const A_LPV      = ['landing_page_view'];
const A_LINK     = ['link_click'];
const A_ENG      = ['post_engagement'];
const A_FOLLOW   = ['follow','onsite_conversion.follow','instagram_profile_follow','like','page_like'];
const A_LEAD     = ['lead','onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_complete_registration','complete_registration'];
const A_MSG      = ['onsite_conversion.messaging_conversation_started_7d'];
const A_THRU     = ['video_thruplay_watched_actions'];

/* ── classificação de objetivo (campo objective da Meta + fallback pelo nome) ── */

const OBJ_GROUPS = {
  vendas:  { key:'vendas',  label:'VENDAS / DELIVERY',      icon:'🛵', order:1 },
  alcance: { key:'alcance', label:'ALCANCE / DIVULGAÇÃO',   icon:'📣', order:2 },
  trafego: { key:'trafego', label:'TRÁFEGO / VISITAS',      icon:'🖱️', order:3 },
  engaj:   { key:'engaj',   label:'ENGAJAMENTO / SEGUIDORES',icon:'👥', order:4 },
  leads:   { key:'leads',   label:'CADASTROS / LEADS',      icon:'📋', order:5 },
  outros:  { key:'outros',  label:'OUTRAS CAMPANHAS',       icon:'📦', order:6 },
};
function classifyObjective(c) {
  const o = (c.objective || '').toUpperCase();
  if (['OUTCOME_SALES','CONVERSIONS','PRODUCT_CATALOG_SALES','STORE_VISITS'].includes(o)) return 'vendas';
  if (['OUTCOME_AWARENESS','REACH','BRAND_AWARENESS'].includes(o)) return 'alcance';
  if (['OUTCOME_TRAFFIC','LINK_CLICKS'].includes(o)) return 'trafego';
  if (['OUTCOME_ENGAGEMENT','POST_ENGAGEMENT','PAGE_LIKES','VIDEO_VIEWS','EVENT_RESPONSES','MESSAGES'].includes(o)) return 'engaj';
  if (['OUTCOME_LEADS','LEAD_GENERATION'].includes(o)) return 'leads';
  // fallback pelo nome da campanha — tráfego é checado antes de vendas/delivery
  // pra não cair no grupo "VENDAS/DELIVERY" só por citar "ifood"/"anota" no nome
  // (ex.: "Tráfego — Visitas ao Perfil — iFood" é tráfego, não venda por delivery)
  const n = (c.name || '').toLowerCase();
  if (/tr[aá]fego|visitas ao perfil|perfil|site/.test(n)) return 'trafego';
  if (/vendas|convers|delivery|ifood|anota|compra|l2p1|leve 2/.test(n)) return 'vendas';
  if (/alcance|awareness|divulga/.test(n)) return 'alcance';
  if (/seguidor|engaj|curtida|mensag/.test(n)) return 'engaj';
  if (/lead|cadastro/.test(n)) return 'leads';
  return 'outros';
}

// regra de negócio: delivery com campanha de VENDAS/CONVERSÃO é Anota Aí
// (tem checkout com pixel de compra); delivery com campanha de TRÁFEGO é
// iFood (só leva visita até o app, sem conversão rastreável). Não depende
// do texto "ifood"/"anota" no nome da campanha — só do objetivo real.
const DELIVERY_KEYS = ['delivery','ifood','anota ai','anota aí','pedido'];
const ANOTAAI = { key:'anotaai', icon:'🧾', name:'Anota Aí', color:'#e07b00', bg:'#fff3e2' };
const IFOOD   = { key:'ifood',   icon:'🛵', name:'iFood',    color:'#EA1D2C', bg:'#fdeaec' };

function normTxt(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function isDeliveryCampaign(c) {
  const n = normTxt(c.name);
  return DELIVERY_KEYS.some(k => n.includes(normTxt(k)));
}

// devolve ANOTAAI, IFOOD ou null (delivery com objetivo ambíguo — alcance,
// engajamento, leads — cai no tema genérico "Delivery (outro)")
function deliveryPlatformFor(c) {
  if (!isDeliveryCampaign(c)) return null;
  const obj = classifyObjective(c);
  if (obj === 'vendas') return ANOTAAI;
  if (obj === 'trafego') return IFOOD;
  return null;
}

const DELIVERY_GENERIC_THEME = { label:'🚚 Delivery (outro)', color:'#2292c4', bg:'#eaf4fb', keys:['delivery','pedido'] };
// netGroup: campanhas de rede — o MESMO criativo roda em várias unidades, então
// no ranking "Melhores Criativos da Rede" as variações por unidade são somadas
// numa entrada só. Temas SEM netGroup são categorias (ex.: Influenciador — cada
// unidade tem um vídeo diferente) e não devem ser agrupados entre unidades.
const CAMPAIGN_THEMES = [
  { label:'🏆 Delivery Copa',       color:'#b8860b', bg:'#fff8e8', netGroup:true, keys:['copa do mundo','copa mundo','copa 2026','copa2026','delivery copa'] },
  { label:'❄️ Festival de Inverno', color:'#2292c4', bg:'#e8f4fb', netGroup:true, keys:['inverno','winter','festival de inv','festival inv'] },
  { label:'💕 Dia dos Namorados',   color:'#e94560', bg:'#fff0f3', netGroup:true, keys:['namorado'] },
  { label:'🎉 Sabor Junino',        color:'#e07b00', bg:'#fff5e8', netGroup:true, keys:['junino','junina','arraiá','arraial','festa jun','são joão','sao joao'] },
  { label:'👥 Influenciador',       color:'#9b59b6', bg:'#f8f0ff', keys:['influenciador','influencer','ugc'] },
  { label:'👤 Seguidores / Visitas',color:'#27ae60', bg:'#edfdf5', keys:['seguidores','visitas','visitas ao perfil','novos seguidores','perfil'] },
  // duas sobremesas diferentes — "com Calda Quente" (delivery) vem antes para
  // que o nome dela não caia no grupo "na Chapa" pela palavra "brownie"
  { label:'🍫 Brownie com Calda Quente', color:'#8b4513', bg:'#fdf0e6', netGroup:true, keys:['calda quente','brownie com calda','brownie calda'] },
  { label:'🥞 Brownie na Chapa',    color:'#7c5c2e', bg:'#fdf5eb', netGroup:true, keys:['brownie na chapa','na chapa','chapa'] },
  // delivery com objetivo ambíguo (não é vendas nem tráfego) — iFood e Anota
  // Aí são resolvidos à parte em classifyCampaigns() via deliveryPlatformFor()
  DELIVERY_GENERIC_THEME,
  { label:'📅 Evento',              color:'#9b59b6', bg:'#f8f0ff', keys:['evento','event','inauguração','inauguracao','pre inaugura','pré inaugura'] },
  { label:'🎨 Temática',            color:'#f5a623', bg:'#fff8e8', keys:['temátic','tematica','thematic','vv ','[vv]'] },
  { label:'🛍️ L2P1',               color:'#27ae60', bg:'#edfdf5', netGroup:true, keys:['leve 2','l2p1','leve2','2 por 1','2x1'] },
];
function classifyCampaigns(campaigns) {
  const found = [], seen = new Set();
  campaigns.forEach(c => {
    const n = normTxt(c.name);
    const platform = deliveryPlatformFor(c);
    if (platform) {
      const label = platform === ANOTAAI ? `${platform.icon} Delivery ${platform.name}` : `${platform.icon} Tráfego → ${platform.name}`;
      if (!seen.has(label)) { found.push({ label, color: platform.color, bg: platform.bg }); seen.add(label); }
    }
    for (const theme of CAMPAIGN_THEMES) {
      if (seen.has(theme.label)) continue;
      // se a campanha já ganhou o tema de iFood/Anota Aí, não duplica com o
      // "Delivery (outro)" genérico só porque o nome também contém "delivery"
      if (platform && theme === DELIVERY_GENERIC_THEME) continue;
      if (theme.keys.some(k => n.includes(normTxt(k)))) {
        found.push(theme); seen.add(theme.label);
      }
    }
  });
  return found;
}

/* ── fetchers ── */
const REL_INSIGHT_FIELDSETS = [
  'spend,impressions,reach,frequency,clicks,cpm,ctr,cpc',
  'spend,impressions,reach,clicks,cpm,ctr,cpc'           // fallback: conjunto original que já funcionava
];
async function fetchRelInsights(id, dateParams) {
  let lastErr = null;
  for (const fields of REL_INSIGHT_FIELDSETS) {
    try {
      const j = await apiFetch(id, 'insights', { fields, ...dateParams });
      if (!j.data?.length) return {};
      const d = j.data[0];
      return {
        spend: parseFloat(d.spend) || 0, impressions: parseInt(d.impressions) || 0,
        reach: parseInt(d.reach) || 0, frequency: parseFloat(d.frequency) || 0,
        clicks: parseInt(d.clicks) || 0, cpm: parseFloat(d.cpm) || 0,
        ctr: parseFloat(d.ctr) || 0, cpc: parseFloat(d.cpc) || 0
      };
    } catch(e) { lastErr = e; console.warn('[rel insights]', id, 'fields="'+fields+'" →', e.message); }
  }
  throw lastErr || new Error('insights indisponíveis');
}

// IMPORTANTE: date_preset/time_range passados como parâmetro de query no
// nível do request (ex.: ?date_preset=last_7d) NÃO se propagam para uma
// edge aninhada via field-expansion como "insights{spend,...}" — a Graph API
// exige o escopo de data dentro da própria expansão (insights.date_preset(x){...}
// ou insights.time_range({...}){...}). Sem isso, o "insights" de campaigns/ads
// sempre volta com o período padrão da API (não o período selecionado no
// filtro), o que explica valores de campanha/anúncio que não batem com os
// totais gerais da conta (que usam o endpoint insights direto, sem aninhamento).
function scopeInsightsField(fieldsTpl, dateParams) {
  if (!dateParams) return fieldsTpl;
  let scope = '';
  if (dateParams.time_range) scope = `.time_range(${dateParams.time_range})`;
  else if (dateParams.preset) scope = `.date_preset(${dateParams.preset})`;
  return fieldsTpl.replace('insights{', `insights${scope}{`);
}

const REL_CAMPAIGN_FIELDSETS = [
  // completo: métricas de conversão para exibir compras/ROAS por objetivo
  'name,status,objective,insights{spend,impressions,reach,frequency,clicks,inline_link_clicks,cpm,ctr,cpc,actions,action_values,purchase_roas}',
  // médio: sem actions (caso o proxy bloqueie)
  'name,status,objective,insights{spend,impressions,reach,clicks,ctr,cpc}',
  // mínimo: o que a versão anterior usava
  'name,status,insights{spend}'
];
async function fetchRelCampaigns(id, dateParams) {
  for (const fields of REL_CAMPAIGN_FIELDSETS) {
    try {
      const j = await apiFetch(id, 'campaigns', { fields: scopeInsightsField(fields, dateParams), limit: 200, ...dateParams });
      return (j.data || []).filter(c =>
        parseFloat(c.insights?.data?.[0]?.spend || 0) > 0 || c.status === 'ACTIVE'
      );
    } catch(e) { console.warn('[rel campaigns]', id, 'fields="'+fields+'" →', e.message); }
  }
  return [];
}

const REL_AD_FIELDSETS = [
  'name,creative{thumbnail_url},insights{spend,reach,impressions,clicks,actions,action_values}',
  'name,creative{thumbnail_url},insights{spend,reach,impressions,clicks,actions}', // fallback: sem action_values
  'name,creative{thumbnail_url},insights{spend,reach,impressions,clicks}'  // fallback: conjunto original
];
async function fetchRelTopAds(id, dateParams) {
  for (const fields of REL_AD_FIELDSETS) {
    try {
      const j = await apiFetch(id, 'ads', { fields: scopeInsightsField(fields, dateParams), limit: 200, ...dateParams });
      const ads = (j.data || []).filter(a => a.insights?.data?.[0]?.spend > 0);
      return ads.sort((a, b) =>
        (parseFloat(b.insights.data[0].spend) || 0) - (parseFloat(a.insights.data[0].spend) || 0)
      ).slice(0, 3);
    } catch(e) { console.warn('[rel ads]', id, 'fields="'+fields+'" →', e.message); }
  }
  return [];
}

/* ── agregação por objetivo ── */
function aggregateByObjective(campaigns) {
  const groups = {};
  campaigns.forEach(c => {
    const ins = c.insights?.data?.[0];
    if (!ins || !(parseFloat(ins.spend) > 0)) return;
    const g = classifyObjective(c);
    if (!groups[g]) groups[g] = {
      spend:0, impressions:0, reach:0, clicks:0, linkClicks:0,
      purchases:0, convValue:0, lpv:0, engagement:0, follows:0,
      leads:0, msgs:0, thruplays:0, freqW:0, campaigns:[]
    };
    const gr = groups[g];
    const sp = parseFloat(ins.spend) || 0;
    gr.spend       += sp;
    gr.impressions += parseInt(ins.impressions) || 0;
    gr.reach       += parseInt(ins.reach) || 0;
    gr.clicks      += parseInt(ins.clicks) || 0;
    gr.linkClicks  += parseInt(ins.inline_link_clicks) || 0;
    gr.purchases   += getAct(ins.actions, A_PURCHASE);
    gr.convValue   += getAct(ins.action_values, A_PURCHASE);
    gr.lpv         += getAct(ins.actions, A_LPV);
    gr.engagement  += getAct(ins.actions, A_ENG);
    gr.follows     += getAct(ins.actions, A_FOLLOW);
    gr.leads       += getAct(ins.actions, A_LEAD);
    gr.msgs        += getAct(ins.actions, A_MSG);
    gr.freqW       += (parseFloat(ins.frequency) || 0) * sp;
    gr.campaigns.push(c);
  });
  Object.values(groups).forEach(g => {
    g.frequency = g.spend > 0 ? g.freqW / g.spend : 0;
    g.cpm = g.impressions > 0 ? g.spend / g.impressions * 1000 : null;
    g.ctr = g.impressions > 0 ? g.clicks / g.impressions * 100 : null;
    g.cpc = g.clicks > 0 ? g.spend / g.clicks : null;
    g.costPerPurchase = g.purchases > 0 ? g.spend / g.purchases : null;
    g.roas = g.spend > 0 && g.convValue > 0 ? g.convValue / g.spend : null;
    g.costPerLpv = g.lpv > 0 ? g.spend / g.lpv : null;
    g.costPerEng = g.engagement > 0 ? g.spend / g.engagement : null;
    g.costPerFollow = g.follows > 0 ? g.spend / g.follows : null;
    g.costPerLead = g.leads > 0 ? g.spend / g.leads : null;
    g.costPerReach = g.reach > 0 ? g.spend / g.reach * 1000 : null;
  });
  return groups;
}

/* ── UI helpers ── */

const tile = (ico, lbl, val, hero=false) =>
  `<div class="rel-tile${hero?' hero':''}"><div class="t-ico">${ico}</div><div class="t-lbl">${lbl}</div><div class="t-val">${val}</div></div>`;
const mrow = (ico, lbl, val) =>
  `<div class="rel-metric-row"><div class="rel-m-icon">${ico}</div><div class="rel-m-text">${lbl}: <strong>${val}</strong></div></div>`;

/* ── bloco de métricas conforme o objetivo ──
   As funções abaixo (renderObjBlock, buildResumo, unitIcon,
   detectDeliveryPlatforms, renderRelUnit) montam o CARD DE UNIDADE do
   relatório em tempo real. Moravam em tabs/relatorio.js e foram movidas
   para cá quando a aba "Dash Brasil" passou a usar o mesmo card. */

function renderObjBlock(key, g) {
  const meta = OBJ_GROUPS[key];
  let body = '';
  if (key === 'vendas') {
    body = `<div class="rel-tiles">
      ${tile('🛍️','Compras no site', fmtN(g.purchases), true)}
      ${tile('🏷️','Custo por compra', g.costPerPurchase!=null?fmt(g.costPerPurchase):'—')}
      ${tile('💲','Valor de conversão', g.convValue>0?fmt(g.convValue):'—')}
      ${tile('📈','ROAS', g.roas!=null?g.roas.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—', true)}
      ${tile('👥','Alcance', fmtN(g.reach))}
      ${tile('👁️','Impressões', fmtN(g.impressions))}
      ${tile('🖱️','Cliques', fmtN(g.clicks))}
      ${tile('📊','CTR', fmtPct(g.ctr))}
      ${tile('💸','CPC', g.cpc!=null?fmt(g.cpc):'—')}
      ${g.lpv>0?tile('📄','Visualizações da página', fmtN(g.lpv)):''}
      ${g.costPerLpv!=null?tile('🧾','Custo por visualização', fmt(g.costPerLpv)):''}
      ${g.msgs>0?tile('💬','Conversas iniciadas', fmtN(g.msgs)):''}
    </div>`;
  } else if (key === 'alcance') {
    body = `
      ${mrow('👥','Alcance', fmtN(g.reach)+' pessoas')}
      ${mrow('👁️','Impressões', fmtN(g.impressions))}
      ${mrow('🔁','Frequência', g.frequency? g.frequency.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—')}
      ${mrow('📊','Custo por 1.000 pessoas alcançadas', g.costPerReach!=null?fmt(g.costPerReach):'—')}
      ${mrow('🧾','CPM', g.cpm!=null?fmt(g.cpm):'—')}
      ${g.clicks>0?mrow('🖱️','Cliques no link', fmtN(g.clicks)):''}`;
  } else if (key === 'trafego') {
    body = `<div class="rel-tiles">
      ${tile('🖱️','Cliques no link', fmtN(g.linkClicks||g.clicks), true)}
      ${tile('💸','CPC', g.cpc!=null?fmt(g.cpc):'—')}
      ${tile('📊','CTR', fmtPct(g.ctr))}
      ${g.lpv>0?tile('📄','Visualizações da página', fmtN(g.lpv)):''}
      ${g.costPerLpv!=null?tile('🧾','Custo por visualização', fmt(g.costPerLpv)):''}
      ${tile('👥','Alcance', fmtN(g.reach))}
      ${tile('👁️','Impressões', fmtN(g.impressions))}
    </div>`;
  } else if (key === 'engaj') {
    body = `<div class="rel-tiles">
      ${tile('➕','Novos seguidores', g.follows>0?fmtN(g.follows):'—', true)}
      ${tile('🧾','Custo por seguidor', g.costPerFollow!=null?fmt(g.costPerFollow):'—', true)}
      ${tile('👥','Engajamentos', fmtN(g.engagement))}
      ${tile('🏷️','Custo por engajamento', g.costPerEng!=null?fmt(g.costPerEng):'—')}
      ${g.msgs>0?tile('💬','Conversas iniciadas', fmtN(g.msgs)):''}
      ${tile('👤','Alcance', fmtN(g.reach))}
      ${tile('👁️','Impressões', fmtN(g.impressions))}
    </div>`;
  } else if (key === 'leads') {
    body = `<div class="rel-tiles">
      ${tile('📋','Leads', fmtN(g.leads), true)}
      ${tile('🏷️','Custo por lead', g.costPerLead!=null?fmt(g.costPerLead):'—')}
      ${tile('🖱️','Cliques', fmtN(g.clicks))}
      ${tile('📊','CTR', fmtPct(g.ctr))}
      ${tile('👥','Alcance', fmtN(g.reach))}
    </div>`;
  } else {
    body = `<div class="rel-tiles">
      ${tile('👥','Alcance', fmtN(g.reach))}
      ${tile('👁️','Impressões', fmtN(g.impressions))}
      ${tile('🖱️','Cliques', fmtN(g.clicks))}
      ${tile('🧾','CPM', g.cpm!=null?fmt(g.cpm):'—')}
    </div>`;
  }
  return `<div class="rel-obj-block">
    <div class="rel-obj-block-head">
      <div class="rel-obj-pill">${meta.icon} ${meta.label}</div>
      <div class="rel-obj-invest">Investimento: <strong>${fmt(g.spend)}</strong></div>
    </div>
    ${body}
  </div>`;
}

function buildResumo(displayName, groups) {
  const parts = [];
  const v = groups.vendas, a = groups.alcance, t = groups.trafego, e = groups.engaj;
  if (v && v.purchases > 0) {
    parts.push(`As campanhas de vendas geraram <strong>${fmtN(v.purchases)} compra${v.purchases>1?'s':''}</strong>` +
      (v.roas!=null ? `, com ROAS de <strong>${v.roas.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> — para cada R$ 1,00 investido, retornaram ${fmt(v.roas)} em valor de conversão` : '') + '.');
  } else if (v) {
    parts.push('As campanhas de vendas ainda não registraram compras no período.');
  }
  if (a) parts.push(`No alcance, a unidade impactou <strong>${fmtN(a.reach)} pessoas</strong> a um custo de ${a.costPerReach!=null?fmt(a.costPerReach):'—'} por 1.000 alcançadas.`);
  if (t && (t.linkClicks||t.clicks) > 0) parts.push(`O tráfego gerou <strong>${fmtN(t.linkClicks||t.clicks)} cliques</strong>${t.cpc!=null?` a ${fmt(t.cpc)} por clique`:''}.`);
  if (e && e.follows > 0) parts.push(`Engajamento somou <strong>${fmtN(e.follows)} novos seguidores</strong>${e.costPerFollow!=null?` a ${fmt(e.costPerFollow)} por seguidor`:''}.`);
  if (!parts.length) return '';
  return `<div class="rel-resumo"><span class="r-chip">Resumo:</span><p>${parts.join(' ')}</p></div>`;
}

function unitIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('brasil') || n.includes('bernardo')) return '🇧🇷';
  if (n.includes('moc')) return '🏪';
  if (n.includes('aracaju') || n.includes('recife') || n.includes('maceió') || n.includes('maceio') || n.includes('salvador')) return '🌴';
  if (n.includes('savassi') || n.includes('contagem') || n.includes('uberaba') || n.includes('anápolis') || n.includes('anapolis')) return '🏙️';
  return '🍦';
}

// plataforma(s) de delivery em que a unidade está anunciando no período —
// usa deliveryPlatformFor(): delivery com campanha de vendas/conversão é
// Anota Aí, delivery com campanha de tráfego é iFood
function detectDeliveryPlatforms(campaigns) {
  const active = campaigns.filter(c => parseFloat(c.insights?.data?.[0]?.spend || 0) > 0);
  const found = new Map();
  active.forEach(c => {
    const p = deliveryPlatformFor(c);
    if (p && !found.has(p.key)) found.set(p.key, p);
  });
  return [...found.values()].map(p => ({ key: p.key, icon: p.icon, label: p.name, color: p.color }));
}

function renderRelUnit(acc, insights, topAds, campaigns, hasData, unitErr) {
  const card = document.createElement('div');
  card.className = 'rel-unit-card';
  const displayName = acc.name.replace(/berry's\s*/i, '').trim().toUpperCase();
  const groups = aggregateByObjective(campaigns);
  const groupKeys = Object.keys(groups).sort((x,y) => OBJ_GROUPS[x].order - OBJ_GROUPS[y].order);

  const objBadges = groupKeys.length
    ? `<div class="rel-obj-badges">${groupKeys.map((k,i) =>
        `<span class="rel-obj-badge${i>0?' alt':''}">${OBJ_GROUPS[k].icon} ${OBJ_GROUPS[k].label}</span>`).join('')}</div>`
    : '';

  const deliveryPlatforms = detectDeliveryPlatforms(campaigns);
  const deliveryBadges = deliveryPlatforms.length
    ? `<div class="rel-delivery-badges">${deliveryPlatforms.map(p =>
        `<span class="rel-delivery-badge" style="background:${p.color};">${p.icon} ${p.label}</span>`).join('')}</div>`
    : '';

  const headKpis = hasData ? `<div class="rel-head-kpis">
    <div class="rel-head-kpi"><span class="k-ico">💰</span><span><div class="k-lbl">Investimento total</div><div class="k-val">${fmt(insights.spend)}</div></span></div>
    <div class="rel-head-kpi"><span class="k-ico">👥</span><span><div class="k-lbl">Alcance da conta</div><div class="k-val">${fmtN(insights.reach)}</div></span></div>
  </div>` : '';

  const header = `<div class="rel-card-header">
    <div class="rel-card-icon-wrap">${unitIcon(acc.name)}</div>
    <div class="rel-card-title">${displayName}</div>
    ${acc.mgr ? `<a class="rel-card-mgr" href="${acc.mgr}" target="_blank">↗ Gerenciador</a>` : ''}
    ${deliveryBadges}
    ${headKpis}
    ${objBadges}
  </div>`;

  // chave p/ agrupar unidades com mix de campanhas parecido
  card.dataset.sig   = groupKeys.length ? groupKeys.join('|') : 'zz-none';
  card.dataset.nobj  = groupKeys.length;
  card.dataset.spend = insights.spend || 0;
  if (deliveryPlatforms.length) card.dataset.delivery = deliveryPlatforms.map(p => p.key).join('|');

  if (!hasData) {
    const msg = unitErr
      ? `⚠️ Erro ao consultar a API: <span style="color:#c0392b;">${unitErr}</span>`
      : 'Nenhuma métrica encontrada para o período selecionado.';
    card.innerHTML = header + `<div class="rel-nodata">${msg}</div>`;
    return card;
  }

  // blocos por objetivo — cada um só com as métricas que fazem sentido
  let objBlocks = groupKeys.map(k => renderObjBlock(k, groups[k])).join('');
  if (!groupKeys.length) {
    // sem detalhamento de campanha: mostra visão geral da conta
    objBlocks = `<div class="rel-obj-block">
      <div class="rel-obj-block-head"><div class="rel-obj-pill">📦 VISÃO GERAL DA CONTA</div>
      <div class="rel-obj-invest">Investimento: <strong>${fmt(insights.spend)}</strong></div></div>
      ${mrow('👥','Alcance', fmtN(insights.reach)+' pessoas')}
      ${mrow('👁️','Impressões', fmtN(insights.impressions))}
      ${mrow('🖱️','Cliques', fmtN(insights.clicks))}
      ${mrow('🧾','CPM', fmt(insights.cpm))}
    </div>`;
  }

  const resumo = buildResumo(displayName, groups);

  // só entram temas de campanhas que de fato tiveram gasto no período — uma
  // campanha ACTIVE sem investimento na janela selecionada não "veiculou" nela.
  // iFood (tráfego) e Anota Aí (vendas) sempre aparecem separados — ver
  // deliveryPlatformFor()/classifyCampaigns()
  const spentCampaigns = campaigns.filter(c => parseFloat(c.insights?.data?.[0]?.spend || 0) > 0);
  const themes = classifyCampaigns(spentCampaigns);
  const themePills = themes.length
    ? themes.map(t => `<span class="rel-theme-pill" style="color:${t.color};background:${t.bg};">${t.label}</span>`).join('')
    : `<span style="font-size:11px;color:#b8d2e4;font-weight:800;">Nenhuma campanha com investimento neste período</span>`;
  const themesBlock = `<div class="rel-themes-section">
    <div class="rel-section-lbl">O que rodou nesta unidade no período (${spentCampaigns.length} campanha${spentCampaigns.length===1?'':'s'} com investimento)</div>
    <div class="rel-themes-row">${themePills}</div>
  </div>`;

  const statusDot = st => st === 'ACTIVE' ? '#27ae60' : st === 'PAUSED' ? '#f5a623' : '#bbb';
  const objShort = { vendas:'Vendas', alcance:'Alcance', trafego:'Tráfego', engaj:'Engaj.', leads:'Leads', outros:'Outro' };
  const campRows = campaigns.map(c => {
    const sp = parseFloat(c.insights?.data?.[0]?.spend || 0);
    return `<div class="rel-camp-row">
      <div class="rel-camp-dot" style="background:${statusDot(c.status)}"></div>
      <div class="rel-camp-name" title="${c.name}">${c.name}</div>
      <span class="rel-camp-obj">${objShort[classifyObjective(c)]}</span>
      ${sp > 0 ? `<div class="rel-camp-spend">${fmt(sp)}</div>` : ''}
    </div>`;
  }).join('');
  const n = campaigns.length;
  const campsBlock = n ? `<div class="rel-camps-section">
    <div class="rel-section-lbl">Campanhas</div>
    <button class="rel-camps-toggle" onclick="const l=this.nextElementSibling;l.classList.toggle('open');this.textContent=l.classList.contains('open')?'▲ ocultar':'▼ ver ${n} campanha${n>1?'s':''}';">▼ ver ${n} campanha${n>1?'s':''}</button>
    <div class="rel-camp-list">${campRows}</div>
  </div>` : '';

  const rankCls = ['r1','r2','r3'];
  const adsRows = topAds.length ? topAds.map((ad, i) => {
    const ins = ad.insights.data[0];
    const thumb = ad.creative?.thumbnail_url;
    const sp  = parseFloat(ins.spend) || 0;
    const rch = parseInt(ins.reach) || 0;
    const clk = parseInt(ins.clicks) || 0;
    const pur = getAct(ins.actions, A_PURCHASE);
    return `<div class="rel-ad-item">
      <div class="rel-ad-rank ${rankCls[i]}">${i+1}</div>
      ${thumb ? `<img class="rel-ad-thumb" src="${thumb}" onerror="this.style.display='none'" loading="lazy"/>` : `<div class="rel-ad-thumb"></div>`}
      <div class="rel-ad-info">
        <div class="rel-ad-name">${ad.name}</div>
        <div class="rel-ad-metrics">${fmt(sp)} · ${fmtN(rch)} alcance · ${fmtN(clk)} cliques${pur>0?` · 🛍️ ${fmtN(pur)} compras`:''}</div>
      </div>
    </div>`;
  }).join('') : `<div class="rel-nodata" style="padding:8px 0 0;">Nenhum anúncio com gasto no período.</div>`;

  card.innerHTML = header + objBlocks + resumo + themesBlock + campsBlock + `
    <div class="rel-ads-section">
      <div class="rel-ads-badge-wrap"><div class="rel-ads-badge">🏆 MELHORES ANÚNCIOS</div></div>
      ${adsRows}
    </div>`;
  return card;
}

