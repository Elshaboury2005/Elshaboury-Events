const pool = require('../config/database');

const WorkshopMember = {
  /**
   * Add a member to a category. Throws on duplicate (category_id + email).
   */
  addMember: async (categoryId, email, role) => {
    const [result] = await pool.execute(
      `INSERT INTO workshop_members (category_id, email, role) VALUES (?, ?, ?)`,
      [categoryId, email.toLowerCase().trim(), role]
    );
    return { id: result.insertId, category_id: categoryId, email, role };
  },

  /**
   * All members in a single category, ordered head → vice_head → member.
   */
  findByCategoryId: async (categoryId) => {
    const [rows] = await pool.execute(
      `SELECT * FROM workshop_members
       WHERE category_id = ?
       ORDER BY FIELD(role,'head','vice_head','member'), created_at ASC`,
      [categoryId]
    );
    return rows;
  },

  /**
   * Find a member by email within a specific workshop (used at login).
   * Joins workshop_categories to resolve the workshop scope.
   */
  findByWorkshopAndEmail: async (workshopId, email) => {
    const [rows] = await pool.execute(
      `SELECT wm.id, wm.category_id, wm.email, wm.role,
              wc.category_name, wc.workshop_id
       FROM workshop_members wm
       JOIN workshop_categories wc ON wc.id = wm.category_id
       WHERE wc.workshop_id = ? AND LOWER(wm.email) = LOWER(?)
       LIMIT 1`,
      [workshopId, email.trim()]
    );
    return rows[0] || null;
  },

  /**
   * Check whether a vice-head already exists for a category.
   */
  existsViceHead: async (categoryId) => {
    const [rows] = await pool.execute(
      `SELECT id FROM workshop_members WHERE category_id = ? AND role = 'vice_head' LIMIT 1`,
      [categoryId]
    );
    return rows.length > 0;
  },

  /**
   * Check whether an email is already a member of the given category.
   */
  emailExistsInCategory: async (categoryId, email) => {
    const [rows] = await pool.execute(
      `SELECT id FROM workshop_members
       WHERE category_id = ? AND LOWER(email) = LOWER(?) LIMIT 1`,
      [categoryId, email.trim()]
    );
    return rows.length > 0;
  },

  /**
   * Fetch all members across all categories of a workshop (for organizer view).
   * Returns rows with category_name attached.
   */
  findAllByWorkshopId: async (workshopId) => {
    const [rows] = await pool.execute(
      `SELECT wm.id, wm.category_id, wm.email, wm.role, wm.created_at,
              wc.category_name
       FROM workshop_members wm
       JOIN workshop_categories wc ON wc.id = wm.category_id
       WHERE wc.workshop_id = ?
       ORDER BY wc.id ASC, FIELD(wm.role,'head','vice_head','member'), wm.created_at ASC`,
      [workshopId]
    );
    return rows;
  }
};

module.exports = WorkshopMember;
