const express = require('express');
const router = express.Router();
const pool = require("../models/db");

// GET ALL NOTICES
router.get('/all-notices', async (req, res) => {
    const { society_id, society_code } = req.query;
  
    try {
      let result;
  
      if (society_id) {
        // const query = `SELECT * FROM notices WHERE society_id = $1 ORDER BY date_posted DESC`;
        // result = await pool.query(query, [society_id]);

        const query = `
          SELECT
            n.*,
            COALESCE(
              json_agg(ni.image_url) FILTER (WHERE ni.image_url IS NOT NULL),
              '[]'
            ) AS images
          FROM notices n
          LEFT JOIN notice_images ni
            ON n.notice_id = ni.notice_id
          WHERE n.society_id = $1
          GROUP BY n.notice_id
          ORDER BY n.date_posted DESC;
        `;
        result = await pool.query(query, [society_id]);

      } else if (society_code) {
        // const query = `
        //   SELECT n.*
        //   FROM notices n
        //   JOIN society s ON n.society_id = s.id
        //   WHERE s.society_code = $1
        //   ORDER BY n.date_posted DESC;
        // `;
        // result = await pool.query(query, [society_code]);

        const query = `
          SELECT
            n.*,
            COALESCE(
              json_agg(ni.image_url) FILTER (WHERE ni.image_url IS NOT NULL),
              '[]'
            ) AS images
          FROM notices n
          JOIN society s ON n.society_id = s.id
          LEFT JOIN notice_images ni
            ON n.notice_id = ni.notice_id
          WHERE s.society_code = $1
          GROUP BY n.notice_id
          ORDER BY n.date_posted DESC;
        `;
        result = await pool.query(query, [society_code]);

      } else {
        return res.status(400).json({ error: 'society_id or society_code is required' });
      }
      res.status(200).json(result.rows);
    } 
    catch (error) {
      console.error('Error fetching notices:', error);
      res.status(500).json({ error: 'Failed to fetch notices' });
    }
  });

  
// ADD NOTICE BY SOCIETY
router.post('/post-notice', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { title, description, type, society_id, options, images } = req.body;
    const date_posted = new Date();

    if (!title || !type || !society_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const insertNoticeText = `
      INSERT INTO notices (title, description, type, society_id, approved, date_posted)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [title, description, type, society_id, true, date_posted];
    const result = await client.query(insertNoticeText, values);
    const noticeId = result.rows[0].notice_id;

    if (type === 'poll' && Array.isArray(options)) {
      for (let optText of options) {
        await client.query(
          `INSERT INTO poll_options (notice_id, text) VALUES ($1, $2)`,
          [noticeId, optText]
        );
      }
    }

    // for images
    if (Array.isArray(images) && images.length > 0) {
      for (let imgUrl of images) {
        await client.query(
          `INSERT INTO notice_images (notice_id, image_url) VALUES ($1, $2)`,
          [noticeId, imgUrl]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } 
  catch (error) {
    await client.query('ROLLBACK');
    console.error('Error posting notice:', error);
    res.status(500).json({ error: 'Failed to post notice' });
  } 
  finally {
    client.release();
  }
});


// Routes for Poll and Votes
router.get('/poll-options/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `SELECT option_id, text, votes
       FROM poll_options
      WHERE notice_id = $1
      ORDER BY option_id ASC`,   
    [id]
  );
  res.json(result.rows);
});

router.post('/vote', async (req, res) => {
  const { option_id, user_id } = req.body;
  // check if user already voted
  const alreadyVoted = await pool.query(
    `SELECT * FROM poll_votes WHERE option_id = $1 AND user_id = $2`,
    [option_id, user_id]
  );
  if (alreadyVoted.rowCount > 0) {
    return res.status(400).json({ message: "Already voted" });
  }
  // record vote
  await pool.query(
    `INSERT INTO poll_votes (option_id, user_id) VALUES ($1, $2)`,
    [option_id, user_id]
  );
  await pool.query(
    `UPDATE poll_options SET votes = votes + 1 WHERE option_id = $1`,
    [option_id]
  );
  res.status(200).json({ message: "Vote counted" });
});


// EDIT NOTICE
router.put('/edit-notice/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, type, images } = req.body;

    if (!title || !description || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // const query = `
      //     UPDATE notices
      //     SET title = $1, description = $2, type = $3
      //     WHERE notice_id = $4
      //     RETURNING *
      // `;
      const query = `
        UPDATE notices
        SET title = $1,
            description = $2,
            type = $3
        WHERE notice_id = $4
        RETURNING *;
      `;

      const values = [title, description, type, id];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Notice not found' });
      }

      // Replace images
      await client.query(
        `DELETE FROM notice_images WHERE notice_id = $1`,
        [id]
      );
      if (Array.isArray(images) && images.length > 0) {
        for (let imgUrl of images) {
          await client.query(
            `INSERT INTO notice_images (notice_id, image_url) VALUES ($1, $2)`,
            [id, imgUrl]
          );
        }
      }

      await client.query('COMMIT');
      res.status(200).json(result.rows[0]);
    } 
    catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating notice:', error);
      res.status(500).json({ error: 'Failed to update notice' });
    }
});

