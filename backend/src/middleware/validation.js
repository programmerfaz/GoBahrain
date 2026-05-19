import { z } from 'zod'

/**
 * Request validation schemas for backend API endpoints
 * 
 * Validates:
 * - Required fields
 * - Data types
 * - Array constraints
 * - String lengths
 */

export const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message too long (max 2000 characters)'),
})

export const aiPlanRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(500, 'Message too long (max 500 characters)'),
  preferences: z
    .object({
      vibe: z.string().optional(),
      category: z.string().optional(),
      price_range: z.string().optional(),
    })
    .optional(),
})

export const hydratedCatalogRequestSchema = z.object({
  preferenceLabels: z.array(z.string()).max(20).optional(),
  profileActivity: z.array(z.string()).max(20).optional(),
  foodLabels: z.array(z.string()).max(15).optional(),
  profileNarrative: z.string().max(1000).optional(),
  profileAnswers: z
    .object({
      homeCountry: z.string().optional(),
      tripLengthDays: z.string().optional(),
      travelParty: z.string().optional(),
      budgetBand: z.string().optional(),
      dietaryHardNos: z.string().optional(),
      mobilityNotes: z.string().optional(),
      heatSensitivity: z.string().optional(),
      sessionIntentDay: z.string().optional(),
    })
    .optional(),
})

export const matchClientsRequestSchema = z.object({
  preferences: z.array(z.string()).max(20).optional().default([]),
  foodCategories: z.array(z.string()).max(15).optional().default([]),
})

/**
 * Validation middleware factory
 * Returns Express middleware that validates request body against a Zod schema
 */
export function validateRequest(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body)
      req.body = validated
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }))
        return res.status(400).json({
          error: 'Validation failed',
          details: errors,
        })
      }
      next(error)
    }
  }
}
