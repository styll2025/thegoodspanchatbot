// Cloudflare Pages: POST /api/converse — the guide in the conversational evaluation (/conversation).
// Same ANTHROPIC_API_KEY secret as /api/interpret and /api/story.
import converse from '../../server/ai-converse.js';
const { handleConverse } = converse;

export async function onRequestPost({ request, env }) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 60000) return Response.json({ error: 'bad_request' }, { status: 400 });
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  const out = await handleConverse(body, { apiKey: (env && env.ANTHROPIC_API_KEY) || '', model: (env && env.GS_TALK_MODEL) || '', fastModel: (env && env.GS_TALK_FAST_MODEL) || '' });
  return Response.json(out.json, { status: out.status });
}
