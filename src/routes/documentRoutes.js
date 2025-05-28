const express = require('express');
const pool = require("../models/db");

const router = express.Router();

// POST
router.post('/post', async (req, res) => {
  const { title, society_id, url } = req.body;

  if (!title || !url || !society_id) {
    return res.status(400).json({ error: 'Title, URL, and society_id are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO society_documents (society_id, title, url)
       VALUES ($1, $2, $3) RETURNING *`,
      [society_id, title, url]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Upload failed:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to save document' });
  }
});

// GET
router.get('/get', async (req, res) => {
  const { society_id } = req.query;

  if (!society_id) {
    return res.status(400).json({ error: 'society_id is required' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM society_documents WHERE society_id = $1 ORDER BY uploaded_at DESC`,
      [society_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// DELETE
router.delete('/delete/:id', async (req, res) => {
  const docId = parseInt(req.params.id);

  try {
    const fileRes = await pool.query(
      `SELECT * FROM society_documents WHERE id = $1`,
      [docId]
    );

    if (fileRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await pool.query(`DELETE FROM society_documents WHERE id = $1`, [docId]);

    // No local file deletion needed
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete failed:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
