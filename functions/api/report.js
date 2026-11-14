// Cloudflare Pages: POST /api/report — Claude writes the conversational evaluation's Good Span report (mode "write")
// and checks it against what the person said (mode "verify"). The page falls back to the rules' plan if it fails.
import report from '../../server/ai-report.js';
const { handleReport } = report;

export async function onRequestPost({ request, env }) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 160000) return Response.json({ error: 'bad_request' }, { status: 400 });
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  const out = await handleReport(body, { apiKey: (env && env.ANTHROPIC_API_KEY) || '', model: (env && env.GS_REPORT_MODEL) || '' });
  return Response.json(out.json, { status: out.status });
}
