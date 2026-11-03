// netlify/functions/strava-exchange.js
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  const { code } = JSON.parse(event.body || '{}')
  if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing code' }) }

  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Strava credentials not configured' }) }

  try {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
    })
    const data = await res.json()
    if (!data.access_token) return { statusCode: 400, headers, body: JSON.stringify({ error: data.message || 'Exchange failed' }) }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        athlete_id: data.athlete?.id,
        athlete_name: `${data.athlete?.firstname || ''} ${data.athlete?.lastname || ''}`.trim(),
      }),
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
