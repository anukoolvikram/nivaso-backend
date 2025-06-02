const express = require('express');
const router = express.Router();
const pool = require("../models/db");

// ADD USER BLOG
router.post('/add-blog', async (req, res) => {
  const blog=req.body.blog;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const post_date=new Date();

    const postResult = await client.query(
      `INSERT INTO blogposts (title, content, author_id, society_id, post_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [blog.title, blog.content, blog.author, blog.society_id, post_date]
    );
    const post_id = postResult.rows[0].id;

    const tagQuery = `
      SELECT tag_id, tag_name FROM tags
      WHERE tag_name = ANY($1::text[])
    `;
    const tagResult = await client.query(tagQuery, [blog.tags]);

    for (const tag of tagResult.rows) {
      await client.query(
        `INSERT INTO blogtags (post_id, tag_id)
         VALUES ($1, $2)`,
        [post_id, tag.tag_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Blog post created successfully', post_id, success:true });
  } 
  catch (err) {
    await client.query('ROLLBACK');
    console.error('Error adding blog post:', err);
    res.status(500).json({ error: 'Failed to add blog post' });
  } 
  finally {
    client.release();
  }
});

// ADD ADMIN BLOG
 router.post('/add-admin-blog', async (req, res) => {
    const blog=req.body.blog;
    const client = await pool.connect();
    const date_posted = new Date();

    try {
      await client.query('BEGIN');
      const postResult = await client.query(
        `INSERT INTO blogposts (title, content, society_id, by_admin, post_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [blog.title, blog.content, blog.society_id, true, date_posted]
      );
      const post_id = postResult.rows[0].id;

      const tagQuery = `
        SELECT tag_id, tag_name FROM tags
        WHERE tag_name = ANY($1::text[])
      `;
      const tagResult = await client.query(tagQuery, [blog.tags]);

      for (const tag of tagResult.rows) {
        const blogTagResult=await client.query(
          `INSERT INTO blogtags (post_id, tag_id)
           VALUES ($1, $2) RETURNING *`,
          [post_id, tag.tag_id]
        );        
      }
      
      await client.query('COMMIT');
      res.status(201).json({ message: 'Blog post created successfully', post_id, success:true });
    } 
    catch (err) {
      console.log(err)
      await client.query('ROLLBACK');
      console.error('Error adding blog post:', err);
      res.status(500).json({ error: 'Failed to add blog post' });
    } 
    finally {
      client.release();
    }
  });


// GET ALL BLOGS FOR A SOCIETY
router.get('/all-blogs', async (req, res) => {
    const society_id = req.query.society_id;
    if (!society_id) {
      return res.status(400).json({ error: 'society_id is required' });
    }

    try {
        const blogQuery = `
        SELECT bp.id, bp.title, bp.content, bp.post_date, bp.author_id, bp.by_admin
        FROM blogposts bp
        WHERE bp.society_id = $1
        ORDER BY bp.post_date DESC
      `;
      const blogPosts = await pool.query(blogQuery, [society_id]);

      const blogData = await Promise.all(blogPosts.rows.map(async (post) => {
        const tagsRes = await pool.query(
          `SELECT t.tag_name 
           FROM blogtags bt
           JOIN tags t ON bt.tag_id = t.tag_id
           WHERE bt.post_id = $1`,
          [post.id]
        );
  
        return { ...post, tags: tagsRes.rows.map(tag => tag.tag_name), };
      }));
      res.status(200).json(blogData);
    } 
    catch (err) {
      console.error('Error fetching blog posts:', err);
      res.status(500).json({ error: 'Failed to fetch blog posts' });
    }
})

// UPDATE BLOG
  router.put('/update-blog/:id', async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { title, content, tags } = req.body;
      await client.query('BEGIN');
  
      const updateResult = await client.query(
        `UPDATE blogposts 
         SET title = $1, content = $2 
         WHERE id = $3 
         RETURNING *`,
        [title, content, id]
      );
  
      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Blog post not found' });
      }
  
      const existingTagsRes = await client.query(
        `SELECT t.tag_id, t.tag_name 
         FROM blogtags bt
         JOIN tags t ON bt.tag_id = t.tag_id
         WHERE bt.post_id = $1`,
        [id]
      );
  
      const existingTags = existingTagsRes.rows.map(t => t.tag_name);
      const tagsToAdd = tags.filter(t => !existingTags.includes(t));
      const tagsToRemove = existingTags.filter(t => !tags.includes(t));
  
      if (tagsToRemove.length > 0) {
        await client.query(
          `DELETE FROM blogtags 
           WHERE post_id = $1 
           AND tag_id IN (
             SELECT tag_id FROM tags WHERE tag_name = ANY($2::text[])
           )`,
          [id, tagsToRemove]
        );
      }
  
      // 4. Add new tags
      if (tagsToAdd.length > 0) {
        // First ensure all tags exist in tags table
        await client.query(
          `INSERT INTO tags (tag_name)
           SELECT unnest($1::text[])
           ON CONFLICT (tag_name) DO NOTHING`,
          [tagsToAdd]
        );
  
        // Then insert into blogtags
        await client.query(
          `INSERT INTO blogtags (post_id, tag_id)
           SELECT $1, tag_id FROM tags 
           WHERE tag_name = ANY($2::text[])`,
          [id, tagsToAdd]
        );
      }
  
      await client.query('COMMIT');
  
      // 5. Get the updated blog with all tags
      const updatedBlogRes = await client.query(
        `SELECT 
           bp.id, bp.title, bp.content, bp.post_date, 
           r.name AS author_name,
           array_agg(t.tag_name) AS tags
         FROM blogposts bp
         JOIN resident r ON bp.author_id = r.id
         LEFT JOIN blogtags bt ON bp.id = bt.post_id
         LEFT JOIN tags t ON bt.tag_id = t.tag_id
         WHERE bp.id = $1
         GROUP BY bp.id, r.name`,
        [id]
      );
  
      res.json({ 
        success: true, 
        blog: updatedBlogRes.rows[0],
        message: 'Blog post updated successfully'
      });
  
    } 
    catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating blog:', error);
      res.status(500).json({ success: false, error: 'Failed to update blog' });
    } 
    finally {
      client.release();
    }
  });  

// DELETE BLOG BY ADMIN
router.delete('/delete-blog/:id', async (req, res) => {
    const blogId = req.params.id;
    
    try {
        await pool.query('BEGIN');
        await pool.query(
            'DELETE FROM blogtags WHERE post_id = $1',
            [blogId]
        );

        const result = await pool.query(
            'DELETE FROM blogposts WHERE id = $1 RETURNING *',
            [blogId]
        );

        if (result.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                error: 'Blog post not found' 
            });
        }
        await pool.query('COMMIT');
        res.status(200).json({ 
            success: true,
            message: 'Blog post deleted successfully'
        });
    } 
    catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error deleting blog post:', err);
        res.status(500).json({ 
            success: false,
            error: 'Failed to delete blog post' 
        });
    }
});

// FETCH AUTHOR NAME FROM ID
router.get('/author-name/:id', async (req, res) => {
  const author_id = req.params.id;

  try {
    await pool.query('BEGIN');
    const result = await pool.query(
      'SELECT name FROM resident WHERE id = $1',
      [author_id]
    );

    if (result.rows.length > 0) {
      await pool.query('COMMIT');
      return res.status(200).json({
        success: true,
        author_name: result.rows[0].name,
      });
    } 
    else {
      await pool.query('COMMIT');
      return res.status(404).json({
        success: false,
        message: 'Author not found',
      });
    }
  } 
  catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error fetching author name:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

  
module.exports = router;
