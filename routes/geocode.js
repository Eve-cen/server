const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  const { address, city, country } = req.query;

  if (!address || !city || !country) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const fullAddress = `${address}, ${city}, ${country}`;

  try {
    const response = await fetch(
      "https://maps.googleapis.com/maps/api/geocode/json?" +
        new URLSearchParams({
          address: fullAddress,
          key: process.env.GOOGLE_MAPS_API_KEY,
        })
    );

    const data = await response.json();
    console.log(response);
    if (data.results.length === 0) {
      return res.status(404).json({ error: "Location not found" });
    }

    const { lat, lng } = data.results[0].geometry.location;

    return res.json({ latitude: lat, longitude: lng });
  } catch (error) {
    return res.status(500).json({
      error: "Geocoding failed",
      details: error,
    });
  }
});

module.exports = router;
