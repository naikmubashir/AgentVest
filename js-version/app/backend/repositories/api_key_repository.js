import { ApiKey } from "../database/models.js";

/**
 * Repository class for API key operations
 */
class ApiKeyRepository {
  /**
   * Create a new API key
   *
   * @param {Object} apiKeyData - The API key data
   * @returns {Promise<Object>} - The created API key
   */
  async create(apiKeyData) {
    try {
      const apiKey = await ApiKey.create(apiKeyData);
      return apiKey;
    } catch (error) {
      console.error("Error creating API key:", error);
      throw error;
    }
  }

  /**
   * Get all API keys
   *
   * @returns {Promise<Array>} - List of all API keys
   */
  async getAll() {
    try {
      const apiKeys = await ApiKey.findAll({
        order: [["created_at", "DESC"]],
      });
      return apiKeys;
    } catch (error) {
      console.error("Error fetching API keys:", error);
      throw error;
    }
  }

  /**
   * Get API keys by service
   *
   * @param {string} service - The service name
   * @returns {Promise<Array>} - List of API keys for the service
   */
  async getByService(service) {
    try {
      const apiKeys = await ApiKey.findAll({
        where: { service },
        order: [["created_at", "DESC"]],
      });
      return apiKeys;
    } catch (error) {
      console.error(`Error fetching API keys for service ${service}:`, error);
      throw error;
    }
  }

  /**
   * Get active API key by service
   *
   * @param {string} service - The service name
   * @returns {Promise<Object|null>} - The active API key or null if not found
   */
  async getActiveByService(service) {
    try {
      const apiKey = await ApiKey.findOne({
        where: {
          service,
          is_active: true,
        },
      });
      return apiKey;
    } catch (error) {
      console.error(
        `Error fetching active API key for service ${service}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get API key by ID
   *
   * @param {number} id - The API key ID
   * @returns {Promise<Object|null>} - The API key or null if not found
   */
  async getById(id) {
    try {
      const apiKey = await ApiKey.findByPk(id);
      return apiKey;
    } catch (error) {
      console.error(`Error fetching API key with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update an API key
   *
   * @param {number} id - The API key ID
   * @param {Object} apiKeyData - The updated API key data
   * @returns {Promise<[number, Array]>} - The update result
   */
  async update(id, apiKeyData) {
    try {
      const [updatedRows] = await ApiKey.update(apiKeyData, {
        where: { id },
      });

      if (updatedRows === 0) {
        throw new Error(`API key with ID ${id} not found`);
      }

      return await this.getById(id);
    } catch (error) {
      console.error(`Error updating API key with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete an API key
   *
   * @param {number} id - The API key ID
   * @returns {Promise<number>} - The number of deleted rows
   */
  async delete(id) {
    try {
      const deletedRows = await ApiKey.destroy({
        where: { id },
      });

      if (deletedRows === 0) {
        throw new Error(`API key with ID ${id} not found`);
      }

      return deletedRows;
    } catch (error) {
      console.error(`Error deleting API key with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Set an API key as active and deactivate others for the same service
   *
   * @param {number} id - The API key ID to set as active
   * @returns {Promise<Object>} - The updated API key
   */
  async setActive(id) {
    try {
      const apiKey = await this.getById(id);

      if (!apiKey) {
        throw new Error(`API key with ID ${id} not found`);
      }

      // Deactivate all API keys for the same service
      await ApiKey.update(
        { is_active: false },
        { where: { service: apiKey.service } }
      );

      // Set the target API key as active
      await apiKey.update({ is_active: true });

      return await this.getById(id);
    } catch (error) {
      console.error(`Error setting API key ${id} as active:`, error);
      throw error;
    }
  }
}

// Export a singleton instance
export default new ApiKeyRepository();
