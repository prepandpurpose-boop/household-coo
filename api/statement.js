// Household COO: reads bank statements for the Money section.
// Only signed-in household members who are allowed to see money can use it.
// Nothing is saved here: files are read once and discarded.
const SUPABASE_URL = 'https://utqgmylsdzoqovadrwbg.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_dycz1DniVdRUep8rh--RMw_qkYH_uac';

const EXTRACT_PROMPT = `You are reading one bank or credit card statement (or a screenshot or export of transactions).
List EVERY transaction on it, one per line, in exactly this format:
YYYY-MM-DD|description|amount
Rules:
- Money coming IN is a positive number. Money going OUT is a negative number. Use plain numbers like -45.20 or 1250.00, no $ signs, no commas.
- Keep the description short (merchant or payer name, plus the word that shows what it is, such as PAYROLL, RENT, AUTOPAY).
- Use the full year in dates. If the statement shows only month and day, use the statement year.
- Do not list running balances, daily totals, or summary rows. Only individual transactions.
- Output only the lines. No headings, no explanation, no code fences.`;

const SUMMARY_SYSTEM = `You help a household set up its budget from real bank transactions. You always answer by calling the report tool.`;

function summaryPrompt(today, lines) {
  return `Today is ${today}. Below are transactions from about three months of bank statements, possibly from more than one account. Format: date|description|amount. Money in is positive, money out is negative.
Transfers between the household's own accounts (savings transfers, credit card payments from checking) are NOT income and NOT bills by themselves. Do not count a credit card payment as a bill if the card's own purchases are in the list.

Find the household's regular money picture and call the report tool with it.
Rules:
- income.amount is the typical amount of ONE deposit, not a monthly total. Use freq from how often it really arrives. lastDate is the date of the most recent deposit (YYYY-MM-DD).
- Group deposits from the same payer as one income source. Ignore one-time deposits, refunds, and transfers; mention a big one-time deposit in notes.
- bills are things paid every month or that clearly repeat. monthlyCost is the typical monthly amount. For things that vary (groceries, gas, utilities), use the average per month and set variable true and dueDay 0.
- dueDay is the day of the month 1 to 31 it is usually paid. 0 if it has no fixed date.
- kind "wall" is for these: housing (rent or mortgage), food and groceries, utilities, transportation (car payment, fuel), health insurance, life insurance, church giving or tithe, and minimum debt payments. Everything else that repeats is kind "expense".
- tier for walls must be exactly one of: "10% Tithe", "Shelter (Wall 1)", "Food (Wall 2)", "Utilities (Wall 3)", "Transportation (Wall 4)", "Health Insurance", "Life Insurance", "Debt Minimums".
- tier for expenses must be exactly one of: "Phone & Internet", "Streaming & Subscriptions", "Memberships & Dues", "Insurance (Other)", "Personal & Discretionary", "Other Recurring".
- debts are loan or credit card payments you can see. minPayment is the usual payment. Do not guess balances.
- Do not include income or bills you only saw once. Do not invent anything that is not in the transactions.
- notes: up to 4 short plain sentences about anything the household should double check. Be neutral and kind. No judgment about spending.

TRANSACTIONS:
${lines}`;
}

const REPORT_TOOL = {
  name: 'report',
  description: 'Report the household money picture found in the transactions.',
  input_schema: {
    type: 'object',
    properties: {
      monthsCovered: { type: 'number' },
      income: { type: 'array', items: { type: 'object', properties: {
        source: { type: 'string' }, amount: { type: 'number' },
        freq: { type: 'string', enum: ['weekly', 'biweekly', 'monthly'] },
        lastDate: { type: 'string' },
        type: { type: 'string', enum: ['Primary', 'Secondary/Side-Hustle'] } },
        required: ['source', 'amount', 'freq', 'lastDate', 'type'] } },
      bills: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' }, monthlyCost: { type: 'number' }, dueDay: { type: 'number' },
        kind: { type: 'string', enum: ['wall', 'expense'] }, tier: { type: 'string' }, variable: { type: 'boolean' } },
        required: ['name', 'monthlyCost', 'dueDay', 'kind', 'tier', 'variable'] } },
      debts: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' }, minPayment: { type: 'number' } }, required: ['name', 'minPayment'] } },
      notes: { type: 'array', items: { type: 'string' } }
    },
    required: ['income', 'bills', 'debts', 'notes']
  }
};

