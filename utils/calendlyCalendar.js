// Host-level Calendly connection. Standard OAuth2 authorization-code flow,
// same shape as utils/outlookCalendar.js. Pull-only, same reasoning as
// Cal.com (utils/calcomCalendar.js) -- Calendly is built around "event
// types" that guests book, not a generic calendar you can push arbitrary
// events onto, so this blocks VenCome dates from existing Calendly bookings
// rather than pushing VenCome bookings out to Calendly.
//
// Requires CALENDLY_CLIENT_ID + CALENDLY_CLIENT_SECRET from a Calendly OAuth
// app (calendly.com/integrations -> "Build your own" / API & Webhooks ->
// OAuth application), with this callback URL added as a redirect URI:
//   ${SERVER_URL}/api/calendar/calendly/callback

const REDIRECT_URI = `${process.env.SERVER_URL || "https://vencome-server.onrender.com"}/api/calendar/calendly/callback`;
const AUTH_BASE = "https://auth.calendly.com";
const API_BASE = "https://api.calendly.com";

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.CALENDLY_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CALENDLY_CLIENT_ID,
      client_secret: process.env.CALENDLY_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Calendly token exchange failed: ${res.status}`);
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

async function getAccessToken(refreshToken) {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CALENDLY_CLIENT_ID,
      client_secret: process.env.CALENDLY_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Calendly token refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function getCurrentUser(accessToken) {
  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.resource || null; // { uri, name, email, ... }
}

// Rolling 2-year forward window, same as the other pull syncs.
async function listEvents(refreshToken) {
  const accessToken = await getAccessToken(refreshToken);
  const user = await getCurrentUser(accessToken);
  if (!user?.uri) throw new Error("Couldn't resolve Calendly user");

  const minStart = new Date().toISOString();
  const maxStart = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    user: user.uri,
    status: "active",
    min_start_time: minStart,
    max_start_time: maxStart,
    count: "100",
  });

  const res = await fetch(`${API_BASE}/scheduled_events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendly list events failed: ${res.status}`);
  const data = await res.json();
  return (data.collection || [])
    .filter((event) => event.start_time && event.end_time)
    .map((event) => ({
      id: event.uri.split("/").pop(),
      start: event.start_time,
      end: event.end_time,
    }));
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getCurrentUser,
  listEvents,
};
