import fs from 'fs';
import path from 'path';

/**
 * Validate upload request
 */
function validateUploadRequest(req) {
  const errors = [];

  // Check if file exists
  if (!req.file) {
    errors.push('PDF file is required');
  }

  // Check if userId is provided
  if (!req.body.userId || req.body.userId.trim() === '') {
    errors.push('User ID is required');
  }

  // Check if serviceId is provided
  if (!req.body.serviceId || req.body.serviceId.trim() === '') {
    errors.push('Service ID is required');
  }

  // Validate userId format (Firebase UID format)
  if (req.body.userId && !/^[a-zA-Z0-9]{20,}$/.test(req.body.userId)) {
    errors.push('Invalid user ID format');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Upload agreement PDF to server (disk storage)
 * POST /api/agreements/upload
 * 
 * Request:
 * - multipart/form-data
 * - Field 'pdf': PDF file
 * - Field 'userId': User ID (Firebase UID)
 * - Field 'serviceId': Service ID
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     viewUrl: string,
 *     downloadUrl: string,
 *     fileName: string
 *   }
 * }
 */
export async function uploadAgreement(req, res, next) {
  try {
    // Validate request
    const validation = validateUploadRequest(req);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const { userId, serviceId } = req.body;
    const file = req.file;

    // File is already saved to disk by Multer middleware
    const fileName = file.filename;
    const filePath = `/uploads/agreements/${fileName}`;

    console.log('Agreement uploaded successfully:', fileName);
    console.log('User ID:', userId, 'Service ID:', serviceId);
    console.log('File size:', file.size, 'bytes');

    // Return server URL (frontend will construct full URL using apiUrl)
    res.status(200).json({
      success: true,
      data: {
        viewUrl: filePath,
        downloadUrl: filePath,
        fileName: fileName
      }
    });

  } catch (error) {
    console.error('Unexpected error in uploadAgreement:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Delete agreement PDF from server
 * DELETE /api/agreements/:fileName
 */
export async function deleteAgreement(req, res, next) {
  try {
    const { fileName } = req.params;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'File name is required'
      });
    }

    const filePath = path.join(process.cwd(), 'uploads', 'agreements', fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Delete file
    fs.unlinkSync(filePath);

    console.log('File deleted successfully:', fileName);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      details: error.message
    });
  }
}

/**
 * Get agreement URL
 * GET /api/agreements/:fileName/url
 */
export async function getAgreementUrl(req, res, next) {
  try {
    const { fileName } = req.params;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'File name is required'
      });
    }

    const filePath = path.join(process.cwd(), 'uploads', 'agreements', fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Return server URL (frontend will construct full URL using apiUrl)
    const serverPath = `/uploads/agreements/${fileName}`;

    res.status(200).json({
      success: true,
      data: {
        viewUrl: serverPath,
        downloadUrl: serverPath,
        fileName: fileName
      }
    });

  } catch (error) {
    console.error('Error getting file URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file URL',
      details: error.message
    });
  }
}

