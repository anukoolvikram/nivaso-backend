const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require("../models/db");

const router = express.Router();

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, '..', '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// 📤 Upload a document for a society
router.post('/', upload.single('file'), async (req, res) => {
  const { title, society_id } = req.body;
  const file = req.file;

  if (!title || !file || !society_id) {
    return res.status(400).json({ error: 'Title, file, and society_id are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO society_documents (society_id, title, filename, path)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [society_id, title, file.filename, file.path]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// 📥 Get all documents for a society
router.get('/', async (req, res) => {
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

// 🗑️ Delete a document
router.delete('/:id', async (req, res) => {
  const docId = parseInt(req.params.id);

  try {
    const fileRes = await pool.query(
      `SELECT * FROM society_documents WHERE id = $1`,
      [docId]
    );

    if (fileRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = fileRes.rows[0];

    await pool.query(`DELETE FROM society_documents WHERE id = $1`, [docId]);

    fs.unlink(doc.path, (err) => {
      if (err) {
        console.error('File delete error:', err);
        return res.status(500).json({ error: 'File deleted from DB, but failed on disk' });
      }
      res.json({ message: 'Document deleted successfully' });
    });
  } catch (err) {
    console.error('Delete failed:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
