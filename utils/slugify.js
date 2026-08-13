// Shared slug generator -- same normalization Blog already uses locally
// (routes/blog.js), centralized here since Property and Category both need
// the identical logic plus collision-safe generation against a given model.
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Generates a slug from `title` and appends a short suffix if it collides
// with an existing document in `Model` (checked via `field`, default "slug").
async function generateUniqueSlug(Model, title, field = "slug") {
  const base = generateSlug(title) || "listing";
  let slug = base;
  let attempt = 0;
  while (await Model.exists({ [field]: slug })) {
    attempt += 1;
    slug = `${base}-${attempt > 1 ? Date.now().toString(36) : attempt}`;
  }
  return slug;
}

module.exports = { generateSlug, generateUniqueSlug };
