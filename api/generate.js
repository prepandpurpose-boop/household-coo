// Household COO: builds a meal with Claude. Only signed-in household members can use it.
const SUPABASE_URL = 'https://utqgmylsdzoqovadrwbg.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_dycz1DniVdRUep8rh--RMw_qkYH_uac';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) return res.status(401).json({ error: 'Please sign in again.' });

    const { systemPrompt, userPrompt } = req.body || {};
    if (!userPrompt) return res.status(400).json({ error: 'Missing prompt.' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 8000,
        system: systemPrompt || '',
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.log('anthropic error', r.status, JSON.stringify(data).slice(0, 300));
      return res.status(r.status).json(data);
    }
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter(b => b && b.type === 'text').map(b => b.text).join('');
    console.log('anthropic ok', data.stop_reason, blocks.map(b => b && b.type).join(','), text.length);
    return res.status(200).json({ content: [{ type: 'text', text }], stop_reason: data.stop_reason });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
};
