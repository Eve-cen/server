require('dotenv').config({ path: 'config.env' })
const mongoose = require('mongoose')
const Category = require('../models/Category')

const categories = [
  {
    name: 'Treatment Rooms',
    image: ' `https://images.pexels.com/photos/3822625/pexels-photo-3822625.jpeg?auto=compress&cs=tinysrgb&w=800` ',
    description: 'Private and serene treatment rooms ideal for wellness sessions, massages, and therapy.',
    subcategories: [
      { name: 'Osteopathy', description: 'Professional space available for booking.', image: ' `https://images.pexels.com/photos/5449112/pexels-photo-5449112.jpeg` ' },
      { name: 'Physiotherapy', description: 'Professional space available for booking.', image: ' `https://images.pexels.com/photos/4506109/pexels-photo-4506109.jpeg` ' },
      { name: 'Sports Therapy', description: 'Professional space available for booking.', image: ' `https://images.pexels.com/photos/4506110/pexels-photo-4506110.jpeg` ' },
      { name: 'Hands on Care', description: 'Professional space available for booking.', image: ' `https://images.pexels.com/photos/3959485/pexels-photo-3959485.jpeg` ' },
      { name: 'Aesthetics', description: 'Professional space available for booking.', image: ' `https://images.pexels.com/photos/3985338/pexels-photo-3985338.jpeg` ' }
    ]
  },
  {
    name: 'Clean Rooms',
    image: ' `https://images.pexels.com/photos/3825529/pexels-photo-3825529.jpeg?auto=compress&cs=tinysrgb&w=800` ',
    description: 'Specialized controlled environments designed for pharmaceutical, biotech, or electronics manufacturing.',
    subcategories: []
  },
  {
    name: 'Lab Rooms',
    image: ' `https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg?auto=compress&cs=tinysrgb&w=800` ',
    description: 'Advanced laboratory rooms equipped for research, testing, and scientific development.',
    subcategories: []
  },
  {
    name: 'Cosmetics Space',
    image: ' `https://media.istockphoto.com/id/2155481789/photo/modern-beauty-and-cosmetics-store-with-display-shelves.jpg?s=612x612&w=0&k=20&c=kI1Dflw0P2CatcCOKyiQgQ3lVX6UKSoZLtuekcVSshQ=` ',
    description: 'A clean and modern space designed for beauty treatments, cosmetic procedures, and professional makeup sessions.',
    subcategories: []
  },
  {
    name: 'Fitness Spaces',
    image: ' `https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=800` ',
    description: 'Spaces designed for fitness, training, and group exercise activities.',
    subcategories: [
      { name: 'Reformer pilates rooms', description: 'Studios equipped with reformer pilates machines', image: ' `https://images.pexels.com/photos/4662363/pexels-photo-4662363.jpeg` ' },
      { name: 'Yoga', description: 'Quiet spaces suitable for yoga and stretching sessions', image: ' `https://images.pexels.com/photos/3822621/pexels-photo-3822621.jpeg` ' },
      { name: 'Zumba', description: 'Open spaces for dance-based fitness classes', image: ' `https://images.pexels.com/photos/868483/pexels-photo-868483.jpeg` ' },
      { name: 'Kickboxing', description: 'Training areas for kickboxing and combat fitness', image: ' `https://images.pexels.com/photos/4761713/pexels-photo-4761713.jpeg` ' }
    ]
  }
]

const seed = async () => {
  try {
    await mongoose.connect(process.env.DATABASE)
    console.log('MongoDB connected')

    const existingNames = (await Category.find({}, 'name')).map(c => c.name)
    const newCategories = categories.filter(c => !existingNames.includes(c.name))
    console.log(`Found ${existingNames.length} existing categories, adding ${newCategories.length} new ones`)

    if (newCategories.length === 0) {
      console.log('No new categories to add — all already exist')
      await mongoose.disconnect()
      process.exit(0)
    }

    const inserted = await Category.insertMany(newCategories)
    console.log(`Successfully seeded ${inserted.length} categories`)

    await mongoose.disconnect()
    console.log('Done')
    process.exit(0)
  } catch (err) {
    console.error('Seed error:', err)
    process.exit(1)
  }
}

seed()
