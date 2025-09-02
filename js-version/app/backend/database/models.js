import { DataTypes, Model } from "sequelize";
import sequelize from "./connection.js";

// HedgeFundFlow model
class HedgeFundFlow extends Model {}
HedgeFundFlow.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    nodes: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    edges: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    viewport: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    is_template: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "hedge_fund_flow",
    tableName: "hedge_fund_flows",
    timestamps: false,
  }
);

// HedgeFundFlowRun model
class HedgeFundFlowRun extends Model {}
HedgeFundFlowRun.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    flow_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: HedgeFundFlow,
        key: "id",
      },
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "IDLE",
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    trading_mode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "one-time",
    },
    schedule: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    duration: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    request_data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    initial_portfolio: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    final_portfolio: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    results: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    run_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
  },
  {
    sequelize,
    modelName: "hedge_fund_flow_run",
    tableName: "hedge_fund_flow_runs",
    timestamps: false,
  }
);

// HedgeFundFlowRunCycle model
class HedgeFundFlowRunCycle extends Model {}
HedgeFundFlowRunCycle.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    flow_run_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: HedgeFundFlowRun,
        key: "id",
      },
    },
    cycle_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    analyst_signals: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    trading_decisions: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    executed_trades: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    portfolio_snapshot: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    performance_metrics: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "IN_PROGRESS",
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    llm_calls_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    api_calls_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    estimated_cost: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    trigger_reason: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    market_conditions: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "hedge_fund_flow_run_cycle",
    tableName: "hedge_fund_flow_run_cycles",
    timestamps: false,
  }
);

// ApiKey model
class ApiKey extends Model {}
ApiKey.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    service: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    api_key: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "api_key",
    tableName: "api_keys",
    timestamps: false,
  }
);

// Define relationships
HedgeFundFlow.hasMany(HedgeFundFlowRun, { foreignKey: "flow_id" });
HedgeFundFlowRun.belongsTo(HedgeFundFlow, { foreignKey: "flow_id" });

HedgeFundFlowRun.hasMany(HedgeFundFlowRunCycle, { foreignKey: "flow_run_id" });
HedgeFundFlowRunCycle.belongsTo(HedgeFundFlowRun, {
  foreignKey: "flow_run_id",
});

// Function to sync all models with the database
export async function syncModels() {
  try {
    await sequelize.sync();
    console.log("All models were synchronized successfully.");
    return true;
  } catch (error) {
    console.error("Error synchronizing models:", error);
    return false;
  }
}

export { HedgeFundFlow, HedgeFundFlowRun, HedgeFundFlowRunCycle, ApiKey };
