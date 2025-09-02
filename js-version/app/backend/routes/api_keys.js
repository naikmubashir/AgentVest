import express from "express";
import apiKeyRepository from "../repositories/api_key_repository.js";

const router = express.Router();

/**
 * @route GET /api/api-keys
 * @description Get all API keys
 * @access Public
 */
router.get("/", async (req, res) => {
  try {
    const apiKeys = await apiKeyRepository.getAll();

    // Mask API key values for security
    const maskedApiKeys = apiKeys.map((key) => {
      const keyObj = key.toJSON();
      const maskedKey = maskApiKey(keyObj.api_key);
      return { ...keyObj, api_key: maskedKey };
    });

    res.json(maskedApiKeys);
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch API keys",
      details: error.message,
    });
  }
});

/**
 * @route GET /api/api-keys/service/:service
 * @description Get API keys by service
 * @access Public
 */
router.get("/service/:service", async (req, res) => {
  try {
    const { service } = req.params;
    const apiKeys = await apiKeyRepository.getByService(service);

    // Mask API key values for security
    const maskedApiKeys = apiKeys.map((key) => {
      const keyObj = key.toJSON();
      const maskedKey = maskApiKey(keyObj.api_key);
      return { ...keyObj, api_key: maskedKey };
    });

    res.json(maskedApiKeys);
  } catch (error) {
    res.status(500).json({
      error: `Failed to fetch API keys for service ${req.params.service}`,
      details: error.message,
    });
  }
});

/**
 * @route GET /api/api-keys/active/:service
 * @description Get active API key for a service
 * @access Public
 */
router.get("/active/:service", async (req, res) => {
  try {
    const { service } = req.params;
    const apiKey = await apiKeyRepository.getActiveByService(service);

    if (!apiKey) {
      return res.status(404).json({
        error: `No active API key found for service ${service}`,
      });
    }

    // Mask API key value for security
    const keyObj = apiKey.toJSON();
    const maskedKey = maskApiKey(keyObj.api_key);

    res.json({ ...keyObj, api_key: maskedKey });
  } catch (error) {
    res.status(500).json({
      error: `Failed to fetch active API key for service ${req.params.service}`,
      details: error.message,
    });
  }
});

/**
 * @route GET /api/api-keys/:id
 * @description Get API key by ID
 * @access Public
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const apiKey = await apiKeyRepository.getById(id);

    if (!apiKey) {
      return res.status(404).json({ error: `API key with ID ${id} not found` });
    }

    // Mask API key value for security
    const keyObj = apiKey.toJSON();
    const maskedKey = maskApiKey(keyObj.api_key);

    res.json({ ...keyObj, api_key: maskedKey });
  } catch (error) {
    res.status(500).json({
      error: `Failed to fetch API key with ID ${req.params.id}`,
      details: error.message,
    });
  }
});

/**
 * @route POST /api/api-keys
 * @description Create a new API key
 * @access Public
 */
router.post("/", async (req, res) => {
  try {
    const { name, service, api_key } = req.body;

    if (!name || !service || !api_key) {
      return res
        .status(400)
        .json({ error: "Name, service, and API key are required" });
    }

    const newApiKey = await apiKeyRepository.create({
      name,
      service,
      api_key,
      is_active: true,
    });

    // Mask API key value in response for security
    const keyObj = newApiKey.toJSON();
    const maskedKey = maskApiKey(keyObj.api_key);

    res.status(201).json({ ...keyObj, api_key: maskedKey });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create API key",
      details: error.message,
    });
  }
});

/**
 * @route PUT /api/api-keys/:id
 * @description Update an API key
 * @access Public
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, service, api_key } = req.body;

    if (!name && !service && !api_key) {
      return res
        .status(400)
        .json({
          error: "At least one field (name, service, or api_key) is required",
        });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (service) updateData.service = service;
    if (api_key) updateData.api_key = api_key;

    const updatedApiKey = await apiKeyRepository.update(id, updateData);

    // Mask API key value in response for security
    const keyObj = updatedApiKey.toJSON();
    const maskedKey = maskApiKey(keyObj.api_key);

    res.json({ ...keyObj, api_key: maskedKey });
  } catch (error) {
    res.status(500).json({
      error: `Failed to update API key with ID ${req.params.id}`,
      details: error.message,
    });
  }
});

/**
 * @route DELETE /api/api-keys/:id
 * @description Delete an API key
 * @access Public
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await apiKeyRepository.delete(id);

    res.json({ message: `API key with ID ${id} deleted successfully` });
  } catch (error) {
    res.status(500).json({
      error: `Failed to delete API key with ID ${req.params.id}`,
      details: error.message,
    });
  }
});

/**
 * @route POST /api/api-keys/:id/set-active
 * @description Set an API key as active
 * @access Public
 */
router.post("/:id/set-active", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedApiKey = await apiKeyRepository.setActive(id);

    // Mask API key value in response for security
    const keyObj = updatedApiKey.toJSON();
    const maskedKey = maskApiKey(keyObj.api_key);

    res.json({
      message: `API key with ID ${id} set as active`,
      apiKey: { ...keyObj, api_key: maskedKey },
    });
  } catch (error) {
    res.status(500).json({
      error: `Failed to set API key ${req.params.id} as active`,
      details: error.message,
    });
  }
});

/**
 * Mask an API key for security
 *
 * @param {string} apiKey - The API key to mask
 * @returns {string} - The masked API key
 */
function maskApiKey(apiKey) {
  if (!apiKey) return "";

  // Show first 4 and last 4 characters, mask the rest
  if (apiKey.length <= 8) {
    return "*".repeat(apiKey.length);
  }

  const firstFour = apiKey.substring(0, 4);
  const lastFour = apiKey.substring(apiKey.length - 4);
  const middle = "*".repeat(Math.min(apiKey.length - 8, 10));

  return `${firstFour}${middle}${lastFour}`;
}

export default router;
