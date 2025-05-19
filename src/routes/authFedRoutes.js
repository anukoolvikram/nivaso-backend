const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../models/db");
const crypto = require("crypto");

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY;

async function generateFederationCode() {
    let federation_code;
    let isUnique = false;

    while (!isUnique) {
        federation_code = "FED" + crypto.randomBytes(4).toString("hex"); // Generate code
        const dbCheck = await pool.query("SELECT 1 FROM federation WHERE federation_code = $1", [federation_code]);

        if (dbCheck.rows.length === 0) {
            isUnique = true; // If no duplicate, exit loop
        }
    }
    return federation_code;
}

async function generateSocietyCode(existingCodes) {
    let societyCode;
    let isUnique = false;

    while (!isUnique) {
        societyCode = "SOC" + crypto.randomBytes(4).toString("hex"); // Generate code
        const dbCheck = await pool.query("SELECT 1 FROM society WHERE society_code = $1", [societyCode]);

        if (dbCheck.rows.length === 0 && !existingCodes.has(societyCode)) {
            isUnique = true;
        }
    }
    return societyCode;
}


// REGISTER FEDERATION
router.post("/register", async (req, res) => {
    const client = await pool.connect(); // Use transaction safety
    try {
        let { email, password, isFederation, name, apartment, tenement } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        let federation_code = await generateFederationCode();

        if (!isFederation) {
            name = "Unfederated";
            federation_code = "FED17032025";
        }

        // Validation Checks
        const emailCheck = await pool.query("SELECT * FROM federation WHERE email = $1", [email]);
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ error: "Email already exists" });
        }

        await client.query("BEGIN"); // Start transaction

        // Insert User
        const userResult = await client.query(
            "INSERT INTO federation (email, password, is_federation, name, apartment, tenement, federation_code) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
            [email, hashedPassword, isFederation, name, apartment, tenement, federation_code]
        );
        // console.log('heey')
        // console.log(userResult.rows[0])
        const primary_id = userResult.rows[0].id;

        // Create Societies
        const no_of_apartment = parseInt(apartment);
        const no_of_tenement = parseInt(tenement);
        let societyNumber = no_of_apartment + no_of_tenement;

        const societies = [];
        const existingSocietyCodes = new Set();

        for (let i = 0; i < no_of_apartment; i++) {
            const societyCode = await generateSocietyCode(existingSocietyCodes);
            existingSocietyCodes.add(societyCode);

            societies.push({
                code: societyCode,
                name: `Society_${societyNumber--}`,
                type: 'Apartment'
            });
        }

        for (let i = 0; i < no_of_tenement; i++) {
            const societyCode = await generateSocietyCode(existingSocietyCodes);
            existingSocietyCodes.add(societyCode);

            societies.push({
                code: societyCode,
                name: `Society_${societyNumber--}`,
                type: 'Tenement'
            });
        }

        for (const society of societies) {
            await client.query(
                "INSERT INTO society (society_code, federation_code, society_name, society_type) VALUES ($1, $2, $3, $4)",
                [society.code, federation_code, society.name, society.type]
            );
        }

        // Commit transaction
        await client.query("COMMIT");

        // Generate JWT Token
        const token = jwt.sign(
            { primary_id, email, federation_code, isFederation },
            SECRET_KEY,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            message: "User registered and societies created",
            token,
            federation_code,
            user_type:'federation'
        });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error in Registration:", error);
        res.status(500).json({ error: "Server Error" });
    } finally {
        client.release();
    }
});


// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Input Validation
        if (!email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const user = await pool.query("SELECT * FROM federation WHERE email = $1", [email]);

        if (user.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const validPassword = await bcrypt.compare(password, user.rows[0].password);

        if (!validPassword) {
            console.log('invalid')
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // console.log('hhhhhhhhhh')
        // console.log(user.rows[0].id)
        const token = jwt.sign(
            { id: user.rows[0].id }, 
            SECRET_KEY, 
            { expiresIn: "1d" });


        // console.log(token)
        res.status(200).json({ 
            token, 
            federation_code: user.rows[0].federation_code,
            user_type:'federation'
         });
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ error: "Server Error" });
    }
});


// Get society Data
router.get('/getSociety', async (req, res) => {
    try {
        const societies = await pool.query("SELECT * FROM society where federation_code = $1", [req.query.federationCode]);
        res.status(200).json(societies.rows);
    } catch (error) {
        console.error('Error fetching societies:', error);
        res.status(500).json({ error: "Server Error" });
    }
});


router.put('/updateSociety', async (req, res) => {
    const { societyCode, societyName, societyType } = req.body;

    if (!societyCode || !societyName || !societyType) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const result = await pool.query(
            "UPDATE society SET society_name = $1, society_type = $2 WHERE society_code = $3 RETURNING *",
            [societyName, societyType, societyCode]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Society not found" });
        }

        res.status(200).json(result.rows[0]); // Send updated society details
    } catch (error) {
        console.error('Error updating society:', error);
        res.status(500).json({ error: "Server Error" });
    }
});



// // SOCIETY SETUP
// router.post('/register/society', async (req, res) => {
//     const { federation_code, society_code, society_type} = req.body;

//     const query = `
//         INSERT INTO society (society_code, federation_code, society_type)
//         VALUES ($1, $2, $3) RETURNING *;
//     `;

//     try {
//         const client = await pool.connect();
//         const { rows } = await client.query(query, [
//             society_code, federation_code, society_type
//         ]);
//         client.release();

//         return res.status(201).json({ message: "Society registered successfully", society: rows[0] });

//     } catch (error) {
//         console.error('Error inserting society:', error);
//         return res.status(500).json({ message: "Internal Server Error" });
//     }
// });


module.exports = router;
