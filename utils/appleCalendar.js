// Host-level Apple Calendar (iCloud) connection via CalDAV. Apple doesn't
// offer a practical OAuth flow for this, so hosts authenticate with their
// Apple ID email + an "app-specific password" generated at
// appleid.apple.com (Account -> App-Specific Passwords) -- the standard,
// Apple-documented way for third-party apps to access iCloud CalDAV/CardDAV.
// Pull-only, same reasoning as Cal.com/Calendly (see utils/calcomCalendar.js).
const { DAVClient } = require("tsdav");
const ical = require("node-ical");

const ICLOUD_CALDAV_URL = "https://caldav.icloud.com";

function buildClient(username, password) {
  return new DAVClient({
    serverUrl: ICLOUD_CALDAV_URL,
    credentials: { username, password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

// Logs in and fetches the calendar list -- enough to confirm the Apple ID +
// app-specific password combo is valid before saving it.
async function verifyCredentials(username, password) {
  const client = buildClient(username, password);
  await client.login();
  const calendars = await client.fetchCalendars();
  return { calendarCount: calendars.length };
}

// Rolling 2-year forward window, same pattern as the other pull syncs.
// Pulls events across every calendar on the account (not just one) since
// hosts commonly split personal/work events across multiple iCloud calendars.
async function listEvents(username, password) {
  const client = buildClient(username, password);
  await client.login();
  const calendars = await client.fetchCalendars();

  const now = new Date();
  const rangeEnd = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);

  const allEvents = [];
  for (const calendar of calendars) {
    const objects = await client.fetchCalendarObjects({
      calendar,
      timeRange: {
        start: now.toISOString(),
        end: rangeEnd.toISOString(),
      },
    });

    for (const obj of objects) {
      if (!obj.data) continue;
      try {
        const parsed = ical.sync.parseICS(obj.data);
        for (const item of Object.values(parsed)) {
          if (item.type === "VEVENT" && item.start && item.end) {
            allEvents.push({
              id: item.uid || obj.url,
              start: item.start,
              end: item.end,
            });
          }
        }
      } catch (_) {
        // Skip any single malformed calendar object rather than failing the whole sync.
      }
    }
  }

  return allEvents;
}

module.exports = {
  verifyCredentials,
  listEvents,
};
