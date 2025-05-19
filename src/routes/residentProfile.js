const express = require('express');
const router = express.Router();
const pool = require('../models/db'); // Assuming pg-pool setup
const bcrypt = require('bcryptjs');

// Get user details by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, society_code, flat_id, name, email, address, phone, created_at, is_owner FROM resident WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user details (excluding password)
router.put('/:id', async (req, res) => {
  try {
    const { name, email, address, phone } = req.body;
    const { id } = req.params;

    await pool.query(
      `UPDATE resident SET name = $1, email = $2, address = $3, phone = $4 WHERE id = $5`,
      [name, email, address, phone, id]
    );
    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
router.put('/:id/password', async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const { id } = req.params;
  
      // Check if the user exists and get the password
      const result = await pool.query('SELECT password, initial_password FROM resident WHERE id = $1', [id]);
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      const { password, initial_password } = result.rows[0];
  
      let isMatch = false;
  
      if (!password) {
        // No password has been set yet, fallback to initial_password match
        isMatch = oldPassword === initial_password;
      } else {
        // Compare hashed password
        isMatch = await bcrypt.compare(oldPassword, password);
      }
  
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect old password' });
      }
  
      // Hash new password and update
      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE resident SET password = $1 WHERE id = $2', [hashed, id]);
  
      res.json({ message: 'Password changed successfully' });
  
    } catch (err) {
      console.error('Password update error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  

module.exports = router;
