# Good Span plan generator

Turns a member's assessment answers into their Good Span result page. Everything runs on fixed rules in plain JavaScript: **no API key, no AI service and no server needed**. The same answers always give the same plan.

## How it fits together

```
answers (A)  ──►  toFeatures(A)  ──►  engine.plan()  ──►  buildResult()  ──►  result page template
 the chat or      core/questions.js    core/engine.js      core/result.js       templates/result_page.tpl.html
 the form                              + data/library.json + core/profile.js
```

| File | What it does |
|---|---|
| `core/questions.js` | The 52 questions, their conditions (`show(A)`) and `toFeatures(A)`, which turns answers into the features the engine reads. |
| `core/engine.js` | Chooses practices, applies the safety rules, opt-outs and time budget, and writes the reasons. Same output as the current repo engine (checked on 100 profiles); it also has a `__perPillar` mode that lists the next practices in every pillar. |
| `data/library.json` | The practice library: levels, minutes, safety exclusions, reasons and references. |
| `core/profile.js` | One short, factual paragraph per pillar from the member's own answers (used for the Starting Position). |
| `core/result.js` | **New.** `buildResult(name, answers, env)` applies the agreed plan structure and writes the page copy. |
| `templates/result_page.tpl.html` | The result page. Placeholders: `__DATA__` (array of records from `buildResult`), `__IMG__` (pillar photos), fonts and logo. It still contains the hand-written copy for Inês, Marta and Hugo; any record with `gen: true` uses its own generated copy instead. |
| `templates/conversation.tpl.html` | The conversational assessment: welcome, the opening question, then the 52 questions with short acknowledgements. At the end, **See my Good Span** calls `buildResult` and shows the page in a full-screen frame. |
| `reference/` | The current built prototype and the hand-reviewed page for Inês, Marta and Hugo, for comparison. |

## Use

```js
const DATA = require('./data/library.json');
const { makeEngine } = require('./core/engine.js');
const { toFeatures } = require('./core/questions.js');
const { profile } = require('./core/profile.js');
const { buildResult } = require('./core/result.js');

const record = buildResult('Marta', answers, { E: makeEngine(DATA), DATA, toFeatures, profile });
```

In the browser the same files load as plain scripts (`makeEngine` and `buildResult` become globals; wrap `profile.js` as the conversation build does, because it declares top-level helpers).

`answers` uses the question ids as keys: single choice → string, multi → array, grids → `{ rowKey: option }`, q54 → `{ text, choice }`. See `examples/answers.json`.

## Scripts (Node 18+)

- `node scripts/generate.js`: builds plans for `examples/answers.json` and writes `out/plans.json`, `out/result_page.html` and `out/conversation.html`.
- `node test/check.js`: runs 100 test profiles and checks the rules below. It exits with an error if any fail. Run it after any change to the rules or the library.

## The plan rules in `result.js`

1. **Focus areas.** These are the engine's priorities. Movement is left out while a symptom hasn't been checked by a doctor. An area only counts if there is something safe to offer there.
2. **Month 1.** At most three practices, and each must trace back to an answer. Lighter-touch fillers are dropped. Month 1 must fit the lower end of the member's time; if a practice doesn't fit, it starts at an easier level of the same practice.
3. **The member's own choice comes first.** If they chose an area that is in focus, month 1 starts there (up to two practices per area). Other focus areas join from month 3.
4. **Months 2 and 3.**
   - Month 2 adds up to two practices. It adds only one if the member wants small steps or another focus area is waiting, and never more than month 1 started with.
   - Month 3 adds one.
   - Both months stay within the member's time. Anything else moves to months 4–5.
5. **Only when the answers point to it:**
   - eating windows, if they already keep one some of the time;
   - screen-free evenings, if screens affect their sleep or they use social media heavily.
6. **Notices:**
   - "One thing to check first", when a symptom hasn't been checked by a doctor;
   - "Something worth discussing", when they've felt anxious or low on more than half the days;
   - an area they asked for that needs a health professional's input first. The page never names a condition.

## The conversation layer (templates/conversation.tpl.html)

Controlled, not an open AI conversation: everything below is fixed rules and fixed wording.

