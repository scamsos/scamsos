// netlify/functions/email-subscribe.js
// ─────────────────────────────────────────────────────────────
// EMAIL SERVICE: BREVO (brevo.com) — replaces ConvertKit
// Free tier: 300 emails/day · 9,000/month · Unlimited contacts
// No credit card required.
//
// SETUP — 10 minutes:
//
// 1. Go to brevo.com → Sign Up Free (email + password, no card)
// 2. Verify your email
// 3. Get your API key:
//    → Top-right avatar → Profile → SMTP & API → API Keys tab
//    → "Generate a new API key" → name it "scamsos" → copy it
// 4. Verify your sender email:
//    → Left sidebar → Senders & IPs → Senders → Add a new sender
//    → Add your email (e.g. maria@scamsos.com) → click the
//      verification link Brevo sends you
// 5. Create a contact list:
//    → Left sidebar → Contacts → Lists → Create a list
//    → Name it "SCAMSOS Subscribers"
//    → The list ID is the number shown in the URL or list details
// 6. Add these 4 variables to Netlify:
//    Site config → Environment variables → Add variable
//
//    BREVO_API_KEY    = your Brevo API key (starts with xkeysib-)
//    BREVO_LIST_ID    = your list ID number (e.g. 3)
//    BREVO_FROM_EMAIL = the sender email you verified in Brevo
//    BREVO_FROM_NAME  = SCAMSOS
//
// 7. Set up your 4-email sequence in Brevo:
//    → Left sidebar → Automations → Create an automation
//    → Trigger: "Contact added to list" → your SCAMSOS list
//    → Add emails at: immediate, +3 days, +7 days, +14 days
//    → Copy the email bodies from scamsos-email-sequence.txt
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const SCAM_LBL = {
  romance:'romance or relationship scam',
  tech:'tech support scam',
  investment:'investment or cryptocurrency scam',
  impersonator:'government or bank impersonator scam',
  shopping:'fake online store scam',
  job:'fake job offer scam',
  lottery:'lottery or prize scam',
  rental:'rental scam',
  family:'family emergency or grandparent scam',
  phishing:'phishing or fake website',
  marketplace:'marketplace scam',
  other:'scam'
};

const PAY_LBL = {
  credit:'credit card',
  debit:'debit card',
  wire:'wire transfer',
  zelle:'Zelle',
  p2p:'Venmo, Cash App, or PayPal',
  crypto:'cryptocurrency',
  giftcard:'gift cards',
  check:'check or money order',
  nopay:'personal information only'
};

exports.handler = async (event) => {

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode:200, headers:CORS, body:'' };
  }
  if(event.httpMethod !== 'POST'){
    return { statusCode:405, headers:CORS, body:JSON.stringify({error:'Method not allowed'}) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode:400, headers:CORS, body:JSON.stringify({error:'Invalid request'}) }; }

  const { email, scam, pay, when, amount, plan } = body;

  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    return { statusCode:400, headers:CORS, body:JSON.stringify({error:'Invalid email address'}) };
  }

  const apiKey    = process.env.BREVO_API_KEY;
  const listId    = parseInt(process.env.BREVO_LIST_ID || '0');
  const fromEmail = process.env.BREVO_FROM_EMAIL;
  const fromName  = process.env.BREVO_FROM_NAME || 'SCAMSOS';

  if(!apiKey || !listId || !fromEmail){
    return {
      statusCode:500, headers:CORS,
      body:JSON.stringify({
        error:'Email service not configured. Add BREVO_API_KEY, BREVO_LIST_ID, and BREVO_FROM_EMAIL to Netlify environment variables.'
      })
    };
  }

  const scamLabel  = SCAM_LBL[scam]  || scam  || 'scam';
  const payLabel   = PAY_LBL[pay]    || pay   || 'unknown';
  const amountText = amount ? `$${parseFloat(amount).toLocaleString()}` : 'not specified';

  const HEADERS = {
    'accept': 'application/json',
    'content-type': 'application/json',
    'api-key': apiKey
  };

  try {
    // ── 1. Add/update contact in Brevo list ──────────────────────
    // This triggers the automation sequence you set up in Brevo
    const contactPayload = {
      email,
      listIds: [listId],
      updateEnabled: true,       // update existing contact if already in list
      attributes: {
        SCAM_TYPE:    scamLabel,
        PAYMENT_TYPE: payLabel,
        AMOUNT_LOST:  amountText,
        TIMING:       when || 'unknown'
      }
    };

    const contactResp = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(contactPayload)
    });

    // 204 and duplicate_parameter both mean "contact already exists" — OK
    if(!contactResp.ok && contactResp.status !== 204){
      const err = await contactResp.json().catch(() => ({}));
      if(err.code !== 'duplicate_parameter'){
        console.error('Brevo contact error:', err);
        // Non-fatal — still attempt to send the email
      }
    }

    // ── 2. Send recovery plan email immediately ───────────────────
    const emailResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email }],
        subject: 'Your SCAMSOS Recovery Plan — save this',
        htmlContent: buildEmailHtml(scamLabel, payLabel, amountText, plan),
        tags: ['recovery-plan', scam || 'other', pay || 'unknown']
      })
    });

    if(!emailResp.ok){
      const err = await emailResp.json().catch(() => ({}));
      console.error('Brevo send error:', err);
      throw new Error('Email could not be sent. Please try again.');
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true })
    };

  } catch(err){
    console.error('email-subscribe error:', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message || 'Internal error — please try again.' })
    };
  }
};

