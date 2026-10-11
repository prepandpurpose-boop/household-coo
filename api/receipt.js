// Household COO: reads a grocery receipt photo, or a photo of one product.
// Only signed-in household members can use it. Nothing is saved here.
const SUPABASE_URL = 'https://utqgmylsdzoqovadrwbg.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_dycz1DniVdRUep8rh--RMw_qkYH_uac';

const UNITS = ['oz', 'lb', 'gal', 'qt', 'pt', 'fl oz', 'ct', 'each', 'g', 'kg', 'l', 'ml', ''];

const RECEIPT_TOOL = {
  name: 'report_receipt',
  description: 'Report what is printed on the grocery receipt.',
  input_schema: {
    type: 'object',
    properties: {
      store: { type: 'string' },
      date: { type: 'string', description: 'YYYY-MM-DD, or empty if not printed' },
      total: { type: 'number', description: 'Final total paid, including tax' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Plain product name with abbreviations expanded, no brand codes' },
            sizeValue: { type: 'number', description: 'Package size number, 0 if the receipt does not show it' },
            sizeUnit: { type: 'string', enum: UNITS, description: 'Unit of the package size, empty if not shown' },
            qty: { type: 'number', description: 'How many packages were bought' },
            price: { type: 'number', description: 'Total price for this line (all packages)' }
          },
          required: ['name', 'sizeValue', 'sizeUnit', 'qty', 'price']
        }
      }
    },
    required: ['store', 'date', 'total', 'items']
  }
};

const ITEM_TOOL = {
  name: 'report_item',
  description: 'Report the product shown in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Plain product name, with brand only if it matters' },
      sizeValue: { type: 'number', description: 'Package size number printed on the label, 0 if you cannot read one' },
      sizeUnit: { type: 'string', enum: UNITS },
      confident: { type: 'boolean' }
    },
    required: ['name', 'sizeValue', 'sizeUnit', 'confident']
  }
};

const RECEIPT_PROMPT = `This is a photo of a grocery receipt. Call report_receipt.
Rules:
- List every product line. Do not list tax, subtotal, coupons, discounts, bag fees, or payment lines as items.
- Expand receipt abbreviations into plain product names (for example "ORG BNLS CHK BRST" becomes "Organic boneless chicken breast").
- sizeValue and sizeUnit come only from what is printed on the receipt line (such as "16 OZ" or "1 GAL"). If no size is printed, use 0 and an empty unit. Never guess a size.
- For items sold by weight, put the weight as sizeValue with unit lb, qty 1, and price as the line total.
- qty is how many packages were bought. price is the total for the line.
- total is the final amount paid. date is the purchase date as YYYY-MM-DD if printed.`;

const ITEM_PROMPT = `This is a photo of one grocery product, such as an empty container or a nearly empty one. Call report_item.
Give the plain product name. Read the package size from the label (for example 16 oz or 1 gal). If you cannot read a size, use 0 and an empty unit. Never guess a size.`;

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
  const tool = (Array.isArray(data.content) ? data.content : []).find(b => b && b.type === 'tool_use');
  if (!tool) { const err = new Error('noresult'); err.status = 502; throw err; }
  return tool.input;
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

    const { mode, mediaType, data } = req.body || {};
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mediaType || '') || !data) return res.status(400).json({ error: 'Please send a picture.' });
    const image = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };

    if (mode === 'receipt') {
      const out = await anthropic({ max_tokens: 6000, tools: [RECEIPT_TOOL], tool_choice: { type: 'tool', name: 'report_receipt' }, messages: [{ role: 'user', content: [image, { type: 'text', text: RECEIPT_PROMPT }] }] });
      return res.status(200).json({ result: out });
    }
    if (mode === 'item') {
      const out = await anthropic({ max_tokens: 800, tools: [ITEM_TOOL], tool_choice: { type: 'tool', name: 'report_item' }, messages: [{ role: 'user', content: [image, { type: 'text', text: ITEM_PROMPT }] }] });
      return res.status(200).json({ result: out });
    }
    return res.status(400).json({ error: 'Unknown request.' });
  } catch (e) {
    return res.status(e.status && e.status < 600 ? e.status : 500).json({ error: 'Could not read that picture. Try again with a clearer, closer photo.' });
  }
};
