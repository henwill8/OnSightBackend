const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Utility: Generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET_KEY, { expiresIn: '30d' });
  return { accessToken, refreshToken };
};

// Utility: Store refresh token in database
const storeRefreshToken = async (userId, refreshToken) => {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);

  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)',
    [userId, refreshToken]
  );
};

// Utility: Set refresh token in cookies
const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (user will have to re-login after)
  });
};

// Register user
const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into the database
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hashedPassword]
    );

    const user = result.rows[0];

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token in database
    await storeRefreshToken(user.id, refreshToken);

    // Set refresh token as HTTP-only cookie
    setRefreshTokenCookie(res, refreshToken);

    res.status(201).json({ message: 'User created', accessToken });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating user' });
  }
};

// Login user
const loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token in database
    await storeRefreshToken(user.id, refreshToken);

    // Set refresh token as HTTP-only cookie
    setRefreshTokenCookie(res, refreshToken);

    res.status(200).json({ message: 'Login successful', accessToken });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error logging in' });
  }
};

// Refresh token
const refreshUserToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(403).json({ message: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY);

    const result = await pool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2',
      [decoded.userId, refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Generate new access token
    const accessToken = jwt.sign({ userId: decoded.userId }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });

    res.status(200).json({ accessToken });
  } catch (error) {
    console.error(error);
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

// Verify token
const verifyToken = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    res.status(200).json({ message: 'Token is valid', userId: decoded.userId });
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { registerUser, loginUser, refreshUserToken, verifyToken };
