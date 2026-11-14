// The guide in the conversational evaluation (/conversation). Claude talks with the member; the app keeps the checklist.
//
// Three calls, all server-side (ANTHROPIC_API_KEY never reaches the page):
//   turn    — the member said something. Claude picks up answers to listed questions (as proposals the member
//             confirms), notes their own words about goals, context, barriers and past attempts, flags a mention
//             of a safety topic, and writes a short, warm reply.
//   ask     — Claude phrases the next question naturally. The meaning must not change; the options stay as buttons.
//   reflect — Claude reflects back what it heard before the member confirms their profile.
//
// What Claude cannot do here: give advice or a diagnosis, fill a safety or sensitive question (those are always asked
// word for word), set an answer the member hasn't confirmed, choose a practice, or change a rule. Every picked-up value
// must be one of the question's own options, for a question that applies to this member, or it is dropped.
//
// Optional settings: GS_TALK_MODEL (turns and reflection), GS_TALK_FAST_MODEL (phrasing).

const S = require('../core/slots.js');
const { BANNED } = require('./ai-story.js');

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const FAST_MODEL = 'claude-haiku-4-5';
function fromProcess(name) {
  try { return (typeof process !== 'undefined' && process.env && process.env[name]) || ''; } catch (e) { return ''; }
}
const clip = (t, n) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, n);
const SAFE = t => clip(t, 1500).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]');   // no email addresses go to the model

const GUIDE = `You are the guide in The Good Span evaluation: a calm, warm conversation that helps a person describe their everyday health and wellbeing, so their Good Span (a six-month wellbeing plan) can be prepared for them. You are not a clinician.

Always:
- British English. Plain, warm, brief. One main question at a time. No emojis, no exclamation marks.
- Reflect what they said in their own terms. Strengths are facts, not praise.
- Never give advice, recommendations, diagnoses, risk judgements or reassurance about health. Never suggest what they should do.
- Never call this an assessment or a test. It is "the evaluation" or simply this conversation.
- Never assume a habit, a cause or a feeling they haven't stated. Keep approximate things approximate.`;

const TURN_RULES = `Your job on this turn:
1. answers: pick up answers ONLY to the listed questions, ONLY where the person clearly states it. Use the option numbers shown.
   - "I walk quite a bit" does not give days or minutes of moderate exercise. "I sleep badly" does not give hours of sleep. "I eat reasonably well" gives no portions. Do not guess.
   - If they give an approximate value that sits inside one option, choose it with certainty "approximate". If it could be two options, leave it out.
   - Something they used to do is not current. Something that is "not practical" is not something they "tried".
   - Do not pick up "Something else" or "Other" unless they say their situation is not covered by the listed options.
   - Quote their own words as evidence (up to 12 words).
2. notes: keep what matters in their own words, up to 4 short notes: what they want and why (goal_meaning), life context (context), what gets in the way (barrier), what helps (facilitator), what they tried before and what they learned (previous_attempt). Do not interpret or label them.
3. safety: if they mention anything that may relate to one of these topics, name the topic, even if vague: exercise_symptom (chest pain or tightness, breathlessness, dizziness or fainting, heart racing, swollen ankles, calf pain when walking), health_condition, pregnancy, eating_relationship, injury_or_fall, sleep_breathing (loud snoring, stopping breathing), alcohol, smoking, mood (feeling low, hopeless or anxious). Otherwise "none". Never comment on it in your reply beyond thanking them; the app will ask the right questions.
4. reply: one or two short sentences that show you heard them. Do not ask anything, unless the question you just asked could not be answered from what they said: then ask one short, friendly clarifying question about that question only, and set clarify to true.`;

function slotLine(s) {
  const q = s.row ? `${s.lead} — ${s.text}` : s.text;
  return `[${s.key}] ${q}${s.type === 'multi' ? ` (choose any${s.max ? `, up to ${s.max}` : ''})` : ''}\n` + s.options.map((o, i) => `   ${i + 1}. ${o}`).join('\n');
}
function answersText(A) {
  const lines = [];
  for (const s of S.applicable(A)) {
    if (!S.has(A, s) || s.qid === 'q54') continue;   // the personal habit can be private: never sent
    const v = S.get(A, s), t = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? '' : v;
    if (t) lines.push(`- ${s.row ? `${s.lead} — ${s.text}` : s.text}: ${SAFE(t)}`);   // free text can hold an email address
  }
  return lines.join('\n');
}
function historyText(h) {
  return (Array.isArray(h) ? h : []).slice(-10).map(x => `${x && x.role === 'member' ? 'Member' : 'Guide'}: ${SAFE(x && x.text).slice(0, 500)}`).join('\n');
}
// answers can only be offered for questions that apply now and are conversational
function candidates(A, stage, opts) {
  const skip = new Set(opts.skipped || []);
  return S.applicable(A).filter(s => !s.verbatim && !s.special && s.qid !== 'q1' && !skip.has(s.key) && (opts.updates || !S.has(A, s))
    && (opts.updates || S.STAGES.indexOf(s.stage) >= S.STAGES.indexOf(stage)));
}

