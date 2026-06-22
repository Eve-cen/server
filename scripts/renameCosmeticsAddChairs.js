require('dotenv').config({ path: 'config.env' });
const mongoose = require('mongoose');
const Category = require('../models/Category');

const seed = async () => {
  try {
    await mongoose.connect(process.env.DATABASE);
    console.log('MongoDB connected');

    const category = await Category.findOne({ name: 'Cosmetics Space' });
    if (!category) {
      console.log('Category "Cosmetics Space" not found — nothing to rename');
      process.exit(1);
    }

    category.name = 'Beauty & Cosmetics';

    const existingSubNames = category.subcategories.map((s) => s.name);
    if (!existingSubNames.includes('Chairs')) {
      category.subcategories.push({
        name: 'Chairs',
        description: 'Single-chair bookings for barbers, hairdressers, and beauty professionals.',
        image: ' `https://images.pexels.com/photos/3998429/pexels-photo-3998429.jpeg` ',
      });
      console.log('Added "Chairs" subcategory');
    } else {
      console.log('"Chairs" subcategory already exists — skipping');
    }

    category.markModified('subcategories');
    await category.save();

    console.log(`Renamed to: ${category.name}`);
    console.log(`Subcategories now: ${category.subcategories.map((s) => s.name).join(', ')}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

seed();
