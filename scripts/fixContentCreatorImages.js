require('dotenv').config({ path: 'config.env' });
const mongoose = require('mongoose');
const Category = require('../models/Category');

const FIXED_IMAGES = {
  category: 'https://images.pexels.com/photos/3756879/pexels-photo-3756879.jpeg',
  subcategories: {
    'Podcast Studio': 'https://images.pexels.com/photos/7586663/pexels-photo-7586663.jpeg',
    'Photo Studio': 'https://images.pexels.com/photos/1983046/pexels-photo-1983046.jpeg',
    'Live Streaming Setup': 'https://images.pexels.com/photos/4009402/pexels-photo-4009402.jpeg',
    'Green Screen Room': 'https://images.pexels.com/photos/3062541/pexels-photo-3062541.jpeg',
    'YouTube/Video Studio': 'https://images.pexels.com/photos/3062539/pexels-photo-3062539.jpeg',
  },
};

const run = async () => {
  try {
    await mongoose.connect(process.env.DATABASE);
    console.log('MongoDB connected');

    const category = await Category.findOne({ name: 'Content Creator Space' });
    if (!category) {
      console.log('Category not found');
      process.exit(1);
    }

    category.image = FIXED_IMAGES.category;
    category.subcategories = category.subcategories.map((sub) => ({
      ...sub.toObject(),
      image: FIXED_IMAGES.subcategories[sub.name] || sub.image,
    }));
    category.markModified('subcategories');
    await category.save();

    console.log('Fixed image URLs for Content Creator Space and its subcategories');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

run();
