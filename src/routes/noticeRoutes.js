const express = require('express');
const router = express.Router();
const pool = require("../models/db");

// GET ALL NOTICES
router.get('/all-notices', async (req, res) => {
    const { society_id, society_code } = req.query;
  
    try {
      let result;
  
      if (society_id) {
        const query = `SELECT * FROM notices WHERE society_id = $1 ORDER BY date_posted DESC`;
        result = await pool.query(query, [society_id]);
      } else if (society_code) {
        const query = `
          SELECT n.*
          FROM notices n
          JOIN society s ON n.society_id = s.id
          WHERE s.society_code = $1
          ORDER BY n.date_posted DESC;
        `;
        result = await pool.query(query, [society_code]);
      } else {
        return res.status(400).json({ error: 'society_id or society_code is required' });
      }
  
      res.status(200).json(result.rows);
    } catch (error) {
      console.error('Error fetching notices:', error);
      res.status(500).json({ error: 'Failed to fetch notices' });
    }
  });

  
// ADD NOTICE BY SOCIETY
router.post('/post-notice', async (req, res) => {
    const { title, description, type, society_id } = req.body;

    // 🔐 Basic validation
    if (!title || !type || !society_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // description can be = ('announcement', 'notice', 'poll', 'lost_and_found')

    try {
        const query = `
            INSERT INTO notices (title, description, type, society_id, approved)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const values = [title, description, type, society_id, true];

        const result = await pool.query(query, values);

        res.status(201).json(result.rows[0]);  
    } catch (error) {
        console.error('Error posting notice:', error);
        res.status(500).json({ error: 'Failed to post notice' });
    }
});

// EDIT 
router.put('/edit-notice/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, type } = req.body;

    if (!title || !description || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const query = `
            UPDATE notices
            SET title = $1, description = $2, type = $3
            WHERE notice_id = $4
            RETURNING *
        `;

        const values = [title, description, type, id];
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notice not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error updating notice:', error);
        res.status(500).json({ error: 'Failed to update notice' });
    }
});

// POST NOTICE BY USER
router.post('/post-user-notice', async(req, res)=>{
    const { title, description, type, user_id, society_code } = req.body;

    // Validate required fields
    if (!title || !type || !society_code) {
    return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 🔍 Step 1: Get the society_id from society_code
        const societyResult = await pool.query(
            `SELECT id FROM society WHERE society_code = $1`,
            [society_code]
        );

        if (societyResult.rows.length === 0) {
            return res.status(404).json({ error: 'Society not found' });
        }

        const society_id = societyResult.rows[0].id;

        // 📝 Step 2: Insert the notice
        const insertQuery = `
            INSERT INTO notices (title, description, type, society_id, user_id, approved)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;

        const values = [title, description, type, society_id, user_id || null, false];

        const result = await pool.query(insertQuery, values);

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('Error posting notice:', error);
        res.status(500).json({ error: 'Failed to post notice' });
    }
})

// NOTICES WRITTEN BY THE USER
router.get('/user-notices', async(req, res)=>{
    const {user_id}=req.query;

    try {
        const query = `SELECT * FROM notices WHERE user_id = $1 ORDER BY date_posted DESC`;
        result = await pool.query(query, [user_id]);

        res.status(201).json(result.rows);
    } catch (error) {
        console.error('Error getting notice:', error);
        res.status(500).json({ error: 'Failed to Get user written notice' });
    }
})


// APPROVE A NOTICE
router.put('/approve-notice/:notice_id', async (req, res) => {
    const { notice_id } = req.params;
  
    if (!notice_id) {
      return res.status(400).json({ error: 'Notice ID is required' });
    }
  
    try {
      const updateQuery = `
        UPDATE notices
        SET approved = true
        WHERE notice_id = $1
        RETURNING *;
      `;
  
      const result = await pool.query(updateQuery, [notice_id]);
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Notice not found' });
      }
  
      res.status(200).json({ message: 'Notice approved', notice: result.rows[0] });
    } catch (err) {
      console.error('Error approving notice:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/user-name/:id', async (req, res) => {
    const author_id = req.params.id;
  
    try {
      const result = await pool.query(
        'SELECT name, flat_id FROM resident WHERE id = $1',
        [author_id]
      );
  
      if (result.rows.length > 0) {
        return res.status(200).json({
          success: true,
          author_name: result.rows[0].name,
          flat_id:result.rows[0].flat_id
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'Author not found',
        });
      }
    } catch (error) {
      console.error('Error fetching author name:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  });

// federation notices routes

router.get('/federation-notice/get/:id', async (req, res) => {
  const fed_id = req.params.id;

  try {
    const result = await pool.query(
      `SELECT * FROM federation_notices WHERE federation_id = $1 ORDER BY date_posted DESC`,
      [fed_id]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting notices:', error);
    res.status(500).json({ error: 'Failed to get federation notices' });
  }
});


router.post('/federation-notice/post', async (req, res) => {
  const { federation_id, title, description, type } = req.body;
  const date_posted = new Date();

  try {
    await pool.query(
      `INSERT INTO federation_notices (federation_id, title, description, type, date_posted) 
       VALUES ($1, $2, $3, $4, $5)`,
      [federation_id, title, description, type, date_posted]
    );
    res.status(201).json({ success: true, message: 'Notice posted' });
  } catch (err) {
    console.error('Error posting notice:', err.message);
    res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.put('/federation-notice/edit/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, type } = req.body;

  try {
    const result = await pool.query(
      `UPDATE federation_notices 
       SET title = $1, description = $2, type = $3, date_posted = NOW() 
       WHERE id = $4 
       RETURNING *`,
      [title, description, type, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }

    res.status(200).json({ success: true, message: 'Notice updated', notice: result.rows[0] });
  } catch (err) {
    console.error('Error updating federation notice:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update notice' });
  }
});

router.get('/federation-id/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const societyResult = await pool.query(
      'SELECT federation_code FROM society WHERE id = $1',
      [id]
    );

    if (societyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Society not found' });
    }

    const federationCode = societyResult.rows[0].federation_code;

    // console.log("(((((((((((((((((((")
    // console.log(federationCode)

    const federationResult = await pool.query(
      'SELECT id FROM federation WHERE federation_code = $1',
      [federationCode]
    );

    // console.log(federationResult.rows[0])

    if (federationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Federation not found for this society' });
    }

    return res.json({ federation_id: federationResult.rows[0].id });

  } catch (err) {
    console.error('Error fetching federation_id:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

  
module.exports = router;
