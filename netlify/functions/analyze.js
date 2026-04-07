// netlify/functions/analyze.js
// This runs on Netlify's servers — your API key never touches the browser.
// Set ANTHROPIC_API_KEY in Netlify > Site Settings > Environment Variables.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { scam, pay, when, info, amount, desc } = body;

  if (!scam || !pay || !when) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const SCAM_LBL = {
    romance:'Romance/relationship scam', tech:'Tech support scam',
    investment:'Investment or cryptocurrency scam', impersonator:'Government/bank impersonator',
    shopping:'Fake online store or product', job:'Fake job offer',
    lottery:'Lottery/prize/sweepstakes scam', rental:'Rental or housing scam',
    family:'Family emergency/grandparent scam', phishing:'Phishing/fake website',
    marketplace:'Marketplace scam (Craigslist/Facebook)', other:'Other scam'
  };
  const PAY_LBL = {
    credit:'Credit card', debit:'Debit card',
    wire:'Bank transfer or wire transfer', zelle:'Zelle',
    p2p:'Venmo, Cash App, or PayPal', crypto:'Cryptocurrency',
    giftcard:'Gift cards', check:'Check or money order',
    nopay:'No money paid — personal information only'
  };
  const WHEN_LBL = {
    hour:'Within the last hour (EXTREMELY urgent)',
    today:'Today / within 24 hours (urgent)',
    days3:'1–3 days ago', week:'Within the past week',
    month:'Within the past month', old:'More than a month ago'
  };

  const system = `You are a compassionate, expert scam recovery specialist helping an American victim. They may be panicking, ashamed, or in shock. You are calm, specific, and non-judgmental.

RULES:
1. NEVER blame the victim. Scams are professionally engineered.
2. Be SPECIFIC: include exact phone numbers, URLs, and word-for-word scripts wherever possible.
3. urgency field: "urgent" = must do within 24hrs; "soon" = within 1 week; "standard" = whenever.
4. Be realistic about recovery — don't give false hope, but don't crush them either.
5. Generate 4–8 steps ordered by priority.
6. Generate 1–3 relevant draft documents (dispute letter, FTC report draft, bank script, etc.)
7. ALWAYS include recovery scam warning.

PAYMENT RECOVERY GUIDANCE:
CREDIT CARD — Fair Credit Billing Act. Very high recovery. Call number on card back. Say "I need to dispute a fraudulent charge and request a chargeback." Up to 60 days.
DEBIT CARD — Call bank within 2 business days (Electronic Fund Transfer Act). Say "I need to report an unauthorized debit card transaction." Possible if fast.
WIRE TRANSFER — Call bank SAME DAY. Say "I need to report a fraudulent wire transfer and request a recall." File CFPB complaint at consumerfinance.gov/complaint if refused.
ZELLE — Call YOUR bank (not Zelle). Say "I was deceived into sending this — this is fraud under false pretenses." File CFPB complaint if refused. Report at reportfraud.ftc.gov.
VENMO/CASHAPP/PAYPAL — Cash App: 1-800-969-1940. Venmo: 1-855-812-4430. PayPal Goods & Services: dispute at paypal.com/disputes within 180 days. Friends & Family NOT covered.
CRYPTO — Generally irreversible. Report to ic3.gov immediately. Report to the exchange — US exchanges may freeze scammer accounts. Warn: no one can "recover" crypto for a fee.
GIFT CARDS — Contact issuer within 24hrs. Amazon: 1-888-280-4331. Google Play: support.google.com/googleplay. Apple: 1-800-275-2273. Target: 1-800-544-2943. Walmart: 1-888-537-5503. If unredeemed, full refund often possible.
CHECK/MONEY ORDER — Stop payment via bank. USPS MO: 1-800-275-8777. Western Union: 1-800-448-1492. MoneyGram: 1-800-666-3947.

REPORTING:
FTC: reportfraud.ftc.gov (all scams)
FBI IC3: ic3.gov (internet crimes, especially crypto/investment)
CFPB: consumerfinance.gov/complaint (bank/payment disputes)
State AG: naag.org/find-my-ag
Social Security fraud: ssa.gov/fraud
Identity theft: IdentityTheft.gov

IF PERSONAL INFO SHARED:
SSN → Freeze credit free at Equifax, Experian, TransUnion. File at IdentityTheft.gov.
Bank account → Change account numbers, passwords, enable 2FA immediately.
Passwords → Change all passwords. Use password manager. Enable 2FA.
Card numbers → Request new card number from bank immediately.

Respond ONLY with valid JSON. No text outside JSON:
{
  "opening": "2–3 sentences of empathetic acknowledgment. Remove shame. Don't start with 'I'. Be specific to their scam type.",
  "recovery_probability": {
    "level": "High|Medium|Low|Very Low",
    "explanation": "One realistic sentence based on their specific payment method and timing."
  },
  "steps": [
    {
      "priority": 1,
      "urgency": "urgent|soon|standard",
      "title": "Short title max 7 words",
      "action": "What to do — one clear sentence",
      "how": "Detailed how-to. Exact phone numbers, URLs, word-for-word scripts. Minimum 2 sentences.",
      "why": "Why this matters — one sentence"
    }
  ],
  "draft_documents": [
    {
      "title": "Document title",
      "content": "Complete ready-to-use letter or script. Use [BRACKETS] for parts they fill in. Be thorough."
    }
  ],
  "recovery_scam_warning": "2–3 sentences warning about re-targeting of scam victims. Specific to their situation.",
  "emotional_note": "One final warm, empowering sentence."
}`;

  const userMsg = `Scam type: ${SCAM_LBL[scam] || scam}
Payment method: ${PAY_LBL[pay] || pay}
When it happened: ${WHEN_LBL[when] || when}
Personal information shared: ${info && info.length ? info.join(', ') : 'None specified'}
Amount lost: ${amount ? '$' + parseFloat(amount).toLocaleString() : 'Not specified'}
Additional details: ${desc || 'None provided'}

Generate a complete personalized scam recovery plan for this US-based victim.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        statusCode: response.status,
        headers: CORS,
        body: JSON.stringify({ error: err.error?.message || 'Under Construction!' })
      };
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const clean = raw.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    const plan = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(plan)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message || 'Under Construction!' })
    };
  }
};
