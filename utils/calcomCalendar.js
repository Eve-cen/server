// Host-level Cal.com connection. Unlike Google/Outlook, Cal.com connects via
// a personal API key the host generates themselves (Cal.com dashboard ->
// Settings -> Developer -> API Keys) and pastes into VenCome -- no OAuth app
// registration needed.
//
// Cal.com is a scheduling platform built around "event types", not a plain
// calendar -- there's no generic "create an arbitrary event" API the way
// Google/Outlook have. So this is pull-only: VenCome reads the host's
// existing Cal.com bookings and blocks those dates on VenCome availability.
// It does not push VenCome bookings out to Cal.com.

const API_BASE = "https://api.cal.com/v1";

async function verifyApiKey(apiKey) {
  const res = await fetch(`${API_BASE}/me?apiKey=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error("Invalid Cal.com API key");
  const data = await res.json();
  return data.user || null; // { id, username, email, ... }
}

// Rolling 2-year forward window, same as the Google/Outlook pull syncs.
async function listBookings(apiKey) {
  const params = new URLSearchParams({
    apiKey,
    status: "upcoming",
  });
  const res = await fetch(`${API_BASE}/bookings?${params.toString()}`);
  if (!res.ok) throw new Error(`Cal.com list bookings failed: ${res.status}`);
  const data = await res.json();
  return (data.bookings || [])
    .filter((booking) => booking.startTime && booking.endTime)
    .map((booking) => ({
      id: String(booking.id || booking.uid),
      start: booking.startTime,
      end: booking.endTime,
    }));
}

module.exports = {
  verifyApiKey,
  listBookings,
};
