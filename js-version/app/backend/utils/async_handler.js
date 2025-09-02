/**
 * Wrapper for Express async handlers to properly handle async/await errors
 *
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - Express middleware function that properly handles async errors
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
