require('dotenv').config({ path: 'config.env' });
const mongoose = require('mongoose');
const https = require('https');
const Property = require('../models/Property');

const geocode = (address) => new Promise((resolve, reject) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const json = JSON.parse(data);
      if (json.results?.[0]?.geometry?.location) {
        resolve(json.results[0].geometry.location);
      } else {
        resolve(null);
      }
    });
  }).on('error', reject);
});

mongoose.connect(process.env.DATABASE).then(async () => {
  const properties = await Property.find({
    $or: [
      { 'coordinates.latitude': { $exists: false } },
      { 'coordinates.latitude': null },
      { 'coordinates.latitude': 0 },
    ]
  });

  console.log(`Found ${properties.length} properties without coordinates`);

  for (const property of properties) {
    const address = [
      property.location?.address,
      property.location?.city,
      property.location?.country
    ].filter(Boolean).join(', ');

    console.log(`Geocoding: ${property.title} — ${address}`);
    const coords = await geocode(address);

    if (coords) {
      property.coordinates = { latitude: coords.lat, longitude: coords.lng };
      await property.save();
      console.log(`✓ Updated: ${coords.lat}, ${coords.lng}`);
    } else {
      console.log(`✗ Could not geocode`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Done');
  process.exit();
});
