// netlify/functions/email-subscribe.js
//
// ─────────────────────────────────────────────────────────────────
// SETUP — add these to Netlify > Site config > Environment variables:
//
//   CONVERTKIT_API_KEY   → your ConvertKit API key
//   CONVERTKIT_FORM_ID   → the ID of your ConvertKit form
//                          (found in ConvertKit > Forms > your form > Settings > API)
//
// HOW TO GET THESE:
//   1. Go to app.convertkit.com
//   2. API key: Settings → Advanced → API Key (copy it)
//   3. Form ID: Create a form called "SCAMSOS Recovery Plan"
//               → click the form → Settings → it shows the Form ID in the URL
//               e.g. app.convertkit.com/forms/1234567 → ID is 1234567
// ─────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Scam type labels for email personalization
const SCAM_LBL = {
  romance:'romance or relationship scam',
  tech:'tech support scam',
  investment:'investment or cryptocurrency scam',
  impersonator:'government or bank impersonator scam',
  shopping:'fake online store scam',
  job:'fake job offer scam',
  lottery:'lottery or prize scam',
  rental:'rental scam',
  family:'family emergency scam',
  phishing:'phishing or fake website',
  marketplace:'marketplace scam',
  other:'scam'
};

const PAY_LBL = {
  credit:'credit card',
  debit:'debit card',
  wire:'wire transfer',
  zelle:'Zelle',
  p2p:'Venmo/Cash App/PayPal',
  crypto:'cryptocurrency',
  giftcard:'gift cards',
  check:'check or money order',
  nopay:'personal information only'
};

exports.handler = async (event) => {

  // Handle CORS preflight
  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 200, headers: CORS, body: '' };
  }

  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, headers: CORS, body: JSON.stringify({error:'Method not allowed'}) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({error:'Invalid request'}) }; }

  const { email, scam, pay, when, amount, plan } = body;

  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    return { statusCode: 400, headers: CORS, body: JSON.stringify({error:'Invalid email address'}) };
  }

  const ckKey    = process.env.CONVERTKIT_API_KEY;
  const ckFormId = process.env.CONVERTKIT_FORM_ID;

  if(!ckKey || !ckFormId){
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({error:'Email service not configured. Please add CONVERTKIT_API_KEY and CONVERTKIT_FORM_ID to Netlify environment variables.'})
    };
  }

  const scamLabel  = SCAM_LBL[scam]  || scam  || 'scam';
  const payLabel   = PAY_LBL[pay]    || pay   || 'unknown method';
  const amountText = amount ? `$${parseFloat(amount).toLocaleString()}` : 'an unknown amount';

  try {
    // ── Subscribe to ConvertKit form ──────────────────────────────
    // ConvertKit stores custom fields you can use to personalize
    // your automated email sequence inside their dashboard.
    const ckResp = await fetch(
      `https://api.convertkit.com/v3/forms/${ckFormId}/subscribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: ckKey,
          email,
          fields: {
            scam_type:    scamLabel,
            payment_type: payLabel,
            amount_lost:  amountText,
            timing:       when || 'unknown',
            plan_text:    (plan || '').slice(0, 3000) // CK field limit
          },
          tags: [
            scam  || 'other',
            pay   || 'unknown-payment'
          ]
        })
      }
    );

    if(!ckResp.ok){
      const ckErr = await ckResp.json().catch(()=>({}));
      console.error('ConvertKit error:', ckErr);
      throw new Error('Email subscription failed');
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, message: 'Subscribed and plan queued for delivery.' })
    };

  } catch(err) {
    console.error('email-subscribe error:', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message || 'Internal error — please try again.' })
    };
  }
};