1. **Welcome**: "Let's find your Good Span…", then first name and email. The welcome says they can type or talk. The microphone starts talking at any point, and typing or tapping an option returns to the box. Voice uses the browser's own speech recognition (Chrome, Edge and Safari; no key, no server). What it hears goes through exactly the same matching and "Is that right?" check as typing. If the browser has no voice support, or the microphone is blocked, it falls back to typing and says so.
2. **Opening question**: "If the next six months went really well, what would you most like to feel different?" The member taps suggestions or answers in their own words. Their words are matched to themes (`THEMES` in `core/result.js`: energy, sleep, stress, mood, fitness, ease, food, connection, health).
   - With two or more themes, the chat asks one follow-up: "If one of those improved first, which would make the biggest difference?"
   - The focus areas on the next question start with nothing selected.
   - Stored as `A.q0 = { text, themes, areas, first }`; `toFeatures` ignores it, so the engine is unchanged.
3. **Acknowledgements**: one short line after selected answers (`ACK` in the template), only for what already works and the limits they set, e.g. "You're already doing strength work twice a week…". There are none on health or safety questions; the anxious-or-low questions only get "Thank you for telling us."
4. **Safety and health questions** (q4, q5, q5a, q5b, q6, q29, q32) can be tapped or spoken. A spoken or typed answer is always read back ("I've noted …. Is that right?") before it is saved. Tapping an option is kept as chosen.

## The conversational evaluation (/conversation): a parallel evaluation for comparison

A fluid conversation led by Claude, with a report Claude writes, built beside the live evaluation (which is unchanged) so the two can be compared. This deliberately departs from spec v2.1 sections 09 and 10, which keep practice choice in the rules and let the AI only reword: here the rules decide what is safe and allowed, and Claude decides what is most relevant and writes the report.

Files:
- `templates/talk.tpl.html`: the page.
- `core/slots.js`: the checklist.
- `server/ai-converse.js`: the conversation.
- `server/ai-report.js`: writes and checks the report.
- `core/report.js`: the report's checks and display.
- `core/evidence.js`: the approved statements.

**The conversation**
- **Checklist ("slots")**: every question in `core/questions.js`, and every grid row, is a slot. A slot applies only when the canonical `show()` / `gridRows()` say so.
- **Verbatim slots** (safety and sensitive questions: q2a, q4–q6, q11, q14, q19a, q29, q32, q40–q45, q48a) are always asked in their approved wording with their own options. They are never filled from what someone says: a mention only brings the question forward. q4, q5, q5a, q5b and q6 must be answered (or declined where offered) before a report is made.
- **Conversational slots** can be picked up from what the member says. Each picked-up answer is shown back for confirmation or editing before it is stored, with its provenance and certainty. Unknown or declined answers stay empty, never zero or "no".
- **The member's own words** (goals, context, barriers, what helps, past attempts) are kept as notes and shape the report.

**The report**
1. **The rules decide what is allowed.** `buildResult` works out `r.pool`: every practice the engine allows for this person in every area, after safety exclusions, opt-outs and the result rules. Movement is left out while activity is on hold for reported symptoms. `core/evidence.js` gives the approved statements that apply to them; a statement is left out where its conditions say so, for example pregnancy, a heart condition, a nut allergy or a difficult relationship with food.
2. **Claude writes the report** (`/api/report`, mode `write`) from their confirmed answers and their own words. It covers where they are now in the six areas, what that means for ageing well, two to four actions for their week, what to keep doing and what happens next. Each action must cite practices from the pool or approved statements.
3. **`GSReport.check` runs on the page and on the server.** It checks:
   - the shape of the report and all six areas;
   - that the areas they chose are marked as their choice and nothing else is;
   - that every citation is allowed for this person;
   - that any amount in a step (how often, how many minutes) is the cited practice's own;
   - that numbers come only from their answers or the cited sources;
   - that nothing suggests something they opted out of;
   - that there is no movement action while activity is on hold;
   - that the private habit never appears;
   - that there is no diagnosis, prevention claim, score, promise or weight-loss wording.
