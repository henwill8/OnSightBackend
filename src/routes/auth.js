const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('@/src/db');
const router = express.Router();

// Middleware to verify access token
const verifyAccessToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Extract token from Authorization header

  if (!token) {
    return res.status(403).json({ message: 'No access token provided' });
  }

  try {
    // Verify the access token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    req.userId = decoded.userId; // Store the user ID in request for further use (e.g., in routes)
    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error('Access token verification failed:', error);

    // If the access token is invalid or expired, check if refresh token is present
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: 'Invalid access token and no refresh token available' });
    }

    // Verify refresh token
    try {
      const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY);
      const userId = decodedRefresh.userId;

      // Check if the refresh token exists in the database
      const result = await pool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2',
        [userId, refreshToken]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ message: 'Invalid or expired refresh token' });
      }

      // If refresh token is valid, generate a new access token
      const newAccessToken = jwt.sign({ userId }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });

      // Send the new access token in the response
      res.setHeader('Authorization', `Bearer ${newAccessToken}`);
      req.userId = userId; // Store the user ID in request for further use
      next(); // Proceed to the next middleware or route handler
    } catch (refreshError) {
      console.error('Error verifying refresh token:', refreshError);
      return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }
  }
};

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
  } catch (error) {
    console.error(`Error storing refresh token for user ID: ${userId}`, error);
  }
};

// Utility: Set refresh token in cookies
const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true, // Prevent access from client-side JavaScript
    secure: process.env.NODE_ENV === 'production',  // Use HTTPS in production
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'Strict', // Prevent CSRF attacks
  });
};

// Utility: Set userId in cookies
const setUserIdCookie = (res, userId) => {
  console.log(`Setting userId cookie`);
  res.cookie("userId", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',  // Only over HTTPS in production
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'Strict', // CSRF protection
  });
};

const authenticateUser = async (userId, res) => {
  const { accessToken, refreshToken } = generateTokens(userId);
  
  // Store refresh token in database
  await storeRefreshToken(userId, refreshToken);

  // Set cookies for refresh token and userId
  setRefreshTokenCookie(res, refreshToken);
  setUserIdCookie(res, userId);

  res.status(200).json({ accessToken });
};

const findUserById = async (userId) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
};

const findUserByUsername = async (username) => {
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log(`Login attempt for user: ${username}`);
    const user = await findUserByUsername(username);

    if (!user) {
      console.log(`Invalid username: ${username}`);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log(`Invalid password for user: ${username}`);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    console.log(`Login successful for user: ${username}`);
    await authenticateUser(user.id, res);
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

router.post('/refresh-token', async (req, res) => {
  console.log("Refreshing user access token");
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    console.log('Refresh token missing');
    return res.status(403).json({ message: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY);

    const result = await pool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2',
      [decoded.userId, refreshToken]
    );

    if (result.rows.length === 0) {
      console.log(`Invalid refresh token for user ID: ${decoded.userId}`);
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    console.log(`Generating new tokens for user ID: ${decoded.userId}`);
    await authenticateUser(decoded.userId, res);
  } catch (error) {
    console.error('Error verifying refresh token:', error);
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
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

module.exports = { authRoutes: router, verifyAccessToken };
