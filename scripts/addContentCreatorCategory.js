require('dotenv').config({ path: 'config.env' });
const mongoose = require('mongoose');
const Category = require('../models/Category');

const seed = async () => {
  try {
    await mongoose.connect(process.env.DATABASE);
    console.log('MongoDB connected');

    const existing = await Category.findOne({ name: 'Content Creator Space' });
    if (existing) {
      console.log('Category already exists, skipping creation');
      process.exit(0);
    }

    const category = await Category.create({
      name: 'Content Creator Space',
      description: 'Studio and production spaces for content creators, podcasters, streamers, and influencers.',
      image: ' `https://images.pexels.com/photos/3756879/pexels-photo-3756879.jpeg` ',
      subcategories: [
        { name: 'Podcast Studio', description: 'Soundproofed rooms for podcast recording.', image: ' `https://images.pexels.com/photos/7586663/pexels-photo-7586663.jpeg` ' },
        { name: 'Photo Studio', description: 'Professional photography studio space.', image: ' `https://images.pexels.com/photos/1983046/pexels-photo-1983046.jpeg` ' },
        { name: 'Live Streaming Setup', description: 'Spaces equipped for live streaming and broadcast.', image: ' `https://images.pexels.com/photos/4009402/pexels-photo-4009402.jpeg` ' },
        { name: 'Green Screen Room', description: 'Studio space with green screen for video production.', image: ' `https://images.pexels.com/photos/3062541/pexels-photo-3062541.jpeg` ' },
        { name: 'YouTube/Video Studio', description: 'Fully equipped video production studio space.', image: ' `https://images.pexels.com/photos/3062539/pexels-photo-3062539.jpeg` ' },
      ],
    });

    console.log(`Created category: ${category.name}`);
    console.log(`Subcategories: ${category.subcategories.map((s) => s.name).join(', ')}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

seed();