async function callClaude({ fetchImpl, apiKey, model, system, tool, content, maxTokens, temperature }) {
  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens || 700, temperature: temperature == null ? 0.3 : temperature, system, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content }] }) });
  } catch (e) { return { error: 'upstream_unreachable' }; }
  if (!res.ok) return { error: 'upstream_error', status: res.status };
  const data = await res.json();
  const call = (data.content || []).find(c => c.type === 'tool_use' && c.name === tool.name);
  return call && call.input ? { input: call.input } : { error: 'no_tool_call' };
}

const TOPICS = ['none', ...Object.keys(S.SAFETY_TOPICS)];
const NOTE_KINDS = ['goal_meaning', 'context', 'barrier', 'facilitator', 'previous_attempt'];
const AREAS = ['Nutrition', 'Sleep', 'Movement', 'Mind', 'Connection', 'Prevention', 'General'];

async function turn(body, o) {
  const A = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const stage = S.STAGES.includes(body.stage) ? body.stage : 'focus';
  const said = SAFE(body.text);
  if (!said) return { status: 400, json: { error: 'bad_request' } };
  const asked = typeof body.asked === 'string' ? body.asked : '';
  const cands = candidates(A, stage, { updates: !!body.updates, skipped: body.skipped });
  const askedSlot = cands.find(s => s.key === asked) || null;
  const content = [
    `Area now: ${stage}.`, '',
    'Answers already confirmed:', answersText(A) || '(none yet)', '',
    'Conversation so far:', historyText(body.history) || '(start)', '',
    askedSlot ? `You just asked: [${askedSlot.key}] ${askedSlot.row ? askedSlot.lead + ' — ' + askedSlot.text : askedSlot.text}` : asked.startsWith('open:') ? 'You just asked an open question about this area.' : '',
    '', 'Questions you may pick up answers for:', cands.map(slotLine).join('\n') || '(none)', '',
    `The person's latest message: "${said}"`,
    body.updates ? '\nThey are correcting their summary: answers may replace earlier ones.' : '',
  ].join('\n');
  const tool = { name: 'record_turn', description: 'Record what the person said and your reply.', input_schema: { type: 'object', properties: {
    answers: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, options: { type: 'array', items: { type: 'integer' } }, certainty: { type: 'string', enum: ['explicit', 'approximate'] }, evidence: { type: 'string' } }, required: ['key', 'options', 'certainty', 'evidence'] } },
    notes: { type: 'array', items: { type: 'object', properties: { area: { type: 'string', enum: AREAS }, kind: { type: 'string', enum: NOTE_KINDS }, text: { type: 'string' } }, required: ['area', 'kind', 'text'] } },
    safety: { type: 'string', enum: TOPICS },
    reply: { type: 'string' }, clarify: { type: 'boolean' } }, required: ['answers', 'notes', 'safety', 'reply', 'clarify'] } };
  const r = await callClaude({ fetchImpl: o.fetchImpl, apiKey: o.apiKey, model: o.model || fromProcess('GS_TALK_MODEL') || DEFAULT_MODEL, system: GUIDE + '\n\n' + TURN_RULES, tool, content, maxTokens: 900, temperature: 0.2 });
  if (r.error) return { status: 502, json: r };
  return { status: 200, json: cleanTurn(r.input, cands, said) };
}
// only real options, for questions that apply, survive; the member still confirms each one
function cleanTurn(x, cands, said) {
  const byKey = Object.fromEntries(cands.map(s => [s.key, s]));
  const proposals = [];
  for (const a of Array.isArray(x.answers) ? x.answers : []) {
    const s = byKey[a && a.key]; if (!s || proposals.some(p => p.key === s.key)) continue;
    const opts = [...new Set((a.options || []).map(n => s.options[n - 1]).filter(Boolean))];
    const value = s.type === 'multi' ? opts : opts[0];
    if (!opts.length || (s.type === 'single' && opts.length !== 1) || !S.valid(s, value)) continue;
    proposals.push({ key: s.key, value, certainty: a.certainty === 'explicit' ? 'explicit' : 'approximate', evidence: clip(a.evidence, 160) });
  }
  const notes = (Array.isArray(x.notes) ? x.notes : []).filter(n => n && NOTE_KINDS.includes(n.kind) && AREAS.includes(n.area) && clip(n.text, 220)).slice(0, 4)
    .map(n => ({ area: n.area, kind: n.kind, text: clip(n.text, 220) }));
  const safety = TOPICS.includes(x.safety) ? x.safety : 'none';
  let reply = clip(x.reply, 320);
  if (!reply || BANNED_REPLY.test(reply)) reply = 'Thank you, that helps.';
  return { proposals, notes, safety, reply, clarify: !!x.clarify && /\?$/.test(reply) };
}
// the guide's own words never carry clinical or advice wording
const BANNED_REPLY = /diagnos|disorder|depress|illness|disease|you should|you must|I recommend|I suggest|try to |make sure|cure|treat|journey|assessment|!/i;

