const { OAuth2Client } = require("google-auth-library");

// Host-level Google Calendar connection. Separate OAuth flow from the
// existing login-with-Google feature (which only ever asks for identity
// scopes) -- this one asks for Calendar access and offline (refresh-token)
// access so VenCome can sync in the background, not just while the host is
// looking at the page.
//
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on the same OAuth client
// already used for login, with the Calendar API enabled on that Google Cloud
// project and this callback URL added to the client's authorized redirect URIs:
//   ${SERVER_URL}/api/calendar/google/callback

const REDIRECT_URI = `${process.env.SERVER_URL || "https://vencome-server.onrender.com"}/api/calendar/google/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

// state carries a signed JWT (built by the route) so the callback can trust
// which VenCome user is connecting without needing an auth header — Google's
// redirect is a plain browser navigation, it can't carry a Bearer token.
function getAuthUrl(state) {
  const client = getClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token even on reconnect
    scope: SCOPES,
    state,
  });
}

async function exchangeCodeForTokens(code) {
  const client = getClient();
  const { tokens } = await client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, ... }
}

async function getUserEmail(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

async function getAccessToken(refreshToken) {
  const client = getClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return credentials.access_token;
}

async function createEvent(refreshToken, { summary, description, start, end, location }) {
  const accessToken = await getAccessToken(refreshToken);
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        location,
        start: { dateTime: new Date(start).toISOString() },
        end: { dateTime: new Date(end).toISOString() },
      }),
    }
  );
  if (!res.ok) throw new Error(`Google Calendar create event failed: ${res.status}`);
  const event = await res.json();
  return event.id;
}

async function deleteEvent(refreshToken, eventId) {
  const accessToken = await getAccessToken(refreshToken);
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  ).catch(() => {}); // event may already be gone -- not worth failing the caller over
}

// Pull events forward from now for a rolling sync window (2 years is plenty
// for advance bookings without pulling a host's entire calendar history).
async function listEvents(refreshToken) {
  const accessToken = await getAccessToken(refreshToken);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=250`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google Calendar list events failed: ${res.status}`);
  const data = await res.json();
  return (data.items || [])
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
