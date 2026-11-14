// The AI-written Good Span report for the conversational evaluation (/conversation).
//
// Two calls, server-side (ANTHROPIC_API_KEY never reaches the page):
//   write  — Claude writes the report from the person's confirmed answers, their own words, the practices the rules
//            allow for them (all areas, already filtered for safety and opt-outs) and the approved evidence statements
//            that apply to them. It recommends two to four actions, each citing practices or statements.
//   verify — a second, independent pass reads the report against the same material and lists every statement that
//            isn't supported by what the person said or by a cited source.
// The page also runs core/report.js checks. If either fails, it asks once more with the reasons, then falls back
// to the rules' own Good Span.
//
// Needs ANTHROPIC_API_KEY. Optional: GS_REPORT_MODEL.

const S = require('../core/slots.js');
const EV = require('../core/evidence.js');
const R = require('../core/report.js');
const { toFeatures } = require('../core/questions.js');
const { answersText } = require('./ai-converse.js');

const DEFAULT_MODEL = 'claude-sonnet-4-5';
function fromProcess(name) {
  try { return (typeof process !== 'undefined' && process.env && process.env[name]) || ''; } catch (e) { return ''; }
}
const clip = (t, n) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, n);
const SAFE = t => clip(t, 1500).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]');

const WRITER = `You write a person's Good Span report for The Good Span, a six-month programme for healthy ageing. The person has just finished a conversation about their everyday life. You are not a clinician: no diagnosis, no medical advice, no risk predictions, no scores, no promises.

What the report must do:
- Make them feel understood and tell them something useful they didn't already know. Never patronise: don't recommend the obvious in general terms, and don't recommend what they already do well. Be specific to their life.
- Give an honest picture of where they are now across the six areas, then what that means for ageing well, then two to four concrete actions for the next month, then what to keep doing.
- Lead with what they chose to work on and what they said matters to them. You may add an action from their answers if it matters more for healthy ageing, marked as "answers" and explained.

Actions (not a list of practices):
- Each action is something to do in their real week: concrete, fitted to their routines, work, caring, what helps and what gets in the way. Use their own words where it helps.
- Each action must cite at least one practice id or statement id from the lists given, and must be consistent with what it cites. Practices are already checked for safety and their opt-outs; statements are what recognised sources recommend. Never recommend anything that isn't supported by what you cite.
- Use the cited practice's frequency and amount; don't make it bigger. Adapt how and when, not how much.
- Numbers: only numbers from their answers, the cited practices or the cited statements.

Where they are now: one line per area, status one of: strong (their answers show this is in a good place), chosen (an area they chose: always use this for the areas they chose), opportunity (their answers show room to improve), unclear (not enough information, or they preferred not to say). Never present missing information as a problem.

Style: British English, warm, direct and plain. "You" not "the member". No exclamation marks. No "journey", "transform", "best self". Don't name health conditions they didn't mention. Use "may" and "can" for effects; never say an action will prevent a disease or add years. Never mention anything about their personal habit or contact details.`;

const VERIFIER = `You check a Good Span report before a person sees it. You receive what the person said (their confirmed answers and their own words), the practices and evidence statements the report could cite, and the report.

List every statement in the report that is not supported:
- a fact about the person that isn't in their answers or their words (including assumed feelings, habits or causes),
- a health claim that goes beyond the statement or practice it cites,
- advice that conflicts with what they said they'd rather not do or with their circumstances,
- an action bigger than the cited practice's frequency or amount.
Approximate paraphrases of what they said are fine. Reasonable practical suggestions on how to fit a cited practice into their week are fine. If everything is supported, return an empty list.`;

function material(body) {
  const A = Object.assign({}, body.answers && typeof body.answers === 'object' ? body.answers : {});
  delete A.q54; delete A.more;   // the personal habit can be private, and "something else" words are for the Pilot: never sent
  const p = toFeatures(A);
  const cards = EV.forProfile(p);
  const pool = (Array.isArray(body.pool) ? body.pool : []).slice(0, 60).map(x => ({ id: clip(x.id, 60), area: clip(x.area, 20), action: clip(x.action, 200), freq: clip(x.freq, 160), start: clip(x.start, 300), evidence: clip(x.evidence, 20), why: clip(x.why, 300) }));
  const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 30).map(n => `- ${clip(n.area, 20)} · ${clip(n.kind, 20)}: ${SAFE(n.text).slice(0, 220)}`).join('\n');
  const facts = answersText(A);
  const ctx = { wish: p.wish || [], held: !!body.held || !!(p.symptoms && !p.symptoms_cleared), optout: p.optout || [], pool, cards, factsText: [facts, notes, SAFE(body.opening)].join('\n') };
  const text = [
    `Areas they chose to work on: ${(p.wish || []).join(' and ') || 'none (unsure where to start)'}.`,
    body.opening ? `What they'd like to feel different, in their words: "${SAFE(body.opening).slice(0, 400)}"` : '',
    `Time they can give a week: ${clip(body.timeTxt, 40) || 'not given'}. Size of change they want: ${clip(body.change, 20) || 'not given'}.`,
    ctx.held ? 'Activity is on hold until they have spoken to a doctor about symptoms they reported: no movement actions.' : '',
    '', 'Their confirmed answers:', facts || '(none)',
    '', 'In their own words:', notes || '(none)',
    '', 'Practices you may cite (id · area · what · how often · why the rules suggest it):',
    pool.map(x => `[${x.id}] ${x.area} · ${x.action} · ${x.freq}${x.why ? ' · ' + x.why : ''}`).join('\n') || '(none)',
    '', 'Approved statements you may cite (id · area · statement · source):',
    cards.map(c => `[${c.id}] ${c.area} · ${c.text} · ${c.source.cite || c.source.title}`).join('\n'),
    body.rulesPlan ? `\nFor reference, the standard plan the rules would suggest: ${clip(body.rulesPlan, 300)}. You don't have to follow it.` : '',
  ].join('\n');
  return { ctx, text };
}

