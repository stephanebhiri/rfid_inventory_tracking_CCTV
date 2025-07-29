const { body, param, query, validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      })),
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Validation rules for different endpoints
const validators = {
  // Item ID validation
  itemId: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Item ID must be a positive integer')
      .toInt()
  ],

  // CCTV video request validation
  cctvVideoRequest: [
    query('target')
      .isInt({ min: 1 })
      .withMessage('Target timestamp must be a positive integer')
      .toInt(),
    query('camera')
      .isInt({ min: 1, max: 6 })
      .withMessage('Camera ID must be between 1 and 6')
      .toInt()
  ],

  // Video filename validation (for streaming)
  videoFilename: [
    param('filename')
      .matches(/^cam\d+_\d+_[a-f0-9]+\.mp4$/)
      .withMessage('Invalid video filename format')
      .isLength({ max: 100 })
      .withMessage('Filename too long')
  ],

  // Health check query validation (optional)
  healthCheck: [
    query('format')
      .optional()
      .isIn(['json', 'plain'])
      .withMessage('Format must be json or plain')
  ],

  // Generic pagination validation
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt()
  ]
};

// Sanitization helpers
const sanitizers = {
  // Remove potential SQL injection characters from strings
  sanitizeString: [
    body('*').optional().trim().escape()
  ],

  // Normalize MAC addresses
  normalizeMacAddress: [
    body('mac_address')
      .optional()
      .customSanitizer(value => {
        if (typeof value === 'string') {
          return value.toUpperCase().replace(/[:-]/g, '');
        }
        return value;
      })
  ]
};

module.exports = {
  handleValidationErrors,
  validators,
  sanitizers
};