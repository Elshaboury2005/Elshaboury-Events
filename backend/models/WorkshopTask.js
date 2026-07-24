const pool = require('../config/database');

const WorkshopTask = {
  create: async ({ categoryId, title, description, assignedTo, createdBy, dueDate, priority }) => {
    const [result] = await pool.execute(
      `INSERT INTO workshop_tasks (category_id, title, description, assigned_to, created_by, due_date, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [categoryId, title, description || null, assignedTo || null, createdBy, dueDate || null, priority || 'medium']
    );
    return result.insertId;
  },

  findByCategoryId: async (categoryId) => {
    const [rows] = await pool.execute(
      `SELECT t.*, 
              m_assign.email AS assignee_email, m_assign.role AS assignee_role,
              m_creator.email AS creator_email, m_creator.role AS creator_role
       FROM workshop_tasks t
       LEFT JOIN workshop_members m_assign ON t.assigned_to = m_assign.id
       LEFT JOIN workshop_members m_creator ON t.created_by = m_creator.id
       WHERE t.category_id = ?
       ORDER BY t.created_at DESC`,
      [categoryId]
    );
    return rows;
  },

  findById: async (id) => {
    const [rows] = await pool.execute(
      `SELECT t.*, 
              m_assign.email AS assignee_email, m_assign.role AS assignee_role,
              m_creator.email AS creator_email, m_creator.role AS creator_role
       FROM workshop_tasks t
       LEFT JOIN workshop_members m_assign ON t.assigned_to = m_assign.id
       LEFT JOIN workshop_members m_creator ON t.created_by = m_creator.id
       WHERE t.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  updateStatus: async (id, status) => {
    await pool.execute(
      `UPDATE workshop_tasks SET status = ? WHERE id = ?`,
      [status, id]
    );
  },

  updateDetails: async (id, { title, description, assignedTo, dueDate, priority }) => {
    await pool.execute(
      `UPDATE workshop_tasks 
       SET title = ?, description = ?, assigned_to = ?, due_date = ?, priority = ?
       WHERE id = ?`,
      [title, description || null, assignedTo || null, dueDate || null, priority || 'medium', id]
    );
  },

  delete: async (id) => {
    await pool.execute(
      `DELETE FROM workshop_tasks WHERE id = ?`,
      [id]
    );
  }
};

module.exports = WorkshopTask;
