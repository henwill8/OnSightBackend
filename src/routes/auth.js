const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('@/src/db');
const router = express.Router();

// Utility: Generate tokens
const generateTokens = (userId) => {
  console.log(`Generating tokens for user ID: ${userId}`);
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET_KEY, { expiresIn: '30d' });
  return { accessToken, refreshToken };
};

// Utility: Store refresh token in database
const storeRefreshToken = async (userId, refreshToken) => {
  try {
    console.log(`Storing refresh token for user ID: ${userId}`);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)',
      [userId, refreshToken]
    );
    console.log(`Refresh token stored for user ID: ${userId}`);
  } catch (error) {
    console.error(`Error storing refresh token for user ID: ${userId}`, error);
  }
};

// Utility: Set refresh token in cookies
const setRefreshTokenCookie = (res, refreshToken) => {
  console.log(`Setting refresh token cookie`);
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

// Register user
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    console.log(`Registering user: ${username}`);
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into the database
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hashedPassword]
    );

    const user = result.rows[0];

    console.log(`User created with ID: ${user.id}`);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token in database
    await storeRefreshToken(user.id, refreshToken);

    // Set refresh token as HTTP-only cookie
    setRefreshTokenCookie(res, refreshToken);

    res.status(201).json({ message: 'User created', accessToken });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log(`Login attempt for user: ${username}`);
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];

    if (!user) {
      console.log(`Invalid username: ${username}`);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log(`Invalid password for user: ${username}`);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    console.log(`Login successful for user: ${username}`);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token in database
    await storeRefreshToken(user.id, refreshToken);

    // Set refresh token as HTTP-only cookie
    setRefreshTokenCookie(res, refreshToken);

    res.status(200).json({ message: 'Login successful', accessToken });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
  console.log("Refreshing user token");
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    console.log('Refresh token missing');
    return res.status(403).json({ message: 'Refresh token is required' });
  }

  try {
    console.log('Verifying refresh token');
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY);

    const result = await pool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2',
      [decoded.userId, refreshToken]
    );

    if (result.rows.length === 0) {
      console.log(`Invalid refresh token for user ID: ${decoded.userId}`);
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Generate new access token
    const accessToken = jwt.sign({ userId: decoded.userId }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });

    console.log(`Access token generated for user ID: ${decoded.userId}`);
    res.status(200).json({ accessToken });
  } catch (error) {
    console.error('Error verifying refresh token:', error);
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
});

// Verify token
router.get('/verify-token', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    console.log('Token missing in authorization header');
    return res.status(403).json({ message: 'No token provided' });
  }

  try {
    console.log('Verifying access token');
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    res.status(200).json({ message: 'Token is valid', userId: decoded.userId });
  } catch (error) {
    console.log('Error verifying token:', error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

module.exports = router;
