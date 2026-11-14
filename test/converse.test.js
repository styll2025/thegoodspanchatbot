// The conversational evaluation's server side, with a stand-in for the Anthropic API (no key or network needed).
const assert = require('assert');
const S = require('../core/slots.js');
const { handleConverse } = require('../server/ai-converse.js');
const tool = input => async () => ({ ok: true, json: async () => ({ content: [{ type: 'tool_use', name: Object.keys(input)[0], input: Object.values(input)[0] }] }) });

(async () => {
  const A = { q1: ['Nutrition'], q2: '30-39' };
  const conv = S.applicable(A).find(s => !s.verbatim && !s.special && s.qid !== 'q1' && s.type === 'single' && s.stage === 'nutrition');
  assert(conv, 'a conversational nutrition question applies');
  // turn: a valid option is proposed; verbatim, unknown and out-of-range answers are dropped; banned replies replaced
  let sent;
  let out = await handleConverse({ mode: 'turn', stage: 'nutrition', answers: A, text: 'I cook most nights. me@x.com' }, { apiKey: 'k', fetchImpl: async (u, o) => { sent = JSON.parse(o.body); return tool({ record_turn: {
    answers: [{ key: conv.key, options: [1], certainty: 'explicit', evidence: 'I cook most nights' }, { key: 'q4', options: [1], certainty: 'explicit', evidence: 'x' }, { key: 'q999', options: [1], certainty: 'explicit', evidence: 'x' }, { key: conv.key, options: [2], certainty: 'explicit', evidence: 'dup' }],
    notes: [{ area: 'Nutrition', kind: 'facilitator', text: 'Cooks most nights' }, { area: 'Nope', kind: 'x', text: 'bad' }], safety: 'none', reply: 'That sounds like a good rhythm.', clarify: false } })(); } });
  assert.strictEqual(out.status, 200);
  assert.deepStrictEqual(out.json.proposals.map(p => [p.key, p.value]), [[conv.key, conv.options[0]]]);
  assert.strictEqual(out.json.notes.length, 1);
  assert(!/me@x\.com/.test(JSON.stringify(sent)), 'no email address sent');
  assert(!/q54|q4\]/.test(sent.messages[0].content.split('Questions you may pick up')[1] || ''), 'verbatim questions are not offered for pick-up');
  out = await handleConverse({ mode: 'turn', stage: 'nutrition', answers: A, text: 'chest pain when I run' }, { apiKey: 'k', fetchImpl: tool({ record_turn: { answers: [{ key: conv.key, options: [99], certainty: 'explicit', evidence: 'x' }], notes: [], safety: 'exercise_symptom', reply: 'You should see a doctor!', clarify: false } }) });
  assert.strictEqual(out.json.proposals.length, 0, 'option out of range dropped');
  assert.strictEqual(out.json.safety, 'exercise_symptom');
  assert.strictEqual(out.json.reply, 'Thank you, that helps.', 'advice wording replaced');
  // ask: verbatim questions are never rephrased; bad phrasing falls back to the approved text
  assert.strictEqual((await handleConverse({ mode: 'ask', key: 'q5', answers: A }, { apiKey: 'k', fetchImpl: tool({ say_question: { say: 'x?' } }) })).status, 400);
  out = await handleConverse({ mode: 'ask', key: conv.key, answers: A }, { apiKey: 'k', fetchImpl: tool({ say_question: { say: 'Over 17 days, how often?' } }) });
  assert.strictEqual(out.json.source, 'canonical', 'new number rejected');
  out = await handleConverse({ mode: 'ask', key: conv.key, answers: A }, { apiKey: 'k', fetchImpl: tool({ say_question: { say: 'Thanks. And how does that usually go for you?' } }) });
  assert.strictEqual(out.json.source, 'ai');
  // reflect: questions, advice and invented numbers are rejected
  const bad = await handleConverse({ mode: 'reflect', answers: A, notes: [] }, { apiKey: 'k', fetchImpl: tool({ reflect: { paragraphs: ['You want to eat better, so you should cut sugar for 21 days.'] } }) });
  assert.strictEqual(bad.status, 422);
  const good = await handleConverse({ mode: 'reflect', answers: A, notes: [] }, { apiKey: 'k', fetchImpl: tool({ reflect: { paragraphs: ['You would like to focus on how you eat, and you are in your thirties.'] } }) });
  assert.strictEqual(good.status, 200);
  assert.strictEqual((await handleConverse({ mode: 'turn', text: 'hi' }, { apiKey: '' })).status, 503, 'no key: not configured');
  assert.strictEqual((await handleConverse({ mode: 'other' }, { apiKey: 'k' })).status, 400);
  console.log('conversation endpoint: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
