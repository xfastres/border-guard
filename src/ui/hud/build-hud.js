import { getOwnedDestinyEnhancements, getSourceStageSpec } from '../../core/state-queries.js';
import {
  ARTIFACTS, SEAL_SPECIALIZATIONS, SUB_SEAL_RESONANCE, SEAL_FUSE_NEED, ELEMENTS, HERO_GEAR_SLOTS,
  GEARS, GEAR_AFFIXES, GEAR_RARITY_LABELS, W20_DIRECTIONS, GEAR_SETS, HERO_SKILLS, W10_SKILL_BRANCHES, COMBO_LIST, GEAR_SYNERGIES,
} from '../../data/index.js';
import { isBagSeal } from '../../systems/economy/pricing.js';

export function gearListSig(list){
  return (list || []).map(g => {
    if (!g || typeof g !== 'object') return String(g || '');
    if (isBagSeal(g)) return `seal:${g.uid}:${g.kind}:${g.star}`;
    const af = (g.affixes || []).map(a => a ? `${a.id}:${a.tier || 1}` : '_').join('+');
    return `${g.uid}:${g.enhanceLv || 0}:${g.slotsCount}:${af}`;
  }).join(',');
}

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = value => ' data-detail="' + esc(value) + '" aria-label="' + esc(String(value).split('\n')[0]) + '"';
function iconButton(icon, tag, detail, action, color = '') {
  return '<button type="button" class="compact-icon" ' + action + attr(detail) +
    (color ? ' style="--item-color:' + esc(color) + '"' : '') + '><span>' + esc(icon) + '</span><small>' + esc(tag) + '</small></button>';
}
function section(name, html) {
  return '<section class="compact-group"><div class="compact-label">' + esc(name) + '</div><div class="compact-icons">' + html + '</div></section>';
}
function progress(name, count, max, color, detail) {
  return '<button type="button" class="compact-progress"' + attr(detail) + '><span>' + esc(name) +
    '</span><b>' + count + '/' + max + '</b><span class="compact-track">' +
    Array.from({length:max}, (_, i) => '<i style="background:' + (i < count ? color : '#34464b') + '"></i>').join('') + '</span></button>';
}

