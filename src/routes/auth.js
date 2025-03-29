const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('@/src/db');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const ACCESS_TOKEN_EXPIRY = 60 * 60;  // 1 hour (in seconds)
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60;  // 30 days (in seconds)

// ===== UTILITY FUNCTIONS =====

// Utility: Generate tokens
const generateTokens = (userId, deviceId) => {
  console.log(`Generating tokens for user ID: ${userId}`);

  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET_KEY, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ userId, deviceId }, process.env.JWT_REFRESH_SECRET_KEY, { expiresIn: REFRESH_TOKEN_EXPIRY });

  return { accessToken, refreshToken };
};

// Utility: Destroy refresh token in database
const destroyRefreshToken = async (userId, deviceId) => {
  try {
    console.log(`Destroying refresh token for user ID: ${userId}, device ID: ${deviceId}`);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1 AND device_id = $2', [userId, deviceId]);
  } catch (error) {
    console.error(`Error destroying refresh token for user ID: ${userId}`, error);
  }
};

// Utility: Store refresh token in database
const storeRefreshToken = async (userId, deviceId, refreshToken) => {
  try {
    const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000);
    
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, device_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [userId, deviceId, refreshToken, refreshTokenExpiry]
    );
    
    console.log(`Stored refresh token for user ID: ${userId}, device ID: ${deviceId}`);
  } catch (error) {
    console.error(`Error storing refresh token for user ID: ${userId}`, error);
  }
};

/**
 * Generates tokens and sets them as cookies
 * @param {String} userId - User ID
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const issueAuthTokens = async (userId, res) => {
  const deviceId = uuidv4();

  const { accessToken, refreshToken } = generateTokens(userId, deviceId);
  await storeRefreshToken(userId, deviceId, refreshToken);

  console.log("Setting cookies")

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: ACCESS_TOKEN_EXPIRY * 1000, // 1000 to convert to milliseconds
    sameSite: 'Strict'
  });
   res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: REFRESH_TOKEN_EXPIRY * 1000,
    sameSite: 'Strict'
  });

  console.log("Successfully set cookies")
};

// Factory function to create user lookup queries by a specific field
const createUserFinder = (field) => {
  return async (value) => {
    const result = await pool.query(`SELECT * FROM users WHERE ${field} = $1`, [value]);
    return result.rows[0];
  };
};

// Delete expired refresh tokens
const deleteExpiredRefreshTokens = async () => {
  console.log('Checking for expired refresh tokens...');

  try {
    // Find expired refresh tokens
    const result = await pool.query(
      'SELECT * FROM refresh_tokens WHERE expires_at < NOW()'
    );

    const expiredTokens = result.rows;
    expiredTokens.forEach(async (token) => {
      await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [token.id]);
      console.log(`Deleted expired refresh token for device ID: ${token.device_id}`);
    });

    console.log('Expired refresh tokens cleanup completed');
  } catch (error) {
    console.error('Error deleting expired refresh tokens:', error);
  }
};

// Delete expired refresh tokens every 24 hours
setInterval(deleteExpiredRefreshTokens, 86400000);

// User finder methods
const findUserById = createUserFinder('id');
const findUserByUsername = createUserFinder('username');
const findUserByEmail = createUserFinder('email');

// ===== MIDDLEWARE =====

// Middleware to verify access token
const verifyAccessToken = async (req, res, next) => {
  console.log(`Verifying access token for protected path: ${req.originalUrl}`);
  const accessToken = req.cookies?.accessToken;

  if (!accessToken) {
    console.log("Missing access token");
    return refreshAccessToken(req, res, next); // attempt to refresh access token if it is missing/expired
  }

  try {
    const verified = jwt.verify(accessToken, process.env.JWT_SECRET_KEY);
    req.userId = verified.userId;
    console.log("Access token verified!");
    return next();
  } catch (error) {
    console.error("JWT verification error:", error);
    return refreshAccessToken(req, res, next);
  }
};

const refreshAccessToken = async (req, res, next) => {
  console.log("Attempting to refresh user access token");
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    console.log('Missing refresh token');
    return res.status(401).json({ message: 'Missing refresh token' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY);

    const result = await pool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND device_id = $2 AND token = $3',
      [decoded.userId, decoded.deviceId, refreshToken]
    );

    if (result.rows.length === 0) {
      console.log(`Invalid refresh token for user ID: ${decoded.userId}`);
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    console.log("Found valid refresh token!")

    await destroyRefreshToken(decoded.userId, decoded.deviceId); // Refresh tokens are single use, so delete the old one
    await issueAuthTokens(decoded.userId, res);

    req.userId = decoded.userId;
    return next();
  } catch (error) {
    console.error('Error verifying refresh token:', error);
    return res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

// ===== ROUTES =====

// Verify access token
// if access token is invalid but there is a valid refresh token it will refresh the access token
router.get('/verify-token', verifyAccessToken, async (req, res) => {
  // verifyAccessToken will send a response early if verification fails, so we now token is valid at this point
  res.status(200).json({ message: 'Token is valid' });
});

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

    res.status(201).json({ message: 'User created' });
  } catch (error) {
    if (error.code === '23505') {  // PostgreSQL duplicate key error code
      return res.status(400).json({ message: 'Username or email already taken' });
    }
  
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log(`Login attempt for: ${username}`);

    // Check if the identifier is an email or a username
    const isEmail = /\S+@\S+\.\S+/.test(username);  // Regular expression to check for email format

    // Gets user row by either email or username
    let user;
    if (isEmail) {
      user = await findUserByEmail(username);
    } else {
      user = await findUserByUsername(username);
    }

    if (!user) {
      console.log(`Invalid ${isEmail ? 'email' : 'username'}: ${username}`);
      return res.status(401).json({ message: 'Invalid email/username or password' });
    }

    // Check if the password matches
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log(`Invalid password for ${isEmail ? 'email' : 'username'}: ${username}`);
      return res.status(401).json({ message: 'Invalid email/username or password' });
    }

    console.log(`Login successful for ${isEmail ? 'email' : 'username'}: ${username}`);
    await issueAuthTokens(user.id, res);

    res.status(200).json({ message: 'Successful log in' })
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

module.exports = { authRoutes: router, verifyAccessToken };
