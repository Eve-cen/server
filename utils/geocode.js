// Shared by routes/properties.js (create/update fallback when a listing's
// coordinates come back empty/zero), routes/admin.js's backfill endpoint,
// and routes/geocode.js's own endpoint.

async function geocodeWithGoogle(fullAddress) {
  const response = await fetch(
    "https://maps.googleapis.com/maps/api/geocode/json?" +
      new URLSearchParams({
        address: fullAddress,
        key: process.env.GOOGLE_MAPS_API_KEY,
      })
  );
  const data = await response.json();
  if (!data.results?.length) return null;
  const { lat, lng } = data.results[0].geometry.location;
  return { latitude: lat, longitude: lng };
}

// No API key required, so this keeps working even if GOOGLE_MAPS_API_KEY
// is missing/invalid or the Geocoding API isn't enabled/billed on that
// Google Cloud project -- confirmed live to be the case here (both the
// new create/update fallback and the pre-existing GET /geocode route
// failed on genuinely valid addresses). Nominatim's usage policy requires
// a descriptive User-Agent and no more than ~1 req/sec, which is fine for
// this low-volume, occasional-fallback use.
async function geocodeWithNominatim(fullAddress) {
  const response = await fetch(
    "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({ q: fullAddress, format: "json", limit: "1" }),
    { headers: { "User-Agent": "VenCome/1.0 (properties geocoding fallback)" } }
  );
  const data = await response.json();
  if (!data?.length) return null;
  return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
}

async function geocodeAddress({ address, city, country }) {
  const fullAddress = [address, city, country].filter(Boolean).join(", ");
  if (!fullAddress) return null;

  try {
    const googleResult = await geocodeWithGoogle(fullAddress);
    if (googleResult) return googleResult;
  } catch (err) {
    console.error("Google geocoding failed:", err.message);
  }

  try {
    return await geocodeWithNominatim(fullAddress);
  } catch (err) {
    console.error("Nominatim geocoding failed:", err.message);
    return null;
  }
}

module.exports = { geocodeAddress };