export function createBuildHud(runtimeCtx, deps) {
  const { getEl: $ } = deps;
  const { getSynergyCounts, getActiveGearSets, getGearSetCounts, getActiveDualResonances, getSealStats } = deps.hero;
  const { getActiveGearAffixSynergies, gearBase, describeGearInstance, gearLabel } = deps.equipment;
  const { isW20PreselectOpen } = deps.progression;
  const { getRealmStageLabel } = deps.unlock;
    let lastLeftHudKey = '';

  function renderLeftHud(force){
    const body = $('leftHudBody'), game = runtimeCtx.game;
    const panel = $('leftHud');
    if (panel) panel.hidden = !!game?.inspTarget;
    if (!body || !game) return;
    const h = game.hero;
    const syn = getSynergyCounts(), activeSets = getActiveGearSets(), setCounts = getGearSetCounts();
    const duals = getActiveDualResonances(), affix = getActiveGearAffixSynergies();
    const ownedDestiny = getOwnedDestinyEnhancements(game);
    const key = JSON.stringify([game.seal, game.subSeals, gearListSig(h.gear), h.skills, h.w10Branch, h.breakthroughs, h.combos, h.realm, h.lv, syn, setCounts, affix.affixIds, ownedDestiny.map(d=>d.key || d.name), isW20PreselectOpen(), game.w20State?.preselectedDirection]);
    if (!force && key === lastLeftHudKey) return;
    lastLeftHudKey = key;
    let seals = '';
    if (game.seal) {
      const s = game.seal, sp = ARTIFACTS[s.kind], el = ELEMENTS[s.elem], st = getSealStats(s);
      const route = SEAL_SPECIALIZATIONS[s.elem]?.[s.route];
      seals += iconButton(sp.icon, '主 '+s.star+'★', [sp.name+' · 主灵印 '+s.star+'★',sp.desc,st.dmg+' 伤害 / '+st.cd.toFixed(2)+'s', '升阶进度 '+s.prog+'/'+(SEAL_FUSE_NEED[s.star] || '满阶'), route?.name, route?.desc, '3★：'+el.t1, '5★：'+el.t2].filter(Boolean).join('\n'),'data-open-seal',el.color);
    } else seals += iconButton('＋','主印','尚未铭刻主灵印 · 打开商店购买灵印','data-open-shop');
    for (let i=0;i<2;i++) {
      const s=game.subSeals[i];
      if (s) {
        const sp=ARTIFACTS[s.kind], res=SUB_SEAL_RESONANCE[s.elem];
        seals += iconButton(sp.icon,'辅 '+s.star+'★',[res.name+' · 辅灵印 '+s.star+'★',res.desc(s.star),s.star>=3?'已满阶':'升阶 '+s.prog+'/'+SEAL_FUSE_NEED[s.star]].join('\n'),'data-open-seal',ELEMENTS[s.elem].color);
      } else seals += iconButton('＋','辅'+(i+1),i===0?'W6 解锁第一辅印槽':'W10 突破解锁第二辅印槽','data-open-seal');
    }
    const skills = Object.entries(h.skills).filter(([,lv])=>lv>0).map(([k,lv])=>{
      const sp=HERO_SKILLS[k], branch=(W10_SKILL_BRANCHES[k]||[]).find(b=>b.key===h.w10Branch?.[k]);
      return iconButton(sp.icon,'Lv.'+lv,[sp.name+' Lv.'+lv+'/5',sp.desc(lv),branch?.name,branch?.desc].filter(Boolean).join('\n'),'data-open-hero');
    }).join('') || '<span class="ui-hint">尚未习得神通</span>';
    const gears = Array.from({length:HERO_GEAR_SLOTS},(_,i)=>{
      const g=h.gear[i];
      if (!g) return iconButton('＋','空槽','空构装槽 · 打开背包穿戴','data-open-bag');
      const sp=GEARS[gearBase(g)]||{};
      const lines=(g.affixes||[]).map((a,j)=>a&&GEAR_AFFIXES[a.id] ? GEAR_AFFIXES[a.id].name+' T'+(a.tier||1)+'：'+GEAR_AFFIXES[a.id].desc(a.tier||1) : '空词条槽 '+(j+1));
      const set=GEAR_SETS[sp.set];
      return iconButton(sp.icon||'🧩',g.enhanceLv?'+'+g.enhanceLv:(g.slotsCount||1)+'槽',[gearLabel(g),describeGearInstance(g),...lines,set?'套装：'+set.name:'',set?'2件：'+set.d2:'',set?'3件：'+set.d3:'','点击打开构装操作详情'].filter(Boolean).join('\n'),'data-open-hero','var(--rarity-'+g.rarity+', #8aa9a9)');
    }).join('');
    let extras = '';
    const w20=h.breakthroughs.w20;
    if (w20 && !w20.placeholder) extras+=iconButton(w20.directionIcon||'⚡','二破',[w20.directionName,w20.baseEffectDesc,w20.enhancementName,w20.enhancementDesc].filter(Boolean).join('\n'),'data-open-hero');
    ownedDestiny.forEach(d=>{extras+=iconButton(d.icon||'🎲','天命',d.name+'\n'+d.desc,'data-open-hero');});
    body.innerHTML=section('灵印',seals)+section('神通',skills)+section('构装',gears)+(extras?section('强化',extras):'')+'<div class="compact-realm">'+esc(getRealmStageLabel())+'</div>';
    body.querySelectorAll('[data-open-seal]').forEach(btn=>btn.addEventListener('click',()=>{game.inspTarget={type:'seal'};deps.hudController.renderAllUI(true);}));
    body.querySelectorAll('[data-open-hero]').forEach(btn=>btn.addEventListener('click',()=>{game.inspTarget={type:'hero'};deps.hudController.renderAllUI(true);}));
    body.querySelectorAll('[data-open-shop]').forEach(btn=>btn.addEventListener('click',()=>$('shopOpen')?.click()));
    body.querySelectorAll('[data-open-bag]').forEach(btn=>btn.addEventListener('click',()=>$('bagOpen')?.click()));
    const right=$('progressHudBody');
    if (!right) return;
    const sets=Object.entries(setCounts).filter(([k,n])=>n&&GEAR_SETS[k]).map(([k,n])=>{
      const s=GEAR_SETS[k], active=activeSets.find(a=>a.key===k);
      return progress(s.icon+' '+s.name,Math.min(n,3),3,s.col,[s.name+' '+n+'/3','当前：'+(active?.desc||'未激活'),'2件：'+s.d2,'3件：'+s.d3,n<2?'距两件套还差 '+(2-n)+' 件':n<3?'距完整套装还差 1 件':'完整套装已激活'].join('\n'));
    }).join('');
    const affixes=(affix.hints||[]).map(ht=>{
      const list=[...ht.present,...ht.missing], active=affix.active.find(s=>s.id===ht.activeId);
      const full=GEAR_SYNERGIES.find(s=>s.chain===ht.chain&&s.tier===3);
      const duos=GEAR_SYNERGIES.filter(s=>s.chain===ht.chain&&s.tier===2);
      return progress(ht.chain==='fire_detonate'?'🔥 火系引爆':'❄️ 冰系护体',ht.present.length,3,ht.chain==='fire_detonate'?'#e79859':'#75c8eb',[ht.text,'当前：'+(active?.desc||'未激活'),...list.map(id=>(ht.present.includes(id)?'✓ ':'缺 ')+(GEAR_AFFIXES[id]?.name||id)), '双联动：'+(duos[0]?.desc||''),'三联动：'+(full?.desc||'')].join('\n'));
    }).join('');
    const elements=Object.entries(ELEMENTS).filter(([k])=>syn[k]>0).map(([k,e])=>progress(e.icon+' '+e.name,Math.min(syn[k],4),4,e.color,[e.name+' '+syn[k]+'/4','2层：'+e.t1,'4层：'+e.t2].join('\n'))).join('');
    const combos=COMBO_LIST.filter(c=>h.combos[c.key]).map(c=>iconButton(c.icon,'组合',c.name+'\n'+c.desc,'data-open-hero')).join('');
    const resonance=duals.map(d=>iconButton(d.icons,'共鸣',d.name+'\n'+d.desc,'data-open-hero')).join('');
    right.innerHTML='<div class="compact-label">套装</div>'+(sets||'<span class="ui-hint">尚无套装</span>')+'<div class="compact-label">词条联动</div>'+(affixes||'<span class="ui-hint">尚无联动</span>')+(elements?'<div class="compact-label">五行羁绊</div>'+elements:'')+((combos||resonance)?section('已激活组合',combos+resonance):'');
    right.querySelectorAll('[data-open-hero]').forEach(btn=>btn.addEventListener('click',()=>{game.inspTarget={type:'hero'};deps.hudController.renderAllUI(true);}));
  }
  function resetDirty(){lastLeftHudKey='';}
  return {renderLeftHud,resetDirty};
}
