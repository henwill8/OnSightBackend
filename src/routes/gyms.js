const express = require('express');
const { verifyAccessToken } = require('@/src/routes/auth')
const pool = require('@/src/db'); // Import the db functions

const router = express.Router();

const getAllGyms = async () => {
  try {
    console.log('Fetching all gyms from the database...');
    const result = await pool.query('SELECT * FROM gyms');
    console.log(`Fetched ${result.rows.length} gyms.`);

    result.rows.forEach((gym, index) => {
      console.log(`Gym ${index + 1}: ID: ${gym.id}, Name: ${gym.name}, Location: ${gym.location}`);
    });

    return result.rows;
  } catch (error) {
    console.error('Error fetching gyms:', error);
    throw error;
  }
};

const createGym = async (name, location) => {
  try {
    console.log(`Creating gym with name: ${name}, location: ${location}...`);
    const result = await pool.query(
      'INSERT INTO gyms (name, location) VALUES ($1, $2) RETURNING *',
      [name, location]
    );
    console.log(`Gym created successfully: ${result.rows[0].name}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating gym:', error);
    throw error;
  }
};

// Fetch a specific gym by ID
const getGymById = async (id) => {
  try {
    const result = await pool.query('SELECT * FROM gyms WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new Error(`Gym with ID ${id} not found`);
    }
    return result.rows[0];
  } catch (error) {
    console.error(`Error fetching gym with ID ${id}:`, error);
    throw error;
  }
};

// Get the list of all gyms
router.get('/list-gyms', async (req, res) => {
  console.log('Received GET request for /list-gyms...');
  try {
    const gyms = await getAllGyms();
    console.log('Sending response with list of gyms...');
    res.status(200).json({ gyms });
  } catch (error) {
    console.error('Error in /list-gyms route:', error);
    res.status(500).json({ error: 'Error fetching gyms' });
  }
});

// Create a new gym
router.post('/create-gym', verifyAccessToken, async (req, res) => { // TODO: add gym owners and staff
  const { name, location } = req.body;

  console.log('Received POST request for /create-gym...');
  if (!name || !location) {
    console.log('Missing required fields: name or location');
    return res.status(400).json({ error: 'Missing required fields: name or location' });
  }

  try {
    console.log(`Creating gym with name: ${name}, location: ${location}...`);
    const newGym = await createGym(name, location);
    console.log('Gym created successfully:', newGym);
    res.status(201).json({ message: 'Gym created successfully', gym: newGym });
  } catch (error) {
    console.error('Error in /create-gym route:', error);
    res.status(500).json({ error: 'Error creating gym' });
  }
});

// Get a specific gym by ID
router.get('/get-gym/:id', async (req, res) => {
  const gymId = req.params.id;

  console.log(`Received GET request for /get-gym/${gymId}...`);
  try {
    const gym = await getGymById(gymId);
    console.log(`Sending response with gym ID ${gymId}: ${gym.name}`);
    res.status(200).json({ gym });
  } catch (error) {
    console.error(`Error in /get-gym/${gymId} route:`, error);
    res.status(404).json({ error: `Gym with ID ${gymId} not found` });
  }
});

module.exports = router;