const SPEND_CATS = ['10% Tithe','Shelter (Wall 1)','Food (Wall 2)','Utilities (Wall 3)','Transportation (Wall 4)','Health Insurance','Life Insurance','Debt Minimums','Phone & Internet','Streaming & Subscriptions','Memberships & Dues','Insurance (Other)','Personal & Discretionary','Other Recurring','Eating out & coffee','Shopping & household','Other everyday','Transfers & savings','Income & refunds'];
function categorizePrompt(list) {
  return `Sort each store or payer below into exactly one category. Categories (use the exact words):
${SPEND_CATS.join('\n')}

Guidance:
- Grocery stores (Aldi, Kroger, Food Lion, Harris Teeter, Publix, Costco food) are "Food (Wall 2)".
- Gas stations and car payments are "Transportation (Wall 4)". Rent or mortgage is "Shelter (Wall 1)". Electric, water, gas utility are "Utilities (Wall 3)".
- Restaurants, fast food, coffee shops, delivery apps are "Eating out & coffee".
- Amazon, Target, Walmart, home goods, clothing are "Shopping & household". Anything unclear is "Other everyday".
- Church, tithe, offering is "10% Tithe".
- Phone and internet providers are "Phone & Internet". Netflix, Spotify and similar are "Streaming & Subscriptions". Gym and clubs are "Memberships & Dues".
- Credit card payments, transfers between accounts, savings transfers, Zelle or Venmo between family accounts are "Transfers & savings".
- Paychecks, deposits, refunds are "Income & refunds".

Each line is: number|name|how many times|total (negative is money out). Reply with one line per input in the form number|Category. Nothing else.

${list}`;
}

async function anthropic(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', ...body })
  });
  const data = await r.json();
  if (!r.ok) {
    console.log('anthropic error', r.status, JSON.stringify(data).slice(0, 300));
    const err = new Error('anthropic'); err.status = r.status; throw err;
  }
  const blocks = Array.isArray(data.content) ? data.content : [];
  const tool = blocks.find(b => b && b.type === 'tool_use');
  const text = tool ? JSON.stringify(tool.input) : blocks.filter(b => b && b.type === 'text').map(b => b.text).join('');
  console.log('anthropic ok', data.stop_reason, text.length);
  return text;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) return res.status(401).json({ error: 'Please sign in again.' });
    const user = await who.json();

    // Only people allowed to see money may use this.
    const mem = await fetch(SUPABASE_URL + '/rest/v1/household_members?select=can_see_money,role,household_id&user_id=eq.' + encodeURIComponent(user.id), {
      headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: 'Bearer ' + token }
    });
    const rows = mem.ok ? await mem.json() : [];
    let allowed = rows.some(m => m.can_see_money);
    if (!allowed) {
      // Adult household members have their own private money. They are marked adult in the household's member types.
      for (const m of rows.filter(x => x.role === 'kid')) {
        const t = await fetch(SUPABASE_URL + '/rest/v1/app_data?select=data&module=eq.member_types&household_id=eq.' + encodeURIComponent(m.household_id), {
          headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: 'Bearer ' + token }
        });
        const tr = t.ok ? await t.json() : [];
        const d = (tr[0] && tr[0].data) || {};
        const email = String(user.email || '').trim().toLowerCase();
        if ((d.adult || {})[user.id] || (d.adultEmail || {})[email]) { allowed = true; break; }
      }
    }
    if (!allowed) return res.status(403).json({ error: 'Money is not available for this account.' });

    const body = req.body || {};
    if (body.mode === 'extract') {
      const { mediaType, data, text, label } = body;
      let content;
      if (typeof text === 'string' && text.length) {
        content = [{ type: 'text', text: 'Statement text or export' + (label ? ' (' + String(label).slice(0, 60) + ')' : '') + ':\n' + text.slice(0, 400000) + '\n\n' + EXTRACT_PROMPT }];
      } else if (mediaType === 'application/pdf' && data) {
        content = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }, { type: 'text', text: EXTRACT_PROMPT }];
      } else if (/^image\/(png|jpeg|webp|gif)$/.test(mediaType || '') && data) {
        content = [{ type: 'image', source: { type: 'base64', media_type: mediaType, data } }, { type: 'text', text: EXTRACT_PROMPT }];
      } else {
        return res.status(400).json({ error: 'That file type is not supported. Use a PDF, a picture, or a CSV.' });
      }
      const out = await anthropic({ max_tokens: 12000, messages: [{ role: 'user', content }] });
      return res.status(200).json({ text: out });
    }

    if (body.mode === 'summarize') {
      const lines = String(body.lines || '').slice(0, 300000);
      if (!lines.trim()) return res.status(400).json({ error: 'No transactions to look at.' });
      const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : new Date().toISOString().slice(0, 10);
      const out = await anthropic({
        max_tokens: 8000,
        tools: [REPORT_TOOL],
      
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: summaryPrompt(today, lines) }]
      });
      return res.status(200).json({ text: out });
    }

    if (body.mode === 'categorize') {
      const list = String(body.list || '').slice(0, 60000);
      if (!list.trim()) return res.status(400).json({ error: 'Nothing to sort.' });
      const out = await anthropic({ max_tokens: 6000, messages: [{ role: 'user', content: categorizePrompt(list) }] });
      return res.status(200).json({ text: out });
    }

    return res.status(400).json({ error: 'Unknown request.' });
  } catch (e) {
    return res.status(e.status && e.status < 600 ? e.status : 500).json({ error: 'Server error' });
  }
};
