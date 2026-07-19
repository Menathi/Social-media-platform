const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../lib/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are all required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = store.users.findByEmailOrUsername(email) || store.users.findByEmailOrUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username or email is already taken.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = store.users.create({ username, email, password: hashed });

    req.session.userId = user._id;
    res.status(201).json({ _id: user._id, username: user.username, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed.', details: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: 'Email/username and password are required.' });
    }

    const user = store.users.findByEmailOrUsername(emailOrUsername);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

    req.session.userId = user._id;
    res.json({ _id: user._id, username: user.username, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.', details: err.message });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out.' });
  });
});

// Current session user
router.get('/me', requireAuth, (req, res) => {
  const user = store.users.findById(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(store.stripPassword(user));
});

module.exports = router;