// POST NOTICE BY USER
router.post('/post-user-notice', async(req, res)=>{
    const { title, description, type, user_id, society_code, images } = req.body;

    // Validate required fields
    if (!title || !type || !society_code) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await pool.connect();
    try {
        const societyResult = await pool.query(
            `SELECT id FROM society WHERE society_code = $1`,
            [society_code]
        );

        if (societyResult.rows.length === 0) {
            return res.status(404).json({ error: 'Society not found' });
        }
        const society_id = societyResult.rows[0].id;

        const insertQuery = `
            INSERT INTO notices (title, description, type, society_id, user_id, approved)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        await client.query('BEGIN');
        const values = [title, description, type, society_id, user_id || null, false];
        const result = await pool.query(insertQuery, values);

        const noticeId = result.rows[0].notice_id;

        // insert images
        if (Array.isArray(images) && images.length > 0) {
          for (let imgUrl of images) {
            await client.query(
              `INSERT INTO notice_images (notice_id, image_url)
              VALUES ($1, $2)`,
              [noticeId, imgUrl]
            );
          }
        }
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } 
    catch (error) {
      await client.query('ROLLBACK');
      console.error('Error posting notice:', error);
      res.status(500).json({ error: 'Failed to post notice' });
    }
    finally {
      client.release();
    }
})

// NOTICES WRITTEN BY THE USER
router.get('/user-notices', async(req, res)=>{
    const {user_id}=req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'User Id is required' });
    }

    try {
        const query = `SELECT n.*,
        COALESCE(
          json_agg(ni.image_url) FILTER (WHERE ni.image_url IS NOT NULL),
          '[]'
        ) AS images
        FROM notices n
        LEFT JOIN notice_images ni
          ON n.notice_id = ni.notice_id
        WHERE n.user_id = $1
        GROUP BY n.notice_id
        ORDER BY n.date_posted DESC;`;

        const result = await pool.query(query, [user_id]);
        res.status(201).json(result.rows);
    } 
    catch (error) {
        console.error('Error getting notice:', error);
        res.status(500).json({ error: 'Failed to get user written notice' });
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


// FEDERATION NOTICE ROUTES *********************************
router.get('/federation-notice/get/:id', async (req, res) => {
  const fed_id = req.params.id;

  try {
    const query = `
      SELECT
        fn.id,
        fn.federation_id,
        fn.title,
        fn.description,
        fn.type,
        fn.date_posted,
        COALESCE(
          json_agg(fni.image_url) FILTER (WHERE fni.image_url IS NOT NULL),
          '[]'
        ) AS images
      FROM federation_notices fn
      LEFT JOIN federation_notice_images fni
        ON fn.id = fni.federation_notice_id
      WHERE fn.federation_id = $1
      GROUP BY fn.id
      ORDER BY fn.date_posted DESC;
    `;
    const result = await pool.query(query, [fed_id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error getting notices:', error);
    res.status(500).json({ error: 'Failed to get federation notices' });
  }
});


router.post('/federation-notice/post', async (req, res) => {
  const { federation_id, title, description, type, images } = req.body;
  // `images` should be an array of Cloudinary URLs, e.g. ["https://...jpg", ...]
  const date_posted = new Date();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Insert into federation_notices and get back its new ID
    const insertNotice = `
      INSERT INTO federation_notices 
        (federation_id, title, description, type, date_posted)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const result = await client.query(insertNotice, [
      federation_id,
      title,
      description,
      type,
      date_posted
    ]);
    const noticeId = result.rows[0].id;

    // 2) Insert each image URL (if any) into federation_notice_images
    if (Array.isArray(images) && images.length > 0) {
      for (let url of images) {
        await client.query(
          `INSERT INTO federation_notice_images 
             (federation_notice_id, image_url)
           VALUES ($1, $2)`,
          [noticeId, url]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Notice posted', noticeId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error posting notice:', err.message);
    res.status(500).json({ success: false, message: 'Internal error' });
  } finally {
    client.release();
  }
});

router.put('/federation-notice/update/:id', async (req, res) => {
  const noticeId = req.params.id;
  const { title, description, type, images } = req.body;
  // `images` = new array of URLs (possibly empty)
  const curr_date = new Date();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Update the main federation_notices row
    const updateNotice = `
      UPDATE federation_notices
      SET title = $1,
          description = $2,
          type = $3,
          date_posted = $4
      WHERE id = $5
      RETURNING *;
    `;
    const result = await client.query(updateNotice, [
      title,
      description,
      type,
      curr_date,
      noticeId
    ]);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }

    // 2) Delete any old images for this notice
    await client.query(
      `DELETE FROM federation_notice_images 
       WHERE federation_notice_id = $1`,
      [noticeId]
    );

    // 3) Insert new image URLs (if any)
    if (Array.isArray(images) && images.length > 0) {
      for (let url of images) {
        await client.query(
          `INSERT INTO federation_notice_images 
             (federation_notice_id, image_url)
           VALUES ($1, $2)`,
          [noticeId, url]
        );
      }
    }

    await client.query('COMMIT');
    res.status(200).json({
      success: true,
      message: 'Notice updated',
      notice: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating federation notice:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update notice' });
  } finally {
    client.release();
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
