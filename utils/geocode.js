// Shared by routes/properties.js (create/update fallback when a listing's
// coordinates come back empty/zero) and routes/geocode.js's own endpoint.
async function geocodeAddress({ address, city, country }) {
  const fullAddress = [address, city, country].filter(Boolean).join(", ");
  if (!fullAddress) return null;

  try {
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
  } catch (err) {
    console.error("Geocoding failed:", err.message);
    return null;
  }
}

module.exports = { geocodeAddress };