4. **A second pass** (mode `verify`) lists any statement that isn't supported by what they said or by a cited source.
5. **If a check fails**, Claude rewrites the report once, given the reasons. If it fails again, or a check can't run, the rules' own Good Span is shown. Nothing unchecked reaches the member.
6. **Comparison and records.** The report page has a "See the standard Good Span" button for comparison. The completion records `reportBy` (`ai` or `rules`) and the report. The plan link opens the report the member saw.
- **Approved statements: draft.** Every statement in `core/evidence.js` needs review and sign-off by a qualified professional before members see the report. National guidance for members' countries is still to be added.
- **Privacy**: a private personal habit (q54) and "something else" words are never sent to the API, and email addresses are removed from everything sent.
- **Without a key** the page still works: approved questions, a rule-based reflection and the rules' plan.
- **Setup**:
  - Worker secret `ANTHROPIC_API_KEY`.
  - Optional settings: `GS_TALK_MODEL`, `GS_TALK_FAST_MODEL` and `GS_REPORT_MODEL`.
  - Privacy link: `GS_PRIVACY_URL` in `scripts/build.mjs`.
- **Tests**: `node test/converse.test.js` and `node test/report.test.js`.

## The opening of Your Good Span

The opening gives the conclusion first and the reasoning later. `buildResult` returns `opening = { situation, lead, paras, starts, after, own }` in one of five situations:

| situation | when | lead |
|---|---|---|
| `safety` | a symptom not yet checked by a doctor | "Hugo, you told us you want to improve your fitness. One thing comes first." |
| `sensitive` | anxious or low on more than half the days | "Marta, your Good Span starts with what matters most to you: feeling better day to day." (or "thank you for being open with us") |
| `priority` | they chose an area that is in focus | "…you told us you'd like to “sleep through the night”, so that's where we're starting." |
| `unexpected` | what they chose is already going well, or needs a professional first | "…your answers point somewhere slightly different from where you might expect." |
| `doing-well` / `start` | no choice; three or more areas going well (or not) | "Inês, you're already doing a lot right." / "…here's where we'd start." |

Each opening uses a few variables: what matters to them, what already goes well, the main opportunity, one relevant opt-out ("You also told us meditation and journalling aren't for you…"), and when another focus area follows.

The "Your Good Span starts with" line (`starts`) is calculated from the plan, never typed in: the number of practices, the area that comes first, and the weekly minutes.

**Their own words** are quoted back only when:
- the text is 4–80 characters;
- it contains no numbers;
- it mentions no conditions, symptoms, medicines, weight or self-harm, and no swearing (`ownWords()` in `core/result.js`);
- it points to the area the plan starts with.

Otherwise the page uses our wording. Goal reasons also use the member's voice: "You told us managing stress matters to you", not "You picked …".

## Order of the result page

1. Opening
2. Starting Position
3. Where a small change could go a long way
4. First practices
5. Six-month journey
6. **Belonging and Meet your Pilot**: "Longevity is personal. It shouldn't be lonely." and **Book my Good Span Review**
7. **Ways to continue after your Review**: what's included, then Self, Core and Concierge, explained but with no "Choose" buttons. The tier is decided with the Pilot.
8. The science behind your plan

## Voice and AI matching

**How an answer is understood**, in order:
1. **Voice capture.**
   - Listening continues until a 0.8-second pause, up to 20 seconds.
   - The browser shows words as they are heard. Every spoken answer is also recorded and sent to Whisper, which supplies the transcript the page trusts.
   - The language is set with `window.GS_SPEECH_LANG` (default `en-GB`; `pt-PT` for Portuguese).
2. **Rules (in the page).** The Whisper transcript is tried against the options. "No idea" and "not sure" pick a matching option ("I don't track my steps") or ask again, and are never read as zero. If Whisper heard nothing useful, the browser's transcript is tried.
3. **Whisper, for every spoken answer.** The page sends the recording to `/api/transcribe`. That route calls OpenAI's transcriptions API with model `whisper-1`. You do not choose the model when you create the key; the route names it.
   - Typed answers are not sent.
   - The question wording and the option labels go with the recording as a hint, so words like "10,000" are easier to hear.
   - If the secret is missing, the route answers `not_configured` and the page uses the browser's transcript.