const REPORT_TOOL = { name: 'write_report', description: 'The Good Span report.', input_schema: { type: 'object', properties: {
  headline: { type: 'string', description: 'One sentence, up to 110 characters, that captures their situation. Not generic.' },
  intro: { type: 'array', items: { type: 'string' }, description: 'One or two short paragraphs: what they want and why, and the main thread of the report.' },
  now: { type: 'array', items: { type: 'object', properties: { area: { type: 'string', enum: R.AREAS }, status: { type: 'string', enum: Object.keys(R.STATUS) }, text: { type: 'string' } }, required: ['area', 'status', 'text'] }, description: 'Exactly one per area, all six.' },
  ageing: { type: 'object', properties: { heading: { type: 'string' }, paras: { type: 'array', items: { type: 'string' } }, cites: { type: 'array', items: { type: 'string' } } }, required: ['heading', 'paras', 'cites'], description: 'What their picture means for ageing well, from the approved statements.' },
  actions: { type: 'array', items: { type: 'object', properties: {
    area: { type: 'string', enum: R.AREAS }, origin: { type: 'string', enum: ['chosen', 'answers'] }, title: { type: 'string', description: 'Up to 80 characters, an instruction in their terms.' },
    body: { type: 'string', description: 'What to do and how, fitted to their life. Up to 4 sentences.' }, steps: { type: 'array', items: { type: 'string' }, description: 'Two or three concrete steps for their week.' },
    why: { type: 'string', description: 'Why it matters for them, in one or two sentences.' }, cites: { type: 'array', items: { type: 'string' } } }, required: ['area', 'origin', 'title', 'body', 'steps', 'why', 'cites'] } },
  keep: { type: 'array', items: { type: 'string' }, description: 'Up to five things they already do that are worth keeping, specific to them.' },
  next: { type: 'string', description: 'What happens next: their Pilot checks in after four weeks; they can change anything that does not fit.' },
}, required: ['headline', 'intro', 'now', 'ageing', 'actions', 'keep', 'next'] } };

async function callClaude({ fetchImpl, apiKey, model, system, tool, content, maxTokens, temperature }) {
  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content }] }) });
  } catch (e) { return { error: 'upstream_unreachable' }; }
  if (!res.ok) return { error: 'upstream_error', status: res.status };
  const data = await res.json();
  const call = (data.content || []).find(c => c.type === 'tool_use' && c.name === tool.name);
  return call && call.input ? { input: call.input } : { error: 'no_tool_call' };
}

async function handleReport(body, { fetchImpl = fetch, apiKey = fromProcess('ANTHROPIC_API_KEY'), model = '' } = {}) {
  if (!apiKey) return { status: 503, json: { error: 'not_configured' } };
  if (!body || typeof body !== 'object' || !body.answers) return { status: 400, json: { error: 'bad_request' } };
  const { ctx, text } = material(body);
  const m = model || fromProcess('GS_REPORT_MODEL') || DEFAULT_MODEL;
  if (body.mode === 'verify') {
    const rep = body.report && typeof body.report === 'object' ? body.report : null;
    if (!rep) return { status: 400, json: { error: 'bad_request' } };
    const tool = { name: 'list_problems', description: 'Unsupported statements in the report.', input_schema: { type: 'object', properties: { problems: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, problem: { type: 'string' } }, required: ['quote', 'problem'] } } }, required: ['problems'] } };
    const r = await callClaude({ fetchImpl, apiKey, model: m, system: VERIFIER, tool, content: text + '\n\nThe report:\n' + JSON.stringify(rep).slice(0, 12000), maxTokens: 900, temperature: 0 });
    if (r.error) return { status: 502, json: r };
    return { status: 200, json: { problems: (Array.isArray(r.input.problems) ? r.input.problems : []).slice(0, 12).map(x => ({ quote: clip(x.quote, 200), problem: clip(x.problem, 240) })) } };
  }
  const feedback = Array.isArray(body.feedback) && body.feedback.length ? `\n\nYour previous report was rejected. Fix these and keep everything else that was right:\n- ${body.feedback.slice(0, 12).map(x => clip(x, 240)).join('\n- ')}` : '';
  const r = await callClaude({ fetchImpl, apiKey, model: m, system: WRITER, tool: REPORT_TOOL, content: text + feedback, maxTokens: 3500, temperature: 0.4 });
  if (r.error) return { status: 502, json: r };
  const rep = r.input;
  const problems = R.check(rep, ctx);   // the same checks the page runs, so a bad report is caught early
  return { status: 200, json: { report: rep, problems } };
}

if (typeof module !== 'undefined') module.exports = { handleReport, material, WRITER, VERIFIER };
