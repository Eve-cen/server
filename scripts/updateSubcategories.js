require('dotenv').config({ path: 'config.env' })
const mongoose = require('mongoose')
const Category = require('../models/Category')

const updates = [
  {
    name: 'Office Space',
    addSubcategories: [
      { name: 'Long-Term Leases', description: 'Long-term office lease solutions for businesses.', image: 'https://images.pexels.com/photos/1170412/pexels-photo-1170412.jpeg' },
      { name: 'Flexible / Serviced Offices', description: 'Fully serviced flexible office solutions.', image: 'https://images.pexels.com/photos/416322/pexels-photo-416322.jpeg' },
      { name: 'Co-Working Spaces', description: 'Shared coworking environments for professionals.', image: 'https://images.pexels.com/photos/1181396/pexels-photo-1181396.jpeg' },
      { name: 'Creative / Studio Offices', description: 'Creative studio-style office environments.', image: 'https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg' }
    ]
  },
  {
    name: 'Event Venues',
    addSubcategories: [
      { name: 'Birthdays', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/1543762/pexels-photo-1543762.jpeg' },
      { name: 'Social Event Spaces', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/2774556/pexels-photo-2774556.jpeg' },
      { name: 'Wedding & Banquet Halls', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/2608517/pexels-photo-2608517.jpeg' },
      { name: 'Creative & Cultural Spaces', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/236748/pexels-photo-236748.jpeg' },
      { name: 'Wellness & Lifestyle Event Spaces', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/1051838/pexels-photo-1051838.jpeg' },
      { name: 'Dining & Hospitality Event Rooms', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/1036857/pexels-photo-1036857.jpeg' },
      { name: 'Entertainment & Party Venues', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/1190297/pexels-photo-1190297.jpeg' },
      { name: 'Hybrid / Multi-Purpose Spaces', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/260689/pexels-photo-260689.jpeg' }
    ]
  },
  {
    name: 'Retail & Showroom',
    addSubcategories: [
      { name: 'Brand Experience Pop-Ups', description: 'Immersive spaces for customer brand engagement.', image: 'https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg' },
      { name: 'Food & Beverage Pop-Ups', description: 'Temporary food and beverage service locations.', image: 'https://images.pexels.com/photos/260922/pexels-photo-260922.jpeg' },
      { name: 'Art & Culture Pop-Ups', description: 'Spaces for art exhibitions and cultural events.', image: 'https://images.pexels.com/photos/1266808/pexels-photo-1266808.jpeg' },
      { name: 'Wellness & Beauty Pop-Ups', description: 'Temporary wellness and beauty service spaces.', image: 'https://images.pexels.com/photos/3997983/pexels-photo-3997983.jpeg' },
      { name: 'Seasonal & Holiday Pop-Ups', description: 'Pop-ups designed for seasonal campaigns and holidays.', image: 'https://images.pexels.com/photos/1303081/pexels-photo-1303081.jpeg' },
      { name: 'Product Testing / Market Research Pop-Ups', description: 'Spaces for product testing and market research.', image: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg' },
      { name: 'Collaborative Pop-Ups', description: 'Shared creative spaces for multiple brands.', image: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg' }
    ]
  },
  {
    name: 'Industrial & Warehouse',
    addSubcategories: [
      { name: 'Wine Storage', description: 'Secure temperature-controlled wine storage spaces.', image: 'https://images.pexels.com/photos/45209/wine-bottles-wine-cellar-red-wine-45209.jpeg' },
      { name: 'Personal Storage', description: 'Safe personal storage units for household items.', image: 'https://images.pexels.com/photos/4246105/pexels-photo-4246105.jpeg' },
      { name: 'Student Storage', description: 'Affordable storage solutions for students between moves.', image: 'https://images.pexels.com/photos/256468/pexels-photo-256468.jpeg' },
      { name: 'External Lockups', description: 'Secure external lockup units for flexible storage needs.', image: 'https://images.pexels.com/photos/4887213/pexels-photo-4887213.jpeg' },
      { name: 'Food Storage', description: 'Hygienic storage spaces for food and perishable goods.', image: 'https://images.pexels.com/photos/616401/pexels-photo-616401.jpeg' },
      { name: 'Chemical Storage', description: 'Regulated storage facilities for safe chemical handling.', image: 'https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg' },
      { name: 'Climate-Controlled Storage', description: 'Temperature and humidity controlled storage environments.', image: 'https://images.pexels.com/photos/1595104/pexels-photo-1595104.jpeg' },
      { name: 'Vehicle Storage', description: 'Secure storage spaces for cars, bikes, and vehicles.', image: 'https://images.pexels.com/photos/3802510/pexels-photo-3802510.jpeg' },
      { name: 'Portable Storage', description: 'Mobile storage units delivered to your location.', image: 'https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg' },
      { name: 'Business/Commercial Storage', description: 'Scalable storage solutions for business inventory and equipment.', image: 'https://images.pexels.com/photos/4481259/pexels-photo-4481259.jpeg' },
      { name: 'Document & Archive Storage', description: 'Secure archival storage for documents and records.', image: 'https://images.pexels.com/photos/267614/pexels-photo-267614.jpeg' },
      { name: 'Cold Storage', description: 'Refrigerated storage for temperature-sensitive goods.', image: 'https://images.pexels.com/photos/4792733/pexels-photo-4792733.jpeg' },
      { name: 'High-Security Storage', description: 'High-security vault-grade storage facilities.', image: 'https://images.pexels.com/photos/60504/safe-vault-security-money-60504.jpeg' }
    ]
  },
  {
    name: 'Medical & Clinical',
    addSubcategories: [
      { name: 'Osteopathy', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/5449112/pexels-photo-5449112.jpeg' },
      { name: 'Physiotherapy', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/4506109/pexels-photo-4506109.jpeg' },
      { name: 'Sports Therapy', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/4506110/pexels-photo-4506110.jpeg' },
      { name: 'Aesthetics', description: 'Professional space available for booking.', image: 'https://images.pexels.com/photos/3985338/pexels-photo-3985338.jpeg' }
    ]
  },
  {
    name: 'Hospitality & Leisure',
    addSubcategories: [
      { name: 'Reformer Pilates', description: 'Studios equipped with reformer pilates machines.', image: 'https://images.pexels.com/photos/4662363/pexels-photo-4662363.jpeg' },
      { name: 'Yoga Studio', description: 'Quiet spaces suitable for yoga and stretching sessions.', image: 'https://images.pexels.com/photos/3822621/pexels-photo-3822621.jpeg' },
      { name: 'Dance Studio', description: 'Open spaces for dance and fitness classes.', image: 'https://images.pexels.com/photos/868483/pexels-photo-868483.jpeg' },
      { name: 'Martial Arts Studio', description: 'Training areas for martial arts and combat fitness.', image: 'https://images.pexels.com/photos/4761713/pexels-photo-4761713.jpeg' }
    ]
  }
]

const seed = async () => {
  try {
    await mongoose.connect(process.env.DATABASE)
    console.log('MongoDB connected')

    for (const update of updates) {
      const category = await Category.findOne({ name: update.name })
      if (!category) {
        console.log(`Category not found: ${update.name} — skipping`)
        continue
      }

      const existingSubNames = category.subcategories.map(s => s.name)
      const newSubs = update.addSubcategories
        .filter(s => !existingSubNames.includes(s.name))
        .map(s => ({
          ...s,
          image: s.image || ' `https://images.pexels.com/photos/1181396/pexels-photo-1181396.jpeg` '
        }))

      if (newSubs.length === 0) {
        console.log(`${update.name}: no new subcategories to add`)
        continue
      }

      // Fix existing subcategories with empty images before saving
      category.subcategories = category.subcategories.map(s => ({
        ...s.toObject(),
        image: s.image || ' `https://images.pexels.com/photos/1181396/pexels-photo-1181396.jpeg` '
      }))

      // Push new subcategories
      category.subcategories.push(...newSubs)
      category.markModified('subcategories')
      await category.save()
      console.log(`${update.name}: added ${newSubs.length} new subcategories`)
    }

    console.log('Done')
    await mongoose.disconnect()
    process.exit(0)
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  }
}

seed()
