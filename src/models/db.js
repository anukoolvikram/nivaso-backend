const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

// const pool = new Pool({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASS,
//     database: process.env.DB_NAME,
//     port: process.env.DB_PORT || 5432,
//     max: 10, 
//     ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
// });

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: process.env.NODE_ENV === "production"
//     ? { rejectUnauthorized: false } // for Render
//     : false,
//   max: 10
// });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Render, Neon, etc.
  },
  max: 10,
});


module.exports = pool;
