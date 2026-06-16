require('dotenv').config({ path: 'config.env' })
const mongoose = require('mongoose')
const Category = require('../models/Category')

const cleanImageUrl = (value) => {
  if (!value) return value
  return String(value).replace(/`/g, '').trim()
}

const fixCategoryImages = async () => {
  try {
    await mongoose.connect(process.env.DATABASE)
    console.log('MongoDB connected')

    const categories = await Category.find({})

    for (const category of categories) {
      const cleanedImage = cleanImageUrl(category.image)
      const cleanedSubcategories = (category.subcategories || []).map((sub) => {
        const obj = sub.toObject ? sub.toObject() : sub
        return {
          ...obj,
          image: cleanImageUrl(obj.image)
        }
      })

      await Category.updateOne(
        { _id: category._id },
        {
          $set: {
            image: cleanedImage,
            subcategories: cleanedSubcategories
          }
        }
      )

      console.log(`${category.name}: image fields cleaned`)
    }

    await mongoose.disconnect()
    console.log('Done')
    process.exit(0)
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  }
}

fixCategoryImages()
