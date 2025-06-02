const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../models/db");

const router = express.Router();

const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.SECRET_KEY;

router.post("/login", async (req, res) => {
    const client = await pool.connect();
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const result = await client.query("SELECT * FROM resident WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const user = result.rows[0];

        // Case 1: first-time login with initial_password
        if (user.password === null) { 
            if (password.trim().normalize() === user.initial_password.trim().normalize()) {

                // Generate token
                const token = jwt.sign({
                    id: user.id,
                    email: user.email,
                    society_code: user.society_code
                }, SECRET_KEY, { expiresIn: "7d" });

                return res.status(200).json({
                    message: "Login successful",
                    society_code: user.society_code,
                    token,
                    user_type:"resident"
                });
            } else {
                return res.status(400).json({ error: "Invalid credentials" });
            }
        }

        // Case 2: login with hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // Generate token
        const token = jwt.sign({
            id: user.id,
            email: user.email,
            society_code: user.society_code
        }, SECRET_KEY, { expiresIn: "7d" });

        res.status(200).json({
            message: "Login successful",
            society_code: user.society_code,
            token,
            user_type:"resident"
        });

    } catch (error) {
        console.error("Error logging in resident:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});

// PROFILE
router.get('/get-profile/:id', async (req, res) => {
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
router.put('/update-profile/:id', async (req, res) => {
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
router.put('/update-profile/:id/password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const { id } = req.params;

    // Fetch existing password fields
    const result = await pool.query(
      'SELECT password, initial_password FROM resident WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password, initial_password } = result.rows[0];
    let isMatch = false;

    if (initial_password != null) {
      // If an initial_password exists, compare plaintext
      isMatch = oldPassword === initial_password;
    } else {
      // Otherwise compare against the hashed password
      isMatch = await bcrypt.compare(oldPassword, password);
    }

    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect old password' });
    }

    // Hash the new password
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE resident
         SET password = $1,
             initial_password = NULL
       WHERE id = $2`,
      [hashed, id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

  


module.exports = router;
