const fs = require('fs');
const path = require('path');
const WorkshopFile = require('../models/WorkshopFile');
const logWorkshopActivity = require('../utils/logWorkshopActivity');
const { notifyCategory } = require('../utils/createWorkshopNotification');

exports.getFiles = async (req, res) => {
  try {
    const { categoryId } = req.workshopMember;
    const files = await WorkshopFile.findByCategoryId(categoryId);
    return res.json({ success: true, files });
  } catch (error) {
    console.error('getFiles error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching files list' });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, email } = req.workshopMember;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file was uploaded or file type is blocked' });
    }

    const fileName = req.file.originalname;
    const filePath = `/uploads/workshop-files/${req.file.filename}`;
    const fileSize = req.file.size;
    const fileType = req.file.mimetype;

    const fileId = await WorkshopFile.create({
      categoryId,
      uploadedBy: workshopMemberId,
      fileName,
      filePath,
      fileSize,
      fileType
    });

    // Notify other category members
    await notifyCategory(
      categoryId,
      `New file uploaded: "${fileName}"`,
      workshopMemberId,
      '/html/workshop/workshop-files.html'
    );

    await logWorkshopActivity(categoryId, workshopMemberId, 'file_uploaded', `${email} uploaded file "${fileName}"`);

    return res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        id: fileId,
        fileName,
        filePath,
        fileSize,
        fileType
      }
    });
  } catch (error) {
    console.error('uploadFile error:', error);
    return res.status(500).json({ success: false, message: 'Server error uploading file' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { categoryId, workshopMemberId, role, email } = req.workshopMember;
    const fileId = parseInt(req.params.id, 10);

    const file = await WorkshopFile.findById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (file.category_id !== categoryId) {
      return res.status(403).json({ success: false, message: 'Unauthorized category access' });
    }

    // Permission: uploader or head/vice_head
    const isUploader = file.uploaded_by === workshopMemberId;
    const isLead = role === 'head' || role === 'vice_head';

    if (!isUploader && !isLead) {
      return res.status(403).json({ success: false, message: 'Only the uploader or category leads can delete this file' });
    }

    // Delete database row
    await WorkshopFile.delete(fileId);

    // Delete physical file
    const physicalPath = path.join(__dirname, '../../frontend', file.file_path);
    fs.unlink(physicalPath, (err) => {
      if (err) {
        console.error(`Failed to delete physical file at ${physicalPath}:`, err.message);
      }
    });

    await logWorkshopActivity(categoryId, workshopMemberId, 'file_deleted', `${email} deleted file "${file.file_name}"`);

    return res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('deleteFile error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting file' });
  }
};
