/**
 * Routes for managing hedge fund flows
 */
const express = require("express");
const router = express.Router();
const { FlowRepository } = require("../repositories/flow_repository");
const { getDB } = require("../database/connection");

/**
 * Create a new hedge fund flow
 */
router.post("/", async (req, res) => {
  try {
    const db = await getDB();
    const repo = new FlowRepository(db);

    const flow = await repo.createFlow(
      req.body.name,
      req.body.description,
      req.body.nodes,
      req.body.edges,
      req.body.viewport,
      req.body.data,
      req.body.is_template,
      req.body.tags
    );

    res.status(201).json(flow);
  } catch (error) {
    res.status(500).json({ detail: `Failed to create flow: ${error.message}` });
  }
});

/**
 * Get all flows (summary view)
 */
router.get("/", async (req, res) => {
  try {
    const includeTemplates = req.query.include_templates !== "false";
    const db = await getDB();
    const repo = new FlowRepository(db);

    const flows = await repo.getAllFlows(includeTemplates);
    res.json(flows);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to retrieve flows: ${error.message}` });
  }
});

/**
 * Get a specific flow by ID
 */
router.get("/:flowId", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flowId);
    const db = await getDB();
    const repo = new FlowRepository(db);

    const flow = await repo.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    res.json(flow);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to retrieve flow: ${error.message}` });
  }
});

/**
 * Update an existing flow
 */
router.put("/:flowId", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flowId);
    const db = await getDB();
    const repo = new FlowRepository(db);

    const flow = await repo.updateFlow(
      flowId,
      req.body.name,
      req.body.description,
      req.body.nodes,
      req.body.edges,
      req.body.viewport,
      req.body.data,
      req.body.is_template,
      req.body.tags
    );

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    res.json(flow);
  } catch (error) {
    res.status(500).json({ detail: `Failed to update flow: ${error.message}` });
  }
});

/**
 * Delete a flow
 */
router.delete("/:flowId", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flowId);
    const db = await getDB();
    const repo = new FlowRepository(db);

    const success = await repo.deleteFlow(flowId);

    if (!success) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    res.status(204).json({ message: "Flow deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: `Failed to delete flow: ${error.message}` });
  }
});

/**
 * Create a copy of an existing flow
 */
router.post("/:flowId/duplicate", async (req, res) => {
  try {
    const flowId = parseInt(req.params.flowId);
    const newName = req.query.new_name || null;
    const db = await getDB();
    const repo = new FlowRepository(db);

    const flow = await repo.duplicateFlow(flowId, newName);

    if (!flow) {
      return res.status(404).json({ detail: "Flow not found" });
    }

    res.json(flow);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to duplicate flow: ${error.message}` });
  }
});

/**
 * Search flows by name
 */
router.get("/search/:name", async (req, res) => {
  try {
    const name = req.params.name;
    const db = await getDB();
    const repo = new FlowRepository(db);

    const flows = await repo.getFlowsByName(name);
    res.json(flows);
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Failed to search flows: ${error.message}` });
  }
});

module.exports = router;