async function ask(body, o) {
  const s = S.bySlotKey(String(body.key || ''));
  const A = body.answers && typeof body.answers === 'object' ? body.answers : {};
  if (!s || s.verbatim || s.special || !S.applicable(A).some(x => x.key === s.key)) return { status: 400, json: { error: 'bad_request' } };
  const canonical = s.row ? `${s.lead} — ${s.text}` : s.text;
  const content = [
    'Recent conversation:', historyText(body.history) || '(start)', '',
    `Ask this question next, in your own natural words: "${canonical}"`,
    s.hint ? `(Note under it: ${s.hint})` : '',
    `The answer buttons shown under your words are: ${s.options.join(' | ')}. Don't list them.`,
    body.name ? `Their first name is ${clip(body.name, 40)}. Use it rarely.` : '',
  ].join('\n');
  const tool = { name: 'say_question', description: 'The next question, phrased naturally.', input_schema: { type: 'object', properties: { say: { type: 'string', description: 'At most two short sentences, ending with the question. You may briefly acknowledge their last answer first.' } }, required: ['say'] } };
  const r = await callClaude({ fetchImpl: o.fetchImpl, apiKey: o.apiKey, model: o.fastModel || fromProcess('GS_TALK_FAST_MODEL') || FAST_MODEL, system: GUIDE + '\n\nKeep the exact meaning and time frame of the question. Never change what is being asked, never add a new question, never add advice.', tool, content, maxTokens: 200, temperature: 0.5 });
  const say = r.input ? clip(r.input.say, 280) : '';
  // the question's meaning must survive: it ends as a question, carries no advice, and adds no number the question doesn't have
  const nums = t => (t.match(/\d+/g) || []);
  const known = new Set(nums(canonical + ' ' + s.options.join(' ') + ' ' + (s.hint || '')));
  const ok = say && /\?$/.test(say) && !BANNED_REPLY.test(say) && nums(say).every(n => known.has(n));
  return { status: 200, json: { say: ok ? say : canonical, source: ok ? 'ai' : 'canonical' } };
}

async function reflect(body, o) {
  const A = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 30).map(n => `- ${clip(n.area, 20)} · ${clip(n.kind, 20)}: ${SAFE(n.text).slice(0, 220)}`).join('\n');
  const facts = answersText(A);
  const content = ['Their confirmed answers:', facts || '(none)', '', 'What they said in their own words:', notes || '(none)'].join('\n');
  const tool = { name: 'reflect', description: 'Reflect back what you understood.', input_schema: { type: 'object', properties: { paragraphs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 } }, required: ['paragraphs'] } };
  const sys = GUIDE + `\n\nWrite a short reflection (90 to 160 words, two or three short paragraphs) that follows this shape: what they said they want and why, in their words; what they already do that works; what shapes their routines (context, what gets in the way, what helps); and their preferences and available time. Use only what is listed. No interpretation of health, no advice, no plan, no numbers that are not in their answers. Do not ask a question; the app asks what to correct.`;
  const r = await callClaude({ fetchImpl: o.fetchImpl, apiKey: o.apiKey, model: o.model || fromProcess('GS_TALK_MODEL') || DEFAULT_MODEL, system: sys, tool, content, maxTokens: 700, temperature: 0.4 });
  if (r.error) return { status: 502, json: r };
  const paras = (r.input.paragraphs || []).map(p => clip(p, 900)).filter(Boolean);
  const text = paras.join(' ');
  const known = new Set((facts + ' ' + notes).match(/\d+/g) || []);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (!paras.length || words > 200 || BANNED.test(text) || /\?/.test(text) || (text.match(/\d+/g) || []).some(n => !known.has(n))) return { status: 422, json: { error: 'rejected' } };
  return { status: 200, json: { paragraphs: paras } };
}

async function handleConverse(body, { fetchImpl = fetch, apiKey = fromProcess('ANTHROPIC_API_KEY'), model = '', fastModel = '' } = {}) {
  if (!apiKey) return { status: 503, json: { error: 'not_configured' } };
  if (!body || typeof body !== 'object') return { status: 400, json: { error: 'bad_request' } };
  const o = { fetchImpl, apiKey, model, fastModel };
  if (body.mode === 'turn') return turn(body, o);
  if (body.mode === 'ask') return ask(body, o);
  if (body.mode === 'reflect') return reflect(body, o);
  return { status: 400, json: { error: 'bad_request' } };
}

if (typeof module !== 'undefined') module.exports = { handleConverse, cleanTurn, candidates, answersText, GUIDE, TURN_RULES };
