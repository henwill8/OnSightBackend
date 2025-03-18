const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require('@/src/db');
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

router.post('/create-route', upload.single('image'), async (req, res) => {
  console.log('Received request to create a route');
  console.log('Request body:', req.body);
  
  const { name, description, difficulty, gym_id } = req.body;
  const image = req.file;

  console.log(image)

  if (!difficulty || !gym_id || !image) {
    console.log('Missing required fields or image file');
    return res.status(400).json({ error: 'Missing required fields or image file' });
  }

  const imagePath = STORAGE_PATH + `/routeImages/${image.filename}`;
  console.log(`Image path: ${imagePath}`);

  try {
    console.log(`Inserting route into database with data:`, {
      name,
      description,
      difficulty,
      gym_id,
      imagePath
    });

    const result = await pool.query(
      'INSERT INTO routes (name, description, difficulty, gym_id, image_url, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *',
      [
        name || null,
        description || null,
        difficulty,
        gym_id,
        imagePath
      ]
    );

    console.log('Route created successfully:', result.rows[0]);
    res.status(201).json({ message: 'Route created successfully', route: result.rows[0] });
  } catch (error) {
    console.error('Error creating route:', error);
    res.status(500).json({ error: 'Error creating route' });
  }
});

module.exports = router;
