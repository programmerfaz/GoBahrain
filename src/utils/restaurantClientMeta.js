/** Normalise Postgres / API truthy for `restaurant_client.isfoodtruck` */
export const isTruthyFoodTruck = (value) =>
  value === true || value === 'true' || value === 't' || value === '1' || value === 1

/** `meal_type` often comma-separated list e.g. "Breakfast, Lunch, Snack" */
export const restaurantMealTypeHasSnackOffering = (mealType) =>
  /\bsnacks?\b/i.test(String(mealType || ''))

/** True when Snack appears but none of breakfast / lunch / dinner / brunch (light-eating venues). */
export const restaurantMealTypeSnackOnlyServing = (mealType) => {
  const t = String(mealType || '').toLowerCase()
  if (!/\bsnacks?\b/.test(t)) return false
  const fullMeals = ['breakfast', 'lunch', 'dinner', 'brunch']
  return !fullMeals.some((w) => t.includes(w))
}
