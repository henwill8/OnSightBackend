const express = require('express');
const multer = require('multer');
const pool = require('@/src/db');
const { verifyAccessToken } = require('@/src/routes/auth');
const { s3Client } = require('@/src/aws');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { S3_CONFIG } = require('@/config');
const path = require('path');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Generates the full image url based off the s3 bucket key
function getRouteImageUrl(req, imageKey) {
  return `${req.protocol}://${req.get('host')}/api/s3Assets/${imageKey}`;
}

router.post('/create-route', verifyAccessToken, upload.single('image'), async (req, res) => {
  console.log('Received request to create a route');
  
  const { name, description, difficulty, gym_id } = req.body;
  const image = req.file;

  if (!difficulty || !gym_id || !image) {
    console.log('Missing required fields or image file');
    return res.status(400).json({ error: 'Missing required fields or image file' });
  }

  console.log(`Received image of size: ${image.size} bytes`);

  try {
    const extension = path.extname(image.originalname);
    const routeImageKey = path.posix.join(gym_id, S3_CONFIG.routeImagesPath, `route-${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`);

    // Upload image to S3
    const s3Params = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: routeImageKey,
      Body: image.buffer,  // Buffer from multer memory storage
      ContentType: image.mimetype,
    });

    const s3Response = await s3Client.send(s3Params);

    console.log('File uploaded to S3:', s3Response);

    // Save route info to the database
    const result = await pool.query(
      'INSERT INTO routes (name, description, difficulty, gym_id, creator, image_key, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *',
      [name || null, description || null, difficulty, gym_id, req.userId, routeImageKey]
    );

    console.log('Route created successfully:', result.rows[0]);
    res.status(201).json({ message: 'Route created successfully', route: result.rows[0] });
  } catch (error) {
    console.error('Error creating route:', error);
    res.status(500).json({ error: 'Error creating route' });
  }
});


// Route for fetching route images
router.get('/get-routes/:gymId', async (req, res) => {
  const { gymId } = req.params;

  console.log(`Fetching routes for gym ID: ${gymId}`);

  try {
    const result = await pool.query(
      'SELECT * FROM routes WHERE gym_id = $1 ORDER BY ' +
      'CASE ' +
      '  WHEN difficulty ~ \'[0-9]\' THEN CAST(REGEXP_REPLACE(difficulty, \'[^0-9]\', \'\', \'g\') AS INTEGER) ' + // Sort routes by difficulty (as integer) probably do this differently in the future
      '  ELSE 0 ' + 
      'END',
      [gymId]
    );

    const routes = result.rows.map(route => ({
      ...route,
      image_url: getRouteImageUrl(req, route.image_key)
    }));

    console.log(`Found ${routes.length} routes for gym ID ${gymId}`);
    res.status(200).json(routes);
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ error: 'Error fetching routes' });
  }
});


// TODO: make deleting orphaned images work for s3 buckets

// // Function to delete orphan images
// const deleteOrphanImages = async () => {
//   console.log('Checking for orphan images...');

//   try {
//     // Get list of image URLs from the database
//     const result = await pool.query('SELECT image_url FROM routes');
//     const imageUrls = result.rows.map(row => row.image_url); // Full URLs in DB

//     // List all objects in the S3 bucket
//     const listParams = new ListObjectsV2Command({
//       Bucket: process.env.AWS_BUCKET_NAME,
//       Prefix: 'routeImages/',  // Path to the images in the bucket
//     });

//     const s3ListResponse = await s3Client.send(listParams);
//     const s3Files = s3ListResponse.Contents.map(file => file.Key);

//     // Find orphan files in S3 that aren't in the database
//     const orphanImages = s3Files.filter(file => !imageUrls.includes(`https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${file}`));

//     // Delete orphan images from S3
//     for (const image of orphanImages) {
//       const deleteParams = new DeleteObjectCommand({
//         Bucket: process.env.AWS_BUCKET_NAME,
//         Key: image,
//       });
//       await s3Client.send(deleteParams);
//       console.log(`Deleted orphan image from S3: ${image}`);
//     }

//     console.log('Orphan images cleanup completed');
//   } catch (error) {
//     console.error('Error deleting orphan images:', error);
//   }
// };

// // Run cleanup images task every 24 hours
// setInterval(deleteOrphanImages, 86400000);

module.exports = router;
