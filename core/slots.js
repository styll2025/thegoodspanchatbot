// The conversation's checklist: every answer the plan can use, as "slots" taken straight from questions.js.
// A slot is one question, or one row of a grid question. Keys are the question id ("q12") or "id.row" ("q7.veg").
// Display rules are never copied: a slot applies only when the canonical show(A) and gridRows(q, A) say so.
//
// Two kinds of slot:
// - verbatim: safety and sensitive questions. Always asked in their approved wording with their own options,
//   never filled from what someone says in passing. A mention in conversation only brings the question forward.
// - conversational: may be picked up from what the member says. Every picked-up value is shown back and
//   confirmed by the member before it is stored.
// Works in the browser (uses the globals from questions.js) and in node (require).
(function (root) {
  // in the browser questions.js is a plain script: its top-level consts are globals, not window properties
  const Q = typeof module !== 'undefined' ? require('./questions.js') : { QUESTIONS: QUESTIONS, SECTIONS: SECTIONS, gridRows: gridRows };
  const QS = Q.QUESTIONS, SECS = Q.SECTIONS, rowsOf = Q.gridRows;

  const VERBATIM = new Set(['q2a', 'q4', 'q5', 'q5a', 'q5b', 'q6', 'q11', 'q14', 'q19a', 'q29', 'q32', 'q40', 'q41', 'q42', 'q43', 'q44', 'q45', 'q48a']);
  // a plan cannot be made while one of these applies and has no answer: "clear" is never assumed
  const REQUIRED_SAFETY = new Set(['q4', 'q5', 'q5a', 'q5b', 'q6']);
  const SPECIAL = new Set(['q54', 'q59']);   // the personal habit (private or shared) and the final note: their own steps

  // the opening question of each area, from the conversation blueprint (02). Narrative first; slots fill what is missing.
  const OPENERS = {
    nutrition: 'Thinking about a typical week over the past month, how would you describe your eating routines? What tends to work well, and what feels harder?',
    sleep: 'How has your sleep been over the past month? What are your nights and mornings usually like?',
    movement: 'What kinds of movement or physical activity are part of your week at the moment? Which do you enjoy?',
    mind: 'How have stress and your mental wellbeing been for you recently? What helps you recover or feel more like yourself?',
    connection: 'How connected do you feel to the people around you? What kinds of connection matter to you?',
    prevention: "Are there any everyday habits that protect your health over time, or check-ups, that you'd like to pay attention to?",
    life: "Thinking about everything we've talked about, what would feel realistic for you to work on? How much time could you make available in a typical week?",
  };
  const TRANSITIONS = {
    about: "I'll ask a few more specific questions so the suggestions we make are suitable for your circumstances. Some relate to health. You can choose not to answer where that option is offered.",
  };
  const STAGES = SECS.map(s => s.id);   // focus, about, nutrition, sleep, movement, mind, connection, prevention, life

  const qById = id => QS.find(q => q.id === id);
  const shown = (q, A) => !q.show || q.show(A);

  // every slot, in the canonical order, whether or not it applies now
  function allSlots() {
    const out = [];
    for (const q of QS) {
      if (q.type === 'grid') for (const r of q.rows) out.push(slotOf(q, r));
      else out.push(slotOf(q));
    }
    return out;
  }
  function slotOf(q, r) {
    const base = { qid: q.id, stage: q.s, verbatim: VERBATIM.has(q.id), special: SPECIAL.has(q.id), optional: !!q.optional, requiredSafety: REQUIRED_SAFETY.has(q.id), hint: q.hint || '' };
    if (!r) return Object.assign(base, { key: q.id, type: q.type, text: q.text, options: q.options || [], max: q.max || null, exclusive: q.exclusive || [] });
    return Object.assign(base, { key: q.id + '.' + r[0], row: r[0], type: 'single', lead: q.text, text: r[1], options: r[2] || q.cols || [], max: null, exclusive: [] });
  }
  // the slots that apply to this member now
  function applicable(A) {
    const out = [];
    for (const q of QS) {
      if (!shown(q, A)) continue;
      if (q.type === 'grid') for (const r of rowsOf(q, A)) out.push(slotOf(q, r));
      else out.push(slotOf(q));
    }
    return out;
  }
  const bySlotKey = key => { const [id, row] = key.split('.'); const q = qById(id); if (!q) return null; if (!row) return q.type === 'grid' ? null : slotOf(q); const r = (q.rows || []).find(x => x[0] === row); return r ? slotOf(q, r) : null; };

  function get(A, s) { if (!s.row) return A[s.qid]; return (A[s.qid] || {})[s.row]; }
  function has(A, s) { const v = get(A, s); return v !== undefined && v !== null && !(Array.isArray(v) && !v.length) && v !== ''; }
  function set(A, s, v) {
    if (!s.row) { if (v === undefined) delete A[s.qid]; else A[s.qid] = v; return A; }
    A[s.qid] = Object.assign({}, A[s.qid] || {});
    if (v === undefined) delete A[s.qid][s.row]; else A[s.qid][s.row] = v;
    if (!Object.keys(A[s.qid]).length) delete A[s.qid];
    return A;
  }
  // a value is valid only when it is the slot's own option wording (or text for free-text slots)
  function valid(s, v) {
    if (s.type === 'text') return typeof v === 'string' && v.trim().length > 0 && v.length <= 600;
    if (s.type === 'habit') return v && typeof v.text === 'string' && v.text.trim().length > 0;
    if (s.type === 'single') return typeof v === 'string' && s.options.includes(v);
    if (s.type === 'multi') {
      if (!Array.isArray(v) || !v.length || v.some(x => !s.options.includes(x)) || new Set(v).size !== v.length) return false;
      if (s.max && v.length > s.max) return false;
      if (s.exclusive.length && v.length > 1 && v.some(x => s.exclusive.includes(x))) return false;
      const solo = /^(None of these|Nothing in particular|I’m not sure yet|Prefer not to say)$/;
      if (v.length > 1 && v.some(x => solo.test(x))) return false;
      return true;
    }
    return false;
  }
  // slots that still need an answer: applicable, unanswered, not skipped. Optional ones come last in their stage.
  function pending(A, skipped, stage) {
    const sk = new Set(skipped || []);
    return applicable(A).filter(s => (!stage || s.stage === stage) && !has(A, s) && !sk.has(s.key));
  }
  // answers that no longer apply (for example a pregnancy answer after age was corrected): removed, never kept silently
  function prune(A) {
    const keep = new Set(applicable(A).map(s => s.key));
    for (const s of allSlots()) if (has(A, s) && !keep.has(s.key)) set(A, s, undefined);
    return A;
  }
  // nothing that could change safety is assumed clear: every applicable required safety slot needs an answer
  function safetyGaps(A) { return applicable(A).filter(s => s.requiredSafety && !has(A, s)).map(s => s.key); }

  // what a mention in conversation brings forward (only questions that apply; never an answer)
  const SAFETY_TOPICS = { exercise_symptom: ['q5'], health_condition: ['q4'], pregnancy: ['q6'], eating_relationship: ['q11'], injury_or_fall: ['q29'], sleep_breathing: ['q14'], alcohol: ['q43'], smoking: ['q40'], mood: ['q32'] };

  const api = { STAGES, OPENERS, TRANSITIONS, VERBATIM, REQUIRED_SAFETY, SAFETY_TOPICS, allSlots, applicable, bySlotKey, get, has, set, valid, pending, prune, safetyGaps };
  if (typeof module !== 'undefined') module.exports = api; else root.GSSlots = api;
})(this);
