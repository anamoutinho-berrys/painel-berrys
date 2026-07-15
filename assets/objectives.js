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
const A_LEAD     = ['lead','onsite_conversion.lead_grouped'];
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
  { label:'🥞 Brownie na Chapa',    color:'#7c5c2e', bg:'#fdf5eb', netGroup:true, keys:['brownie','chapa'] },
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

/* ── bloco de métricas conforme o objetivo ── */

