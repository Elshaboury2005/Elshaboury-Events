const Notebook = require('../models/Notebook');

exports.getMyNotebooks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notebooks = await Notebook.findByUserId(userId);
    res.json({ success: true, data: { notebooks } });
  } catch (error) {
    console.error('Get my notebooks error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve notebooks' });
  }
};

exports.getNotebookById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const notebook = await Notebook.findByIdAndUser(id, userId);
    if (!notebook) {
      return res.status(404).json({ success: false, error: 'Notebook not found' });
    }
    res.json({ success: true, data: { notebook } });
  } catch (error) {
    console.error('Get notebook by id error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve notebook' });
  }
};

exports.createNotebook = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, description, payload } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Notebook name is required' });
    }
    const notebook = await Notebook.create(userId, String(name).trim(), description ? String(description).trim() : null, payload || null);
    res.status(201).json({ success: true, data: { notebook, message: 'Notebook created successfully' } });
  } catch (error) {
    console.error('Create notebook error:', error);
    res.status(500).json({ success: false, error: 'Failed to create notebook' });
  }
};

exports.useNotebook = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const updated = await Notebook.updateLastUsed(id, userId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notebook not found' });
    }
    res.json({ success: true, data: { message: 'Notebook usage updated' } });
  } catch (error) {
    console.error('Use notebook error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notebook usage' });
  }
};

exports.deleteNotebook = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const deleted = await Notebook.delete(id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Notebook not found' });
    }
    res.json({ success: true, data: { message: 'Notebook deleted successfully' } });
  } catch (error) {
    console.error('Delete notebook error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete notebook' });
  }
};

exports.updateNotebook = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Notebook name is required' });
    }
    const updated = await Notebook.updateIdentity(id, userId, String(name).trim(), description ? String(description).trim() : null);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notebook not found' });
    }
    res.json({ success: true, data: { message: 'Notebook updated successfully' } });
  } catch (error) {
    console.error('Update notebook error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notebook' });
  }
};

exports.duplicateNotebook = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const cloned = await Notebook.duplicate(id, userId);
    if (!cloned) {
      return res.status(404).json({ success: false, error: 'Notebook not found' });
    }
    res.status(201).json({ success: true, data: { notebook: cloned, message: 'Notebook duplicated successfully' } });
  } catch (error) {
    console.error('Duplicate notebook error:', error);
    res.status(500).json({ success: false, error: 'Failed to duplicate notebook' });
  }
};
