const pool = require('../config/database');

const WorkshopFile = {
  create: async ({ categoryId, uploadedBy, fileName, filePath, fileSize = null, fileType = null }) => {
    const [result] = await pool.execute(
      `INSERT INTO workshop_files (category_id, uploaded_by, file_name, file_path, file_size_bytes, file_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [categoryId, uploadedBy, fileName, filePath, fileSize, fileType]
    );
    return result.insertId;
  },

  findByCategoryId: async (categoryId) => {
    const [rows] = await pool.execute(
      `SELECT f.*, m.email AS uploader_email, m.role AS uploader_role
       FROM workshop_files f
       JOIN workshop_members m ON f.uploaded_by = m.id
       WHERE f.category_id = ?
       ORDER BY f.uploaded_at DESC`,
      [categoryId]
    );
    return rows;
  },

  findById: async (id) => {
    const [rows] = await pool.execute(
      `SELECT * FROM workshop_files WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  delete: async (id) => {
    await pool.execute(
      `DELETE FROM workshop_files WHERE id = ?`,
      [id]
    );
  }
};

module.exports = WorkshopFile;