4. **AI matching.** It runs when the answer is not already the option's own words, so a paraphrase can still land on an option. The page sends the question, its options and what was said to `/api/interpret`, which asks Claude Haiku to pick from the numbered options or answer "unclear".
   - The server and the page both reject anything that isn't on the list.
   - If they said the option itself, or a number that fits only one band, that match is accepted straight away and the meaning check is skipped. A health question is the exception: it is always read back.
   - A paraphrase still asks "Is that right?".
   - The model can also read Portuguese answers.
5. **After two misses** on the same question, typing and talking pause for that question and the member taps an option.

Health and safety questions (q4, q5, q5a, q5b, q6, q29, q32) can be spoken. The recording and, when the words are not the option, the transcript are sent the same way as any other spoken answer, and the page asks "Is that right?" before saving. Contact details are never sent.

**Turn the keys on**
- On the published assessment (https://thegoodspan-assessment.pages.dev/): the page already calls both routes. Add each key in Cloudflare, not in GitHub and not in the page. Dashboard → Workers & Pages → **thegoodspan-assessment** → Settings → Variables and Secrets → Add. Type: Secret. Environment: Production (and Preview, if you use preview links). Save, then retry the latest deployment so the secret is picked up. Do not commit the key.
  - Name: `ANTHROPIC_API_KEY` for matching a transcript to an option.
  - Name: `OPENAI_API_KEY` for Whisper. Optional override: `OPENAI_TRANSCRIBE_MODEL` (leave it unset to use `whisper-1`).
- Locally, only if the project is on that computer: `ANTHROPIC_API_KEY=sk-... OPENAI_API_KEY=sk-... node server/dev-server.js`, then open http://localhost:8787. Each match and transcript is logged in the terminal. Without a key, that step stays off.
- In your app:
  1. Call `handleInterpret(body)` from `server/ai-interpret.js` for matching, and `handleTranscribe(body)` from `server/transcribe.js` for Whisper.
  2. Set `window.GS_AI_URL` and `window.GS_TRANSCRIBE_URL` to those routes before the conversation script loads.
- Keep both keys on the server only.
- Model for matching: set `GS_AI_MODEL` (default `claude-haiku-4-5`).
- `node test/ai-interpret.test.js` and `node test/transcribe.test.js` check the guard rails without a key.

**Not done yet**
- **Consent:** to be added once the prototype is agreed. When matching is on, the transcript passes through Claude. Every spoken answer's recording, including a health question, passes through OpenAI.

## Before launch

- Safety rules and notice wording need professional review.
- Fonts in `assets/` are the BST Bazaine **trial** files; swap in the licensed versions.
- Voice: test speech recognition on the browsers your members use; when the app is hosted in a frame, the frame needs `allow="microphone"`.
- The acknowledgement lines and the opening wording are fixed copy; review them with the team like any other copy.
- Practice cards use library names (e.g. "Reframing") and library minute values; the hand-written titles and timings in the reviewed pages are not in the library yet.
- Keep `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` on the server. A spoken health answer is sent the same way as any other spoken answer, and it is only saved after the member confirms it. The Google Sheet still receives the assessment answers.

## "About you": the Personal Assessment Summary

The first screen of the plan opens with a short heading and two paragraphs that reflect the member's answers back to them: their lifestyle today, then what matters to them and where their Good Span starts. The brief it is written to is the `SYSTEM` prompt in `server/ai-story.js`.

- `buildResult` always writes a rule-based version (`record.story = { heading, paras }`), so the section never depends on AI.
- When the conversation finishes, it sends `record.storyFacts` and the member's answers to `/api/story` (`functions/api/story.js`). Claude writes the summary; the page waits up to 12 seconds, otherwise it keeps the rule-based version.
- Sent: question and answer text and a few plan facts. Not sent: the email address, or a personal habit the member chose to keep private. Health answers are sent so the summary doesn't overlook them, but the brief forbids naming conditions, symptoms, mood answers or pregnancy.
- The server rejects a summary with the wrong shape or length (85–165 words), a heading over 9 words, medical or stock wording, or any number that isn't in the member's answers. The page then keeps the rule-based version.
- Uses the same `ANTHROPIC_API_KEY` secret as `/api/interpret`. Model: `GS_STORY_MODEL` (default `claude-sonnet-4-5`).
- The summary is saved in the Completions sheet ("About you"), marked "(rule-based)" when the AI version wasn't used.
- `node test/ai-story.test.js` checks the guard rails without a key.
