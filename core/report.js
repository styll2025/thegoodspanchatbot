// The AI-written Good Span report (/conversation): its shape, the checks every report must pass, and how it is shown.
// Claude writes the report from the person's confirmed answers and their own words (server/ai-report.js).
// It may recommend actions only from the practices the rules allow for this person (r.pool) or from approved
// evidence statements (core/evidence.js), and must cite them. If any check here fails, the page asks once more with
// the reasons; then it shows the rules' own Good Span instead.
(function (root) {
  const AREAS = ['Nutrition', 'Sleep', 'Movement', 'Mind', 'Connection', 'Prevention'];
  const STATUS = { strong: 'Already strong', chosen: 'You chose this', opportunity: 'Worth attention', unclear: 'Not enough information' };
  // wording we never use: diagnosis, cures, promises, scores, predictions of how long someone lives
  const BANNED = /diagnos|disorder|\bcure|\btreat(ment|ing)?\b|guarantee|\bprevents? (dementia|disease|cancer|death)|will (reduce|lower|cut|halve) your risk|live longer|add (years|\d+ years)|longevity score|\bscore\b|biological age|lose weight|weight loss|calorie|medication|supplement|!/i;
  // practices they told us they'd rather not do: no action may suggest them
  const OPTOUT = { tracking_food: /track(ing)? (what|everything) you eat|food (diary|log)|count(ing)? (calories|portions)|log (your|what)/i, apps: /\bapps?\b|device|wearable|smart ?watch|tracker/i, fasting: /eating window|fasting|time-restricted|skip(ping)? (breakfast|meals?)/i, meditation: /meditat/i, journalling: /journal/i, early: /early[- ]morning|before (work|sunrise)|wake (up )?earlier|set (an|your) alarm earlier/i, touch: /\bhug|massage|cuddl|physical affection/i };
  const nums = t => (String(t || '').match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(',', '.'));
  const allText = rep => [rep.headline, ...(rep.intro || []), ...(rep.now || []).map(x => x.text), rep.ageing && rep.ageing.heading, ...((rep.ageing && rep.ageing.paras) || []),
    ...(rep.actions || []).flatMap(a => [a.title, a.body, a.why, ...(a.steps || [])]), ...(rep.keep || []), rep.next].filter(Boolean).join('\n');

  function check(rep, ctx) {
    const why = [];
    if (!rep || typeof rep !== 'object') return ['no report'];
    const str = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.length <= n;
    if (!str(rep.headline, 120)) why.push('the headline is missing or longer than 120 characters');
    if (!Array.isArray(rep.intro) || rep.intro.length < 1 || rep.intro.length > 2 || !rep.intro.every(p => str(p, 700))) why.push('the introduction needs one or two paragraphs of up to 700 characters');
    // where they are now: each of the six areas once
    const now = Array.isArray(rep.now) ? rep.now : [];
    const seen = now.map(x => x && x.area);
    if (now.length !== 6 || AREAS.some(a => !seen.includes(a))) why.push('"where you are now" needs each of the six areas exactly once');
    for (const x of now) {
      if (!x || !STATUS[x.status]) { why.push(`${x && x.area}: unknown status`); continue; }
      if (!str(x.text, 420)) why.push(`${x.area}: the summary is missing or too long`);
      if (x.status === 'chosen' && !(ctx.wish || []).includes(x.area)) why.push(`${x.area} is marked "you chose this" but they didn't choose it`);
      if ((ctx.wish || []).includes(x.area) && x.status !== 'chosen') why.push(`${x.area} is an area they chose, so it must be marked "you chose this"`);
    }
    if (rep.ageing) {
      if (!str(rep.ageing.heading, 120) || !Array.isArray(rep.ageing.paras) || !rep.ageing.paras.length || rep.ageing.paras.length > 3 || !rep.ageing.paras.every(p => str(p, 700))) why.push('the ageing-well section has the wrong shape');
    }
    // actions: 2 to 4, each tied to a practice the rules allow or an approved statement
    const pool = Object.fromEntries((ctx.pool || []).map(x => [x.id, x]));
    const cards = Object.fromEntries((ctx.cards || []).map(c => [c.id, c]));
    for (const id of (rep.ageing && rep.ageing.cites) || []) if (!cards[id]) why.push(`the ageing-well section cites "${id}", which is not an approved statement for this person`);
    const acts = Array.isArray(rep.actions) ? rep.actions : [];
    if (acts.length < 2 || acts.length > 4) why.push('there must be two to four actions');
    for (const [i, a] of acts.entries()) {
      const n = `action ${i + 1}`;
      if (!a || !AREAS.includes(a.area)) { why.push(`${n}: unknown area`); continue; }
      if (!str(a.title, 90) || !str(a.body, 900) || !str(a.why, 400)) why.push(`${n}: title, explanation or reason missing or too long`);
      if (!Array.isArray(a.steps) || a.steps.length < 1 || a.steps.length > 4 || !a.steps.every(s => str(s, 240))) why.push(`${n}: one to four concrete steps are needed`);
      const cites = Array.isArray(a.cites) ? a.cites : [];
      if (!cites.length) why.push(`${n}: it must cite at least one practice or approved statement`);
      for (const id of cites) if (!pool[id] && !cards[id]) why.push(`${n}: "${id}" is not a practice or approved statement allowed for this person`);
      if (a.origin === 'chosen' && !(ctx.wish || []).includes(a.area)) why.push(`${n}: marked as their choice, but they didn't choose ${a.area}`);
      if (!['chosen', 'answers'].includes(a.origin)) why.push(`${n}: origin must be "chosen" or "answers"`);
      if (ctx.held && a.area === 'Movement') why.push(`${n}: no movement action while activity is on hold until they've spoken to a doctor`);
      const t = [a.title, a.body, a.why, ...(a.steps || [])].join(' ');
      for (const k of ctx.optout || []) if (OPTOUT[k] && OPTOUT[k].test(t)) why.push(`${n}: suggests something they said they'd rather not do (${k})`);
      // how often and how long: every amount in the steps must be the cited practice's or statement's own (adapt how, never how much)
      const norm = t => String(t || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
      const srcTxt = norm(cites.map(id => pool[id] ? [pool[id].action, pool[id].freq].join(' ') : cards[id] ? cards[id].text : '').join(' | '));
      const AMOUNT = /\b(?:\d+(?:-\d+)?|once|twice|one|two|three|four|five|six|seven)\s+(?:(?:times?|days?|evenings?|nights?|mornings?|meals?)\s+)?(?:a|per|each)\s+(?:day|week|month|night)\b|\b\d+(?:-\d+)?\s+minutes?\b/g;
      for (const st of a.steps || []) for (const m of norm(st).match(AMOUNT) || []) if (!srcTxt.includes(m)) { why.push(`${n}: "${m}" is not the amount in the practice or statement it cites`); break; }
      // numbers: only ones in their answers, the cited practices or the cited statements
      const known = new Set([...nums(ctx.factsText), ...cites.flatMap(id => pool[id] ? nums([pool[id].action, pool[id].freq, pool[id].start].join(' ')) : cards[id] ? nums(cards[id].text) : [])]);
      for (const x of nums(t)) if (!known.has(x)) { why.push(`${n}: the number ${x} isn't in their answers or the cited sources`); break; }
    }
    if ((ctx.wish || []).length && acts.length && !acts.some(a => (ctx.wish || []).includes(a.area)) && (ctx.pool || []).some(x => ctx.wish.includes(x.area))) why.push('no action addresses an area they chose');
    if (!Array.isArray(rep.keep) || rep.keep.length > 6 || !rep.keep.every(k => str(k, 240))) why.push('"keep doing" needs up to six short lines');
    if (!str(rep.next, 600)) why.push('"what happens next" is missing or too long');
    // the whole text: no wording we never use, no number that isn't theirs or a cited source's, nothing private
    const text = allText(rep);
    if (BANNED.test(text)) why.push(`wording we never use: "${(text.match(BANNED) || [''])[0]}"`);
    const citedAll = [...acts.flatMap(a => a.cites || []), ...((rep.ageing && rep.ageing.cites) || [])];
    const knownAll = new Set([...nums(ctx.factsText), ...citedAll.flatMap(id => pool[id] ? nums([pool[id].action, pool[id].freq, pool[id].start].join(' ')) : cards[id] ? nums(cards[id].text) : [])]);
    const stray = nums(text).find(x => !knownAll.has(x));
    if (stray) why.push(`the number ${stray} isn't in their answers or the cited sources`);
    if (ctx.privateText && ctx.privateText.length > 3 && text.toLowerCase().includes(ctx.privateText.toLowerCase())) why.push('the report includes the habit they asked to keep private');
    return [...new Set(why)];
  }

  // the report's own styles: used on the page and in the saved copy the Pilot opens
  const CSS = ".rep{display:grid;gap:22px}" +
    ".rpaper{background:var(--white,#fff);border-radius:24px;padding:clamp(20px,5vw,40px);display:grid;gap:14px}" +
    ".rpaper p{margin:0;max-width:64ch;font-size:16.5px;line-height:1.6}" +
    ".rey{font-family:var(--ui);font-size:12px!important;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}" +
    ".rep h1{font-family:var(--display);font-weight:300;font-size:clamp(30px,6vw,46px);line-height:1.08;margin:0;color:var(--plum);text-wrap:balance}" +
    ".rep h2{font-family:var(--display);font-weight:300;font-size:clamp(24px,4.4vw,32px);line-height:1.15;margin:0;color:var(--plum);text-wrap:balance}" +
    ".rep h3{font-family:var(--display);font-weight:400;font-size:21px;line-height:1.25;margin:0;color:var(--plum)}" +
    ".rlede{font-size:19px!important}" +
    ".rsafe{border:1px solid var(--plum);background:var(--cream,#fdf7f2)}" +
    ".rareas{display:grid;border-top:1px solid var(--line,rgba(77,40,49,.25))}" +
    ".rarea{display:grid;grid-template-columns:150px 1fr;gap:4px 16px;padding:14px 0;border-bottom:1px solid var(--line,rgba(77,40,49,.25))}" +
    ".rarea b{font-weight:500;display:block}" +
    ".rtag{display:inline-block;margin-top:4px;font-family:var(--ui);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}" +
    ".rt-chosen{color:var(--plum)}" +
    "@media (max-width:540px){.rarea{grid-template-columns:1fr}}" +
    ".ract{display:grid;gap:12px;padding-top:20px;border-top:2px solid var(--plum)}" +
    ".rkick{font-family:var(--ui);font-size:12px!important;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}" +
    ".rhow{background:#fbe9f0;border-radius:16px;padding:14px 18px;display:grid;gap:6px}" +
    ".rhow ul,.rkeep,.rsrcs{margin:0;padding-left:20px;display:grid;gap:6px;font-size:16px;line-height:1.55}" +
    ".rsrc{font-size:13.5px!important;color:var(--muted)}" +
    ".rsup summary{font-family:var(--ui);font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;color:var(--plum)}" +
    ".rsup ul{margin:8px 0 0;padding-left:18px;font-size:13px;color:var(--muted);display:grid;gap:6px;overflow-wrap:anywhere}" +
    ".rnote{font-size:13.5px!important;color:var(--muted)}";
  // ---- display: the report as a page section
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render(rep, ctx) {
    const pool = Object.fromEntries((ctx.pool || []).map(x => [x.id, x]));
    const cards = Object.fromEntries((ctx.cards || []).map(c => [c.id, c]));
    const srcLine = ids => {
      const s = [...new Set((ids || []).map(id => cards[id] ? cards[id].source.cite || cards[id].source.title : pool[id] ? `Good Span practice: ${pool[id].id}` : '').filter(Boolean))];
      return s.length ? `<p class="rsrc">Based on: ${esc(s.join('; '))}</p>` : '';
    };
    const supports = ids => {
      const refs = (ids || []).flatMap(id => pool[id] && pool[id].ref ? [pool[id].ref] : cards[id] ? [`${cards[id].source.title} (${cards[id].source.org}, ${cards[id].source.year})${cards[id].source.pmid ? ' · PMID ' + cards[id].source.pmid : ''}`] : []);
      return refs.length ? `<details class="rsup"><summary>What supports this</summary><ul>${[...new Set(refs)].map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>` : '';
    };
    const nowRows = AREAS.map(a => (rep.now || []).find(x => x.area === a)).filter(Boolean)
      .map(x => `<div class="rarea"><div><b>${esc(x.area)}</b><span class="rtag rt-${esc(x.status)}">${esc(STATUS[x.status])}</span></div><p>${esc(x.text)}</p></div>`).join('');
    const acts = (rep.actions || []).map(a => `<article class="ract">
      <p class="rkick">${esc(a.area)} · ${a.origin === 'chosen' ? 'your priority' : 'from your answers'}</p>
      <h3>${esc(a.title)}</h3><p>${esc(a.body)}</p>
      <div class="rhow"><b>In your week</b><ul>${(a.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
      <p><b>Why it matters for you:</b> ${esc(a.why)}</p>${srcLine(a.cites)}${supports(a.cites)}</article>`).join('');
    const cited = [...new Set([...(rep.actions || []).flatMap(a => a.cites || []), ...((rep.ageing && rep.ageing.cites) || [])])].filter(id => cards[id]);
    const srcs = [...new Map(cited.map(id => [cards[id].source.title, cards[id].source])).values()];
    return `<div class="rep">
  <section class="rpaper"><p class="rey">Your Good Span · ${esc(ctx.name || '')}${ctx.date ? ' · ' + esc(ctx.date) : ''}</p><h1>${esc(rep.headline)}</h1>${(rep.intro || []).map((p, i) => `<p${i ? '' : ' class="rlede"'}>${esc(p)}</p>`).join('')}</section>
  ${ctx.safety ? `<section class="rpaper rsafe"><p class="rey">${esc(ctx.safety.title)}</p><p>${esc(ctx.safety.text)}</p></section>` : ''}
  <section class="rpaper"><p class="rey">Where you are now</p><h2>A picture of your everyday health</h2><div class="rareas">${nowRows}</div></section>
  ${rep.ageing ? `<section class="rpaper"><p class="rey">What this means for ageing well</p><h2>${esc(rep.ageing.heading)}</h2>${rep.ageing.paras.map(p => `<p>${esc(p)}</p>`).join('')}${srcLine(rep.ageing.cites)}</section>` : ''}
  <section class="rpaper"><p class="rey">What to do</p><h2>${(rep.actions || []).length === 2 ? 'Two changes' : (rep.actions || []).length === 4 ? 'Four changes' : 'Three changes'} for the next month</h2>${acts}</section>
  ${(rep.keep || []).length ? `<section class="rpaper"><p class="rey">Keep doing</p><h2>What's already working</h2><ul class="rkeep">${rep.keep.map(k => `<li>${esc(k)}</li>`).join('')}</ul></section>` : ''}
  <section class="rpaper"><p class="rey">What happens next</p><h2>After your first month</h2><p>${esc(rep.next)}</p><p class="rnote">This report is not medical advice. If something about your health worries you, speak to a doctor.</p></section>
  ${srcs.length ? `<section class="rpaper"><p class="rey">Sources</p><ul class="rsrcs">${srcs.map(s => `<li>${esc(s.title)}. ${esc(s.org)}, ${s.year}${s.pmid ? ' · PMID ' + esc(s.pmid) : ''}</li>`).join('')}</ul></section>` : ''}
</div>`;
  }
    // a standalone copy of the report (the page the plan link opens): the brand colours, system fonts
  function page(rep, ctx) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Good Span</title><style>'
      + ':root{--plum:#4D2831;--pink:#F5A4C2;--blue:#D1E6E9;--muted:#6b5a5e;--white:#fff;--cream:#fdf7f2;--line:rgba(77,40,49,.25);--display:Georgia,"Times New Roman",serif;--ui:system-ui,-apple-system,"Segoe UI",sans-serif}'
      + 'body{margin:0;background:var(--blue);color:#2a1a1e;font-family:var(--display)}.report{max-width:760px;margin:0 auto;padding:24px 16px 72px}' + CSS
      + '</style></head><body><main class="report">' + render(rep, ctx) + '</main></body></html>';
  }
  const api = { AREAS, STATUS, BANNED, OPTOUT, CSS, check, render, page, allText };
  if (typeof module !== 'undefined') module.exports = api; else root.GSReport = api;
})(this);
