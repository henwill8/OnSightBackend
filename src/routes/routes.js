const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require('@/src/db');
const { verifyAccessToken } = require('@/src/routes/auth')
const { STORAGE_PATH } = require('@/config');

const router = express.Router();

console.log(`Using storage path: ${STORAGE_PATH}/routeImages`);

// Setup multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const storagePath = path.join(STORAGE_PATH, "routeImages");
    console.log(`Saving file to: ${storagePath}`);

    // Ensure the directory exists
    fs.mkdirSync(storagePath, { recursive: true });

    cb(null, storagePath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    console.log(`Generated filename: ${filename}`);
    cb(null, filename);
  },
});

const upload = multer({ storage: storage });

router.post('/create-route', verifyAccessToken, upload.single('image'), async (req, res) => {
  console.log('Received request to create a route');
  
  const { name, description, difficulty, gym_id } = req.body;
  const image = req.file;

  if (!difficulty || !gym_id || !image) {
    console.log('Missing required fields or image file');
    return res.status(400).json({ error: 'Missing required fields or image file' });
  }

  console.log(`Image name: ${image.filename}`);

  try {
    const result = await pool.query(
      'INSERT INTO routes (name, description, difficulty, gym_id, creator, image_url, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *',
      [name || null, description || null, difficulty, gym_id, req.userId, image.filename] // Include userId in the query
    );

    console.log('Route created successfully:', result.rows[0]);
    res.status(201).json({ message: 'Route created successfully', route: result.rows[0] });
  } catch (error) {
    console.error('Error creating route:', error);
    res.status(500).json({ error: 'Error creating route' });
  }
});

// Serve static files from routeImages
router.use('/routeImages', express.static(path.join(STORAGE_PATH, 'routeImages')));

router.get('/get-routes/:gymId', async (req, res) => {
  const { gymId } = req.params;

  console.log(`Fetching routes for gym ID: ${gymId}`);

  try {
    const result = await pool.query(
      'SELECT * FROM routes WHERE gym_id = $1 ORDER BY ' +
      'CASE ' +
      '  WHEN difficulty ~ \'[0-9]\' THEN CAST(REGEXP_REPLACE(difficulty, \'[^0-9]\', \'\', \'g\') AS INTEGER) ' + 
      '  ELSE 0 ' + 
      'END',
      [gymId]
    );

    const routes = result.rows.map(route => ({
      ...route,
      image_url: `${req.protocol}://${req.get('host')}/api/routeImages/${route.image_url}` // Generate full URL for client
    }));

    console.log(`Found ${routes.length} routes for gym ID ${gymId}`);
    res.status(200).json(routes);
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ error: 'Error fetching routes' });
  }
});

// Function to delete orphan images in storage
const deleteOrphanImages = async () => {
  console.log('Checking for orphan images...');

  try {
    // Get list of image filenames from the database
    const result = await pool.query('SELECT image_url FROM routes');
    const imageUrls = result.rows.map(row => row.image_url.split('/').pop()); // Get filenames only

    // Get list of all files in the storage directory
    const storagePath = path.join(STORAGE_PATH, 'routeImages');
    const filesInStorage = fs.readdirSync(storagePath);

    // Find images in storage that aren't in the database
    const orphanImages = filesInStorage.filter(file => !imageUrls.includes(file));

    // Delete orphan images
    orphanImages.forEach((image) => {
      const imagePath = path.join(storagePath, image);
      fs.unlinkSync(imagePath);
      console.log(`Deleted orphan image: ${image}`);
    });

    console.log('Orphan images cleanup completed');
  } catch (error) {
    console.error('Error deleting orphan images:', error);
  }
};

// Run cleanup images task every 24 hours
setInterval(deleteOrphanImages, 86400000);

module.exports = router;
