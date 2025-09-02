import express from "express";
import healthRoutes from "./health.js";
import apiKeysRoutes from "./api_keys.js";
import flowsRoutes from "./flows.js";
import flowRunsRoutes from "./flow_runs.js";
import languageModelsRoutes from "./language_models.js";
import ollamaRoutes from "./ollama.js";
import storageRoutes from "./storage.js";
import hedgeFundRoutes from "./hedge_fund.js";

const router = express.Router();

// Include all route modules
router.use("/health", healthRoutes);
router.use("/api-keys", apiKeysRoutes);
router.use("/flows", flowsRoutes);
router.use("/flow-runs", flowRunsRoutes);
router.use("/language-models", languageModelsRoutes);
router.use("/ollama", ollamaRoutes);
router.use("/storage", storageRoutes);
router.use("/hedge-fund", hedgeFundRoutes);

export default router;
