/**
 * Upload blog image to server
 * POST /api/blogs/upload-image
 * 
 * Request:
 * - multipart/form-data
 * - Field 'image': Image file (JPEG, PNG, GIF, or WebP)
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     imageUrl: string
 *   }
 * }
 */
export async function uploadBlogImage(req, res, next) {
  try {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Image file is required',
        details: 'Please provide an image file in the "image" field'
      });
    }

    // Construct the image URL
    // The file is stored in uploads/blog-images/ and will be served via static middleware
    const imageUrl = `/uploads/blog-images/${req.file.filename}`;

    console.log('Blog image uploaded successfully:', req.file.filename);
    console.log('Image URL:', imageUrl);

    res.status(200).json({
      success: true,
      data: {
        imageUrl: imageUrl
      }
    });
  } catch (error) {
    console.error('Unexpected error in uploadBlogImage:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