// ─────────────────────────────────────────────────────────────
// EMAIL HTML
// Clean, mobile-friendly branded template
// ─────────────────────────────────────────────────────────────
function buildEmailHtml(scamLabel, payLabel, amountText, planText){

  const planHtml = (planText || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n{2,}/g,'</p><p style="margin:0 0 12px;color:#334155;font-size:0.84rem;line-height:1.75">')
    .replace(/\n/g,'<br>');

  const amtNote = amountText !== 'not specified'
    ? `, with <strong>${amountText}</strong> at stake`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Your SCAMSOS Recovery Plan</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
<tr><td align="center">
<table width="100%" style="max-width:580px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07)">

  <!-- Header -->
  <tr><td style="background:#040D1A;padding:28px 36px;text-align:center">
    <div style="font-size:2rem;font-weight:700;color:#ffffff;letter-spacing:-0.03em;font-family:Georgia,serif">
      SCAM<span style="color:#3B82F6">SOS</span>
    </div>
    <div style="font-size:0.7rem;color:#8B9CC8;margin-top:6px;letter-spacing:0.18em;text-transform:uppercase">
      Free Scam Recovery Guide · United States
    </div>
  </td></tr>

  <!-- Intro -->
  <tr><td style="padding:32px 36px 20px">
    <h1 style="margin:0 0 14px;font-size:1.25rem;color:#0F172A;font-weight:700;line-height:1.3">
      Your Recovery Plan
    </h1>
    <p style="margin:0 0 18px;color:#475569;font-size:0.9rem;line-height:1.65">
      Here is the plan we built for your situation — a <strong style="color:#0F172A">${scamLabel}</strong>
      paid via <strong style="color:#0F172A">${payLabel}</strong>${amtNote}.
      Save this email so you have it when you call your bank or file your report.
    </p>
    <div style="background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:0 8px 8px 0;padding:13px 18px;margin-bottom:8px">
      <p style="margin:0;color:#1D4ED8;font-size:0.85rem;font-weight:600;line-height:1.5">
        ⚡ Start with the steps marked "Do Now" — every hour matters for financial recovery.
      </p>
    </div>
  </td></tr>

  <!-- Plan body -->
  <tr><td style="padding:0 36px 28px">
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:22px 24px">
      <p style="margin:0 0 12px;color:#334155;font-size:0.84rem;line-height:1.75;font-family:monospace;white-space:pre-wrap;word-break:break-word">${planHtml || 'Visit scamsos.com to view your full recovery plan online.'}</p>
    </div>
  </td></tr>

  <!-- CTA button -->
  <tr><td style="padding:0 36px 28px;text-align:center">
    <a href="https://scamsos.com"
       style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:8px;font-weight:700;font-size:0.9rem;letter-spacing:0.01em">
      Return to SCAMSOS →
    </a>
  </td></tr>

  <!-- Recovery scam warning -->
  <tr><td style="padding:0 36px 28px">
    <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:18px 20px">
      <p style="margin:0 0 8px;font-weight:700;color:#C2410C;font-size:0.85rem">
        ⚠️ Watch for recovery scams
      </p>
      <p style="margin:0;color:#7C2D12;font-size:0.8rem;line-height:1.65">
        Scam victims are frequently re-targeted by "recovery specialists" who charge upfront fees to get your money back.
        They are scammers themselves. The FTC, CFPB, and your bank handle fraud recovery at no charge.
        Never pay anyone who contacts you unsolicited offering recovery services.
      </p>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:20px 36px;text-align:center">
    <p style="margin:0 0 5px;font-size:0.75rem;color:#94A3B8">
      You requested this email at SCAMSOS.com. This is not legal advice.
    </p>
    <p style="margin:0;font-size:0.72rem;color:#CBD5E1">
      SCAMSOS · Free Scam Recovery Guidance for US Consumers
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
