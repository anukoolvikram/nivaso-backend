const express = require('express');
const router = express.Router();
const pool = require('../models/db'); 


// POST COMPLAINTS
router.post('/post-complaints', async (req, res) => {
  const { resident_id, title, type, content, is_anonymous, society_code } = req.body;

  if (!resident_id || !title || !type || !content || !society_code) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
// type=Plumbing, Electrical, Civil Works, Other
// status='Received', 'Under review', 'Taking action', 'Dismissed', 'Resolved'
  try {
    const query = `
      INSERT INTO complaints (resident_id, title, type, content, is_anonymous, status, society_code)
      VALUES ($1, $2, $3, $4, $5, 'Received', $6)
      RETURNING *;
    `;
    const values = [resident_id, title, type, content, is_anonymous || false, society_code];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } 
  catch (error) {    
    console.error('Error posting complaint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// GET ALL COMPLAINTS
router.get('/get-complaints', async (req, res) => {
  const { society_code } = req.query;
  try {
    const query = `
      SELECT
        c.*,
        COALESCE(
          json_agg(ci.image_url) FILTER (WHERE ci.image_url IS NOT NULL),
          '[]'
        ) AS images
      FROM complaints c
      LEFT JOIN complaint_images ci
        ON c.id = ci.complaint_id
      WHERE c.society_code = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC;
    `;
    const result = await pool.query(query, [society_code]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// router.get('/get-complaints', async (req, res) => {
//     const { society_code } = req.query;
//     try {
//       const query = `
//         SELECT * FROM complaints
//         WHERE society_code = $1
//         ORDER BY created_at DESC;
//       `;
//       const result = await pool.query(query, [society_code]);
//       res.status(200).json(result.rows);
//     } 
//     catch (error) {
//       console.error('Error fetching all complaints:', error);
//       res.status(500).json({ error: 'Internal server error' });
//     }
// });

router.get('/get-resident', async (req, res)=>{
  const {id}=req.query;
  try{
    const query=`SELECT * FROM resident WHERE id=$1`;
    const result=await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resident not found' });
    }
    res.status(200).json(result.rows[0]);
  }
  catch (error) {
    console.error('Error fetching resident:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})  


// GET USER COMPLAINTS
router.get('/get-complaints/:id', async (req, res) => {
  const { id } = req.params;
  const { society_code } = req.query;
  try {
    const query = `
      SELECT
        c.*,
        COALESCE(
          json_agg(ci.image_url) FILTER (WHERE ci.image_url IS NOT NULL),
          '[]'
        ) AS images
      FROM complaints c
      LEFT JOIN complaint_images ci
        ON c.id = ci.complaint_id
      WHERE c.resident_id = $1
        AND c.society_code = $2
      GROUP BY c.id
      ORDER BY c.created_at DESC;
    `;
    const result = await pool.query(query, [id, society_code]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// router.get('/get-complaints/:id', async (req, res) => {
//   const { id } = req.params;
//   const { society_code } = req.query;

//   if (!id || isNaN(parseInt(id))) {
//     return res.status(400).json({ error: 'Invalid or missing resident ID' });
//   }
//   const query = `
//     SELECT * FROM complaints
//     WHERE resident_id = $1 AND society_code = $2
//     ORDER BY created_at DESC
//   `;

//   try {
//     const result = await pool.query(query, [id, society_code]);
//     res.status(200).json(result.rows);
//   } 
//   catch (error) {
//     console.error('Error fetching resident complaints:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// CHANGE STATUS
router.put('/change-status', async (req, res) => {
  const { id, status, comment = null, images } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) update the complaint status/comment
    const updateQ = `
      UPDATE complaints
      SET status = $1,
          comment = $2
      WHERE id = $3
      RETURNING *;
    `;
    const updRes = await client.query(updateQ, [status, comment, id]);
    if (updRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Complaint not found' });
    }

    // 2) if they marked it Resolved and sent proof images, save them
    if (status === 'Resolved' && Array.isArray(images) && images.length > 0) {
      // optional: delete any old images for this complaint
      await client.query(
        `DELETE FROM complaint_images WHERE complaint_id = $1`,
        [id]
      );
      for (let url of images) {
        await client.query(
          `INSERT INTO complaint_images (complaint_id, image_url)
           VALUES ($1, $2)`,
          [id, url]
        );
      }
    }

    await client.query('COMMIT');
    res.json(updRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating status:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// router.put('/change-status', async (req, res) => {
//   const { id, status, comment = null } = req.body;
//   try {
//     const query = `UPDATE complaints SET status = $1, comment = $2 WHERE id = $3 RETURNING *`;
//     const result = await pool.query(query, [status, comment, id]);

//     if (result.rowCount === 0){
//       return res.status(404).json({ error: 'Complaint not found' });
//     }
//     res.status(200).json(result.rows[0]);
//   } 
//   catch (error) {
//     console.error('Error updating status:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });


  

module.exports = router;