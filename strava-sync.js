// netlify/functions/strava-sync.js
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  const { access_token, refresh_token, expires_at } = JSON.parse(event.body || '{}')
  if (!access_token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing token' }) }

  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET

  let token = access_token
  let newTokenData = null

  // Refresh token if expired (expires_at is unix timestamp in seconds)
  if (Date.now() / 1000 > expires_at - 60) {
    try {
      const refreshRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token, grant_type: 'refresh_token' }),
      })
      const refreshData = await refreshRes.json()
      if (refreshData.access_token) {
        token = refreshData.access_token
        newTokenData = {
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          expires_at: refreshData.expires_at,
        }
      }
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Token refresh failed' }) }
    }
  }

  // Fetch last 30 activities from Strava
  try {
    const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const activities = await res.json()
    if (!Array.isArray(activities)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Failed to fetch activities', detail: activities }) }

    // Map Strava activities to our format
    const running = []
    const workouts = []

    for (const act of activities) {
      const date = act.start_date_local?.split('T')[0] || act.start_date?.split('T')[0]
      if (!date) continue

      if (act.type === 'Run' || act.sport_type === 'Run') {
        running.push({
          strava_id: act.id,
          date,
          name: act.name,
          distance_km: parseFloat((act.distance / 1000).toFixed(2)),
          duration_min: parseFloat((act.moving_time / 60).toFixed(1)),
          notes: `Import Strava · ${act.name}`,
        })
      } else if (['WeightTraining', 'Workout', 'CrossFit', 'Crossfit', 'Elliptical', 'StairStepper', 'Swim'].includes(act.type || act.sport_type)) {
        workouts.push({
          strava_id: act.id,
          date,
          name: act.name,
          type: 'strength',
          notes: `Import Strava · ${act.type || act.sport_type} · ${Math.round(act.moving_time / 60)} min`,
        })
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ running, workouts, newTokenData }),
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
