/**
 * Routes for managing hedge fund flow runs
 */
const express = require("express");
const router = express.Router({ mergeParams: true }); // To access flow_id from parent router
const { FlowRunRepository } = require("../repositories/flow_run_repository");
const { FlowRepository } = require("../repositories/flow_repository");
const { getDB } = require("../database/connection");

/**
 * Create a new flow run for the specified flow
 */
router.post("/", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const db = await getDB();

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Create the flow run
    const runRepo = new FlowRunRepository(db);
    const flowRun = await runRepo.createFlowRun(flowId, req.body.request_data);

    res.status(201).json(flowRun);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to create flow run: ${error.message}` });
  }
});

/**
 * Get all runs for the specified flow
 */
router.get("/", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const limit = parseInt(req.query.limit || "50");
    const offset = parseInt(req.query.offset || "0");
    const db = await getDB();

    // Validate limit
    if (limit < 1 || limit > 100) {
      return res
        .status(400)
        .json({ detail: "Limit must be between 1 and 100" });
    }

    // Validate offset
    if (offset < 0) {
      return res.status(400).json({ detail: "Offset must be >= 0" });
    }

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Get flow runs
    const runRepo = new FlowRunRepository(db);
    const flowRuns = await runRepo.getFlowRunsByFlowId(flowId, limit, offset);

    res.json(flowRuns);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to retrieve flow runs: ${error.message}` });
  }
});

/**
 * Get the current active (IN_PROGRESS) run for the specified flow
 */
router.get("/active", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const db = await getDB();

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Get active flow run
    const runRepo = new FlowRunRepository(db);
    const activeRun = await runRepo.getActiveFlowRun(flowId);

    res.json(activeRun || null);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to retrieve active flow run: ${error.message}` });
  }
});

/**
 * Get the most recent run for the specified flow
 */
router.get("/latest", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const db = await getDB();

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Get latest flow run
    const runRepo = new FlowRunRepository(db);
    const latestRun = await runRepo.getLatestFlowRun(flowId);

    res.json(latestRun || null);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to retrieve latest flow run: ${error.message}` });
  }
});

/**
 * Get a specific flow run by ID
 */
router.get("/:run_id", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const runId = parseInt(req.params.run_id);
    const db = await getDB();

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Get flow run
    const runRepo = new FlowRunRepository(db);
    const flowRun = await runRepo.getFlowRunById(runId);

    if (!flowRun || flowRun.flow_id !== flowId) {
      return res.status(404).json({ detail: "Flow run not found" });
    }

    res.json(flowRun);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to retrieve flow run: ${error.message}` });
  }
});

/**
 * Update an existing flow run
 */
router.put("/:run_id", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const runId = parseInt(req.params.run_id);
    const db = await getDB();

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Update flow run
    const runRepo = new FlowRunRepository(db);

    // First verify the run exists and belongs to this flow
    const existingRun = await runRepo.getFlowRunById(runId);

    if (!existingRun || existingRun.flow_id !== flowId) {
      return res.status(404).json({ detail: "Flow run not found" });
    }

    const flowRun = await runRepo.updateFlowRun(
      runId,
      req.body.status,
      req.body.results,
      req.body.error_message
    );

    if (!flowRun) {
      return res.status(404).json({ detail: "Flow run not found" });
    }

    res.json(flowRun);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to update flow run: ${error.message}` });
  }
});

/**
 * Delete a flow run
 */
router.delete("/:run_id", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const runId = parseInt(req.params.run_id);
    const db = await getDB();

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Verify run exists and belongs to this flow
    const runRepo = new FlowRunRepository(db);
    const existingRun = await runRepo.getFlowRunById(runId);

    if (!existingRun || existingRun.flow_id !== flowId) {
      return res.status(404).json({ detail: "Flow run not found" });
    }

    const success = await runRepo.deleteFlowRun(runId);

    if (!success) {
      return res.status(404).json({ detail: "Flow run not found" });
    }

    res.status(204).json({ message: "Flow run deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to delete flow run: ${error.message}` });
  }
});

/**
 * Delete all runs for the specified flow
 */
router.delete("/", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const db = await getDB();

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Delete all flow runs
    const runRepo = new FlowRunRepository(db);
    const deletedCount = await runRepo.deleteFlowRunsByFlowId(flowId);

    res.json({ message: `Deleted ${deletedCount} flow runs successfully` });
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to delete flow runs: ${error.message}` });
  }
});

/**
 * Get the total count of runs for the specified flow
 */
router.get("/count", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flow_id);
    const db = await getDB();

    // Verify flow exists
    const flowRepo = new FlowRepository(db);
    const flow = await flowRepo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    // Get run count
    const runRepo = new FlowRunRepository(db);
    const count = await runRepo.getFlowRunCount(flowId);

    res.json({ flow_id: flowId, total_runs: count });
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to get flow run count: ${error.message}` });
  }
});

module.exports = router;
