require('dotenv').config({ path: 'config.env' })
const mongoose = require('mongoose')
const Category = require('../models/Category')

const PLACEHOLDER = ' `https://images.pexels.com/photos/1181396/pexels-photo-1181396.jpeg` '

const updates = [
  {
    name: 'Clean Rooms',
    image: ' `https://images.pexels.com/photos/3825529/pexels-photo-3825529.jpeg` ',
    subcategories: [
      { name: 'Pharmaceutical Clean Room', description: 'GMP-compliant clean rooms for pharmaceutical manufacturing.', image: ' `https://images.pexels.com/photos/3825529/pexels-photo-3825529.jpeg` ' },
      { name: 'Biotech Clean Room', description: 'Controlled environments for biotech research and production.', image: ' `https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg` ' },
      { name: 'Electronics Manufacturing', description: 'ESD-safe clean rooms for electronics assembly.', image: ' `https://images.pexels.com/photos/3913025/pexels-photo-3913025.jpeg` ' },
      { name: 'Research Clean Room', description: 'Clean room facilities for scientific research.', image: ' `https://images.pexels.com/photos/2280547/pexels-photo-2280547.jpeg` ' },
      { name: 'Sterile Compounding', description: 'Sterile environments for pharmaceutical compounding.', image: ' `https://images.pexels.com/photos/4226896/pexels-photo-4226896.jpeg` ' }
    ]
  },
  {
    name: 'Lab Rooms',
    image: ' `https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg` ',
    subcategories: [
      { name: 'Biology Lab', description: 'Fully equipped biology research laboratories.', image: ' `https://images.pexels.com/photos/3938023/pexels-photo-3938023.jpeg` ' },
      { name: 'Chemistry Lab', description: 'Safety-compliant chemistry laboratory spaces.', image: ' `https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg` ' },
      { name: 'Research Lab', description: 'Multi-purpose research laboratory facilities.', image: ' `https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg` ' },
      { name: 'Testing Lab', description: 'Quality testing and analysis laboratory spaces.', image: ' `https://images.pexels.com/photos/4226896/pexels-photo-4226896.jpeg` ' },
      { name: 'Medical Lab', description: 'Clinical and diagnostic medical laboratory rooms.', image: ' `https://images.pexels.com/photos/5452201/pexels-photo-5452201.jpeg` ' }
    ]
  },
  {
    name: 'Cosmetics Space',
    image: ' `https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg` ',
    subcategories: [
      { name: 'Nail Studio', description: 'Professional nail treatment and art studio.', image: ' `https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg` ' },
      { name: 'Lash & Brow Studio', description: 'Specialist lash and brow treatment rooms.', image: ' `https://images.pexels.com/photos/3997987/pexels-photo-3997987.jpeg` ' },
      { name: 'Makeup Studio', description: 'Professional makeup artist studio spaces.', image: ' `https://images.pexels.com/photos/3985338/pexels-photo-3985338.jpeg` ' },
      { name: 'Spray Tan Room', description: 'Private spray tan and tanning treatment rooms.', image: ' `https://images.pexels.com/photos/3997983/pexels-photo-3997983.jpeg` ' },
      { name: 'Hair Studio', description: 'Hair styling and treatment studio spaces.', image: ' `https://images.pexels.com/photos/3993444/pexels-photo-3993444.jpeg` ' },
      { name: 'Beauty Treatment Room', description: 'Multi-purpose beauty and aesthetics treatment rooms.', image: ' `https://images.pexels.com/photos/3985340/pexels-photo-3985340.jpeg` ' }
    ]
  },
  {
    name: 'Treatment Rooms',
    image: ' `https://images.pexels.com/photos/3822625/pexels-photo-3822625.jpeg` '
  },
  {
    name: 'Fitness Spaces',
    image: ' `https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg` '
  }
]

const seed = async () => {
  try {
    await mongoose.connect(process.env.DATABASE)
    console.log('MongoDB connected')

    for (const update of updates) {
      const category = await Category.findOne({ name: update.name })
      if (!category) {
        console.log(`Not found: ${update.name} — skipping`)
        continue
      }

      // Update image
      if (update.image) {
        category.image = update.image
      }

      // Add subcategories if provided
      if (update.subcategories && update.subcategories.length > 0) {
        const existingSubNames = category.subcategories.map(s => s.name)

        // Fix existing subcategories with empty images
        category.subcategories = category.subcategories.map(s => {
          const obj = s.toObject ? s.toObject() : s
          return { ...obj, image: obj.image || PLACEHOLDER }
        })

        const newSubs = update.subcategories
          .filter(s => !existingSubNames.includes(s.name))
          .map(s => ({ ...s, image: s.image || PLACEHOLDER }))

        if (newSubs.length > 0) {
          category.subcategories.push(...newSubs)
          console.log(`${update.name}: added ${newSubs.length} subcategories`)
        } else {
          console.log(`${update.name}: no new subcategories to add`)
        }
      }

      category.markModified('subcategories')
      await category.save()
      console.log(`${update.name}: image and subcategories updated`)
    }

    console.log('All done')
    await mongoose.disconnect()
    process.exit(0)
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

seed()
