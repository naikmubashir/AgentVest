import express from "express";

const router = express.Router();

/**
 * @route GET /api/health
 * @description Check the health of the API
 * @access Public
 */
router.get("/", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

export default router;
