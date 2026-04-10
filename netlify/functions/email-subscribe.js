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
// Clean, mobile-friendly branded template with NordVPN affiliate
// ─────────────────────────────────────────────────────────────
function buildEmailHtml(scamLabel, payLabel, amountText, planText){

  const planHtml = (planText || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n{2,}/g,'</p><p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75">')
    .replace(/\n/g,'<br>');

  const amtNote = amountText !== 'not specified'
    ? `, with <strong>${amountText}</strong> at stake`
    : '';

  // NordVPN contextual why-message based on scam type
  const nordWhy = {
    romance: '<strong>Romance scam victims are prime targets for follow-on attacks.</strong> The same criminal networks sell victim data and run callback scams. NordVPN Scam Call Protection blocks fraudulent callbacks before you answer. Dark Web Monitor Pro alerts you if your data surfaces in underground markets.',
    tech: '<strong>Tech support scammers almost certainly installed tracking tools on your device.</strong> NordVPN Threat Protection Pro scans and removes malware in real time, and blocked 92% of phishing sites in independent tests.',
    investment: '<strong>Investment and crypto scam victims are specifically re-targeted by "fund recovery" scammers.</strong> NordVPN Scam Call Protection identifies these fraudulent callbacks before you answer. Dark Web Monitor Pro watches your email and financial data 24/7.',
    impersonator: '<strong>Government impersonators frequently call victims back from new spoofed numbers.</strong> NordVPN Scam Call Protection warns you before you answer. If you shared your SSN, Dark Web Monitor Pro tracks whether it appears in underground marketplaces.',
    default: '<strong>Scam victims are frequently re-targeted within days.</strong> Your personal data may already be circulating in underground networks. NordVPN Dark Web Monitor Pro watches for your email, phone, and financial data 24/7 — and Scam Call Protection blocks fraudulent callbacks before you answer.'
  };

  const why = nordWhy[scamLabel] || nordWhy.default;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Your SCAMSOS Recovery Plan</title>
</head>
<body style="margin:0;padding:0;background:#0D1520;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1520;padding:24px 12px">
<tr><td align="center">
<table width="100%" style="max-width:640px">

  <!-- Header -->
  <tr><td style="background:#040D1A;padding:24px 36px;text-align:center;border-radius:14px 14px 0 0;border-bottom:1px solid rgba(255,255,255,0.08)">
    <div style="font-size:1.9rem;font-weight:700;color:#ffffff;letter-spacing:-0.03em;font-family:Georgia,serif">
      SCAM<span style="color:#3B82F6">SOS</span>
    </div>
    <div style="font-size:0.65rem;color:#8B9CC8;margin-top:5px;letter-spacing:0.18em;text-transform:uppercase">
      Free Scam Recovery Guide
    </div>
  </td></tr>

  <!-- Intro -->
  <tr><td style="background:#0B1422;padding:30px 36px 20px">
    <h1 style="margin:0 0 12px;font-size:1.4rem;color:#ffffff;font-weight:700;line-height:1.3">
      Your Recovery Plan
    </h1>
    <p style="margin:0 0 18px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.65">
      Here is the plan we built for your situation — a <strong style="color:#ffffff">${scamLabel}</strong>
      paid via <strong style="color:#ffffff">${payLabel}</strong>${amtNote}.
      Save this email so you have it when you call your bank or file your report.
    </p>
    <div style="background:rgba(59,130,246,0.1);border-left:4px solid #3B82F6;border-radius:0 8px 8px 0;padding:13px 18px">
      <p style="margin:0;color:#93C5FD;font-size:14px;font-weight:600;line-height:1.5">
        ⚡ Start with the steps marked "Do Now" — every hour matters for financial recovery.
      </p>
    </div>
  </td></tr>

  <!-- Plan body -->
  <tr><td style="background:#0B1422;padding:0 36px 28px">
    <div style="background:#0F1C2E;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:24px 28px">
      <p style="margin:0 0 14px;color:rgba(255,255,255,0.8);font-size:15px;line-height:1.75;white-space:pre-wrap;word-break:break-word">${planHtml || 'Visit scamsos.com to view your full recovery plan online.'}</p>
    </div>
  </td></tr>

  <!-- CTA button -->
  <tr><td style="background:#0B1422;padding:0 36px 32px;text-align:center">
    <a href="https://scamsos.com"
       style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#1D4ED8);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:9px;font-weight:700;font-size:15px">
      Return to SCAMSOS →
    </a>
  </td></tr>

  <!-- NordVPN affiliate card -->
  <tr><td style="background:#0B1422;padding:0 36px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1C2E;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden">
      <!-- blue top stripe -->
      <tr><td style="background:linear-gradient(90deg,#3E5FFF,#60a5fa);height:3px;font-size:1px;line-height:1px">&nbsp;</td></tr>
      <tr><td style="padding:22px 24px">
        <!-- Logo + header row -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="60" valign="middle">
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA7wAAAN5CAYAAAArZjcwAAAACXBIWXMAABcRAAAXEQHKJvM/AAAgAElEQVR4nOzd/3XbVrYvcOCt+V95FdipwJ4K6KnASgXmVBBNBZYriFRBqApGqiBmBdeq4FoVvKgCvAVly6FpUvyFAxwcfD5reWXu3IxNATSJ79n77FM3TVMBAABAaf6POwoAAECJBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEngBQAAoEgCLwAAAEUSeAEAACiSwAsAAECRBF4AAACKJPACAABQJIEXAACAIgm8AAAAFEng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" width="56" height="56" alt="NordVPN"
                   style="border-radius:8px;display:block;object-fit:cover">
            </td>
            <td style="padding-left:14px;vertical-align:middle">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#3B82F6;margin-bottom:3px">
                Recommended Protection &middot; Sponsored
              </div>
              <div style="font-size:16px;font-weight:800;color:#ffffff">
                Nord<span style="color:#3E5FFF">VPN</span>
              </div>
            </td>
          </tr>
        </table>
        <!-- Title -->
        <div style="font-size:15px;font-weight:700;color:#ffffff;margin:14px 0 12px">
          NordVPN &mdash; Complete Online Protection
        </div>
        <!-- Why box -->
        <div style="background:rgba(59,130,246,0.07);border-left:3px solid #3B82F6;border-radius:0 6px 6px 0;padding:11px 14px;margin-bottom:16px">
          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:13px;line-height:1.65">${why}</p>
        </div>
        <!-- Features 2-col -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px">
          <tr>
            <td width="50%" style="padding:3px 8px 3px 0;vertical-align:top;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.4">🛡️ Threat Protection Pro — blocks phishing & malware (92%)</td>
            <td width="50%" style="padding:3px 0 3px 8px;vertical-align:top;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.4">🌑 Dark Web Monitor Pro — monitors email, cards & SSN 24/7</td>
          </tr>
          <tr>
            <td width="50%" style="padding:3px 8px 3px 0;vertical-align:top;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.4">📞 Scam Call Protection — blocks fraud calls before you answer</td>
            <td width="50%" style="padding:3px 0 3px 8px;vertical-align:top;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.4">🔒 VPN encryption — hides your IP & encrypts all traffic</td>
          </tr>
        </table>
        <!-- CTA -->
        <a href="https://go.nordvpn.net/aff_c?offer_id=15&aff_id=145247&url_id=902"
           style="display:block;background:linear-gradient(135deg,#3E5FFF,#1D4ED8);color:#ffffff;text-decoration:none;text-align:center;padding:13px 24px;border-radius:9px;font-size:14px;font-weight:700;margin-bottom:8px">
          🛡️ Get NordVPN Protection →
        </a>
        <div style="text-align:center;font-size:11px;color:rgba(255,255,255,0.3)">
          Sponsored link &middot; 30-day money-back guarantee
        </div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Recovery scam warning -->
  <tr><td style="background:#0B1422;padding:0 36px 28px">
    <div style="background:#1C0A00;border:1px solid rgba(194,65,12,0.4);border-radius:10px;padding:18px 20px">
      <p style="margin:0 0 8px;font-weight:700;color:#FB923C;font-size:14px">
        ⚠️ Watch for recovery scams
      </p>
      <p style="margin:0;color:rgba(255,255,255,0.65);font-size:13px;line-height:1.65">
        Scam victims are frequently re-targeted by "recovery specialists" who charge upfront fees.
        They are scammers themselves. The FTC, CFPB, and your bank handle fraud recovery at no charge.
      </p>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#040D1A;border-top:1px solid rgba(255,255,255,0.07);padding:20px 36px;text-align:center;border-radius:0 0 14px 14px">
    <p style="margin:0 0 5px;font-size:12px;color:rgba(255,255,255,0.35)">
      You requested this email at SCAMSOS.com. This is not legal advice.
    </p>
    <p style="margin:0 0 5px;font-size:11px;color:rgba(255,255,255,0.2)">
      SCAMSOS &middot; Free Scam Recovery Guidance for US Consumers
    </p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2)">
      This email contains an affiliate link to NordVPN. We earn a small commission if you purchase, at no extra cost to you.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
