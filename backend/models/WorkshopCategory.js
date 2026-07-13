const pool = require('../config/database');

const WorkshopCategory = {
  /**
   * Insert a new category row for the given workshop.
   */
  create: async (workshopId, categoryName) => {
    const [result] = await pool.execute(
      `INSERT INTO workshop_categories (workshop_id, category_name) VALUES (?, ?)`,
      [workshopId, categoryName]
    );
    return { id: result.insertId, workshop_id: workshopId, category_name: categoryName };
  },

  /**
   * All categories that belong to a workshop.
   */
  findByWorkshopId: async (workshopId) => {
    const [rows] = await pool.execute(
      `SELECT * FROM workshop_categories WHERE workshop_id = ? ORDER BY id ASC`,
      [workshopId]
    );
    return rows;
  },

  /**
   * Find a single category by its primary key.
   */
  findById: async (categoryId) => {
    const [rows] = await pool.execute(
      `SELECT * FROM workshop_categories WHERE id = ? LIMIT 1`,
      [categoryId]
    );
    return rows[0] || null;
  },

  /**
   * Verify that a category belongs to a specific workshop (ownership check).
   */
  belongsToWorkshop: async (categoryId, workshopId) => {
    const [rows] = await pool.execute(
      `SELECT id FROM workshop_categories WHERE id = ? AND workshop_id = ? LIMIT 1`,
      [categoryId, workshopId]
    );
    return rows.length > 0;
  }
};

module.exports = WorkshopCategory;
