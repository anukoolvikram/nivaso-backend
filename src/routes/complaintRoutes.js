const express = require('express');
const router = express.Router();
const pool = require('../models/db'); 


// POST COMPLAINTS
router.post('/post-complaints', async (req, res) => {
  const { resident_id, title, type, content, is_anonymous, society_code } = req.body;

  // console.log('posting')

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

    console.log(result)

    res.status(201).json(result.rows[0]);
  } catch (error) {
    // console.log(error)
    console.error('Error posting complaint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// GET ALL COMPLAINTS
router.get('/get-complaints', async (req, res) => {
    const { society_code } = req.query;
    // console.log(society_code)

    try {
      const query = `
        SELECT * FROM complaints
        WHERE society_code = $1
        ORDER BY created_at DESC;
      `;
      const result = await pool.query(query, [society_code]);

    //   console.log(result)
  
      res.status(200).json(result.rows);
    } catch (error) {
      console.error('Error fetching all complaints:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
});

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

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid or missing resident ID' });
  }

  const query = `
    SELECT * FROM complaints
    WHERE resident_id = $1 AND society_code = $2
    ORDER BY created_at DESC
  `;

  try {
    const result = await pool.query(query, [id, society_code]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching resident complaints:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CHANGE STATUS
router.put('/change-status', async (req, res) => {
  const { id, status, comment = null } = req.body;

  try {
    const query = `UPDATE complaints SET status = $1, comment = $2 WHERE id = $3 RETURNING *`;
    const result = await pool.query(query, [status, comment, id]);

    if (result.rowCount === 0)
      return res.status(404).json({ error: 'Complaint not found' });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


  

module.exports = router;