// The AI-written report: the checks every report must pass, the evidence statements, and the endpoint's guard rails.
// Uses a stand-in for the Anthropic API (no key or network needed).
const assert = require('assert');
const { env, buildResult } = require('../scripts/lib.js');
const R = require('../core/report.js');
const EV = require('../core/evidence.js');
const { toFeatures } = require('../core/questions.js');
const { answersText } = require('../server/ai-converse.js');
const { handleReport } = require('../server/ai-report.js');
const ex = require('../examples/answers.json');
const good = require('./fixtures/report-maria.json');
const copy = o => JSON.parse(JSON.stringify(o));
const ctxOf = (name, A) => { const r = buildResult(name, A, env), p = toFeatures(A); return { r, p, ctx: { wish: p.wish, held: r.held, optout: p.optout, pool: r.pool, cards: EV.forProfile(p), factsText: answersText(A), privateText: A.q54 && !/Share/.test(A.q54.choice || '') ? A.q54.text : '' } }; };
const has = (why, re) => why.some(x => re.test(x));

(async () => {
  const { ctx } = ctxOf('Maria', ex.Maria);
  assert.deepStrictEqual(R.check(good, ctx), [], 'the sample report passes');
  // a practice made bigger than the library's: beans "once a week" is not "2–3 times a week"
  let b = copy(good); b.actions[0].steps[1] = 'Have beans, lentils or chickpeas 2–3 times a week.';
  assert(has(R.check(b, ctx), /not the amount in the practice/), 'a bigger amount than the practice is caught');
  b = copy(good); b.actions[1].cites = [];
  assert(has(R.check(b, ctx), /must cite/), 'an action with no source');
  b = copy(good); b.actions[1].cites = ['Cold showers'];
  assert(has(R.check(b, ctx), /not a practice or approved statement/), 'an unknown practice');
  b = copy(good); b.actions[2].origin = 'chosen';
  assert(has(R.check(b, ctx), /didn't choose Movement/), 'an action presented as their choice when it is not');
  b = copy(good); b.now[2].status = 'chosen';
  assert(has(R.check(b, ctx), /Movement is marked/), 'an area presented as chosen');
  b = copy(good); b.now[0].status = 'strong';
  assert(has(R.check(b, ctx), /must be marked "you chose this"/), 'a chosen area must say so');
  b = copy(good); b.now.pop();
  assert(has(R.check(b, ctx), /six areas/), 'all six areas');
  b = copy(good); b.intro[1] += ' This will prevent dementia.';
  assert(has(R.check(b, ctx), /wording we never use/), 'no prevention claims');
  b = copy(good); b.headline = 'Your longevity score is 82';
  assert(has(R.check(b, ctx), /wording we never use|number 82/), 'no scores');
  b = copy(good); b.actions = [b.actions[2], b.actions[2]];
  assert(has(R.check(b, ctx), /no action addresses an area they chose/), 'their choice comes first');
  // safety: symptoms not yet discussed with a doctor, so no movement action and no movement practices at all
  const hugo = ctxOf('Hugo', ex.Hugo);
  assert(hugo.ctx.held && !hugo.ctx.pool.some(x => x.area === 'Movement'), 'held: movement practices left out');
  assert(!hugo.ctx.cards.some(c => ['pa_aerobic', 'pa_strength', 'pa_sitting', 'pa_some'].includes(c.id)), 'held: no activity statements');
  b = copy(good); b.now.find(x => x.area === 'Nutrition').status = 'opportunity'; b.now.find(x => x.area === 'Movement').status = 'chosen';
  assert(has(R.check(b, hugo.ctx), /no movement action while activity is on hold/), 'held: a movement action is refused');
  // opt-outs: Marta would rather not meditate
  const marta = ctxOf('Marta', ex.Marta);
  b = copy(good); b.actions[1].body += ' A short meditation can help.';
  assert(has(R.check(b, marta.ctx), /rather not do \(meditation\)/), 'opt-out respected');
  // Scenario D: pregnancy, heart condition, nut allergy, a private habit
  const sara = ctxOf('Sara', ex['Sara (chat run)']);
  assert(!sara.ctx.pool.some(x => x.id === 'Nuts'), 'nut allergy: no nut practice');
  assert(!sara.ctx.cards.some(c => ['pa_aerobic', 'pa_strength', 'diet_plants'].includes(c.id)), 'pregnancy, heart condition, nut allergy: those statements are left out');
  b = copy(good); b.keep.push('Keep making time to read more books.');
  assert(has(R.check(b, sara.ctx), /keep private/), 'a private habit never appears');
  // every statement has a source with a title, organisation and year; drafts are marked
  assert.strictEqual(EV.STATUS, 'draft');
  for (const c of EV.CARDS) assert(EV.SOURCES[c.src] && EV.SOURCES[c.src].title && EV.SOURCES[c.src].year, c.id);
  // the endpoint: no key, bad request, nothing private or personal sent, the page's checks run on the server too
  assert.strictEqual((await handleReport({ answers: {} }, { apiKey: '' })).status, 503);
  assert.strictEqual((await handleReport({}, { apiKey: 'k' })).status, 400);
  let sent;
  const A = copy(ex['Sara (chat run)']); A.q59 = 'email me at sara@example.com';
  const reply = input => async (u, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: sent.tools[0].name, input }] }) }; };
  let out = await handleReport({ mode: 'write', answers: A, notes: [], pool: sara.ctx.pool }, { apiKey: 'k', fetchImpl: reply(good) });
  assert.strictEqual(out.status, 200);
  const prompt = sent.messages[0].content;
  assert(!/read more books/.test(prompt), 'the private habit is not sent');
  assert(!/sara@example\.com/.test(prompt), 'no email address sent');
  assert(!/\[Nuts\]/.test(prompt) && !/\[pa_aerobic\]/.test(prompt), 'only what is allowed for her is offered');
  assert(out.json.problems.length > 0, 'the server runs the same checks');
  out = await handleReport({ mode: 'verify', answers: ex.Maria, pool: ctx.pool, report: good }, { apiKey: 'k', fetchImpl: reply({ problems: [{ quote: 'gardening', problem: 'not stated' }] }) });
  assert.deepStrictEqual(out.json.problems, [{ quote: 'gardening', problem: 'not stated' }]);
  // the page's report renders the actions, sources and the safety notice
  const html = R.render(good, Object.assign({}, ctx, { name: 'Maria', safety: { title: 'One thing to check first', text: 'Talk to a doctor.' } }));
  assert(/Make your late workdays/.test(html) && /Lancet 2024/.test(html) && /One thing to check first/.test(html) && /PMID 39096926/.test(html));
  assert(!/<script/i.test(R.render(Object.assign(copy(good), { headline: '<script>x</script>' }), ctx)), 'text is escaped');
  console.log('report: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
