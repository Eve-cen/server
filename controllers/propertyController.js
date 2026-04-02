// controllers/propertyController.js
import { computeRankingScore } from "../utils/rankingScore.js";

export const searchProperties = async (req, res) => {
  try {
    const { query, category, subcategory, ...filters } = req.query;

    const properties = await Property.find({
      ...(query && { name: { $regex: query, $options: "i" } }),
      ...(category && { category }),
      ...(subcategory && { subcategory }),
      ...filters,
    }).lean();

    if (properties.length === 0) {
      return res.status(200).json({ properties: [] });
    }

    // Compute max values for normalization
    const maxValues = {
      views: Math.max(...properties.map((p) => p.views || 0)),
      bookings: Math.max(...properties.map((p) => p.bookings || 0)),
      price: Math.max(...properties.map((p) => p.price || 0)),
    };

    // Attach score and sort descending
    const ranked = properties
      .map((property) => ({
        ...property,
        _score: computeRankingScore(property, maxValues),
      }))
      .sort((a, b) => b._score - a._score);

    return res.status(200).json({ properties: ranked });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch properties" });
  }
};
