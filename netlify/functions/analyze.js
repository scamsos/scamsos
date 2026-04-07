exports.handler = async (event) => {
  // Common CORS headers
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  // Return the "Under Construction" payload
  // This mimics the structure your frontend expects so the UI doesn't break
  const constructionPlan = {
    opening: "🚧 We are currently updating our recovery tools to serve you better.",
    recovery_probability: {
      level: "Coming Soon",
      explanation: "Our automated analysis engine is undergoing scheduled maintenance."
    },
    steps: [
      {
        priority: 1,
        urgency: "urgent",
        title: "Under Construction",
        action: "Please check back with us shortly.",
        how: "We are working hard behind the scenes to finalize our recovery plan generator. Thank you for your patience!",
        why: "We want to ensure you get the most accurate and up-to-date recovery advice possible."
      }
    ],
    draft_documents: [
      {
        title: "System Update in Progress",
        content: "The Generate My Recovery Plan feature is currently being upgraded. Please visit reportfraud.ftc.gov in the meantime for immediate official assistance."
      }
    ],
    recovery_scam_warning: "Always be cautious of anyone claiming they can recover lost funds for an upfront fee while our systems are being updated.",
    emotional_note: "We'll be back online soon to help you navigate this process. Hang in there!"
  };

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify(constructionPlan)
  };
};
