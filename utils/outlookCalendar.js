// Host-level Outlook / Microsoft 365 calendar connection, via Microsoft
// Graph. Same two-way sync pattern as utils/googleCalendar.js. Pure fetch --
// no new dependency needed for a plain OAuth2 authorization-code flow.
//
// Requires MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET from an Azure App
// Registration (Calendars.ReadWrite + offline_access + User.Read delegated
// permissions), with this callback URL added as a redirect URI:
//   ${SERVER_URL}/api/calendar/outlook/callback

const REDIRECT_URI = `${process.env.SERVER_URL || "https://vencome-server.onrender.com"}/api/calendar/outlook/callback`;
const SCOPES = ["offline_access", "Calendars.ReadWrite", "User.Read"].join(" ");
const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "consent", // force a refresh token even on reconnect
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${res.status}`);
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

async function getAccessToken(refreshToken) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function getUserEmail(accessToken) {
  const res = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.mail || data.userPrincipalName || null;
}

async function createEvent(refreshToken, { summary, description, start, end, location }) {
  const accessToken = await getAccessToken(refreshToken);
  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: summary,
      body: { contentType: "text", content: description || "" },
      location: location ? { displayName: location } : undefined,
      start: { dateTime: new Date(start).toISOString(), timeZone: "UTC" },
      end: { dateTime: new Date(end).toISOString(), timeZone: "UTC" },
    }),
  });
  if (!res.ok) throw new Error(`Outlook create event failed: ${res.status}`);
  const event = await res.json();
  return event.id;
}

async function deleteEvent(refreshToken, eventId) {
  const accessToken = await getAccessToken(refreshToken);
  await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}

// Rolling 2-year forward window, same as the Google Calendar pull sync.
async function listEvents(refreshToken) {
  const accessToken = await getAccessToken(refreshToken);
  const start = new Date().toISOString();
  const end = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const url = `${GRAPH_BASE}/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=250`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`Outlook list events failed: ${res.status}`);
  const data = await res.json();
  return (data.value || [])
    .filter((event) => event.start?.dateTime && event.end?.dateTime)
    .map((event) => ({
      id: event.id,
      start: event.start.dateTime,
      end: event.end.dateTime,
    }));
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getUserEmail,
  createEvent,
  deleteEvent,
  listEvents,
};
