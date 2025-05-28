const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../models/db");
const router = express.Router();
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.SECRET_KEY;

// SOCIETY SETUP by SOCIETY ADMIN
router.post("/register", async (req, res) => {
    const client = await pool.connect();
    
    try {
        let { email, password, society_code, society_name, no_of_wings, floor_per_wing, rooms_per_floor } = req.body;

        const societyCodeCheck = await pool.query("SELECT * FROM society WHERE society_code = $1", [society_code]);
        if (societyCodeCheck.rows.length == 0) {
            return res.status(400).json({ error: "Please enter the correct Society Code" });
        }

        const emailCheck = await pool.query("SELECT * FROM society WHERE email = $1", [email]);
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ error: "Email is already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const societyResult = await client.query(
            `UPDATE society 
             SET email = $1, password = $2, society_name = $3, no_of_wings = $4, floor_per_wing = $5, rooms_per_floor = $6
             WHERE society_code = $7 RETURNING *`,
            [email, hashedPassword, society_name, no_of_wings, floor_per_wing, rooms_per_floor, society_code]
        );

        const user = societyResult.rows[0];

        // Generate flats
        let flats = [];
        for (let wing = 0; wing < no_of_wings; wing++) {
            let wingName = String.fromCharCode(65 + wing);
            for (let floor = 1; floor <= floor_per_wing; floor++) {
                for (let room = 1; room <= rooms_per_floor; room++) {
                    let flat_id = `${wingName}${floor.toString().padStart(2, "0")}${room.toString().padStart(2, "0")}`;
                    flats.push({ society_code, flat_id });
                }
            }
        }

        const flatInsertQuery = `
            INSERT INTO flat (society_code, flat_id) 
            VALUES ${flats.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",")}
        `;
        const flatInsertValues = flats.flatMap(flat => [flat.society_code, flat.flat_id]);

        await client.query(flatInsertQuery, flatInsertValues);

        // 🔐 Create token
        const token = jwt.sign(
            {
                society_code: user.society_code,
                email: user.email,
                id:user.id
            },
            SECRET_KEY,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            message: "Society and flats registered successfully",
            society_code,
            total_flats: flats.length,
            token,
            user_type:'Society'
        });

    } catch (error) {
        console.error("Error registering society:", error);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});


router.post("/login", async (req, res) => {
    const client = await pool.connect();
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const result = await client.query("SELECT * FROM society WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const user = result.rows[0];
        // console.log(user)
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // 🔐 Generate token
        const token = jwt.sign(
            {
                society_code: user.society_code,
                email: user.email,
                id:user.id
            },
            SECRET_KEY,
            { expiresIn: "7d" }
        );

        res.status(200).json({
            message: "Login successful",
            society_code: user.society_code,
            token,
            user_type:'society'
        });

    } catch (error) {
        console.error("Error logging in society:", error);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});


// fetch society code using email
router.get("/getSocietyCode/:email", async (req, res) => {
    const client = await pool.connect();
    try {
        const { email } = req.params;
        const result = await client.query("SELECT * FROM society WHERE email = $1", [email]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching society code:", error);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});


// GET Flats list
// router.get("/getFlats/:society_code", async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { society_code } = req.params;

//         const result = await client.query("SELECT * FROM flat WHERE society_code = $1", [society_code]);
//         res.status(200).json(result.rows);

//     } catch (error) {
//         console.error("Error fetching flat details:", error);
//         res.status(500).json({ error: "Server error" });
//     } finally {
//         client.release();
//     }
// });

// // GET Owner for a flat
// router.get("/getOwner/:id", async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { id } = req.params;
//         const result = await client.query("SELECT * FROM resident WHERE id = $1", [id]);
//         // console.log('hiiii')
//         // console.log(result.rows)
//         res.status(200).json(result.rows[0]);

//     } catch (error) {
//         console.error("Error fetching owner details:", error);
//         res.status(500).json({ error: "Server error" });
//     } finally {
//         client.release();
//     }
// });

// // GET Resident for a flat
// router.get("/getResident/:id", async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { id } = req.params;

//         const result = await client.query("SELECT * FROM resident WHERE id = $1", [id]);
//         res.status(200).json(result.rows[0]);

//     } catch (error) {
//         console.error("Error fetching resident details:", error);
//         res.status(500).json({ error: "Server error" });
//     } finally {
//         client.release();
//     }
// });


// // SAVE a flat
// router.put("/saveFlat/:id", async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { id } = req.params;
//         const { flat_id, occupancy, owner_id, resident_id } = req.body;

//         const result = await client.query(
//             `UPDATE flat 
//              SET flat_id=$1, occupancy=$2, owner_id=$3, resident_id=$4
//              WHERE id=$5 RETURNING *`,
//             [flat_id, occupancy, owner_id, resident_id, id]
//         );

//         res.status(200).json({
//             message: "Flat details updated successfully",
//             flat: result.rows[0]
//         });

//     } catch (error) {
//         console.error("Error updating flat details:", error);
//         res.status(500).json({ error: "Server error" });
//     } finally {
//         client.release();
//     }
// });

// // CREATE owner
// router.post("/createOwner", async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { society_code, flat_id, name, email, phone, address } = req.body;

//         const result = await client.query(
//             `INSERT INTO resident (name, email, phone, society_code, flat_id, address, is_owner)
//              VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
//             [name, email, phone, society_code, flat_id, address, true]
//         );

//         res.status(201).json({
//             message: "Owner details saved successfully",
//             owner: result.rows[0]
//         });

//     } catch (error) {
//         console.error("Error saving owner details:", error);
//         res.status(500).json({ error: "Server error" });
//     } finally {
//         client.release();
//     }
// });
// // UPDATE owner 
// router.put("/updateOwner/:id", async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { id } = req.params;
//         const { name, email, phone, address } = req.body;

//         const result = await client.query(
//             `UPDATE users 
//              SET name=$1, email=$2, phone=$3, address=$4
//              WHERE id=$5 RETURNING *`,
//             [name, email, phone, address, id]
//         );

//         res.status(200).json({
//             message: "Owner details updated successfully",
//             owner: result.rows[0]
//         });

//     } catch (error) {
//         console.error("Error updating owner details:", error);
//         res.status(500).json({ error: "Server error" });
//     } finally {
//         client.release();
//     }
// });

// // CREATE resident
// router.post("/createResident", async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { society_code, flat_id, name, email, phone, address } = req.body;

//         const result = await client.query(
//             `INSERT INTO resident (name, email, phone, society_code, flat_id, is_owner)
//              VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
//             [name, email, phone, society_code, flat_id, false]
//         );

//         res.status(201).json({
//             message: "Resident details saved successfully",
//             resident: result.rows[0]
//         });

//     } catch (error) {
//         console.error("Error saving resident details:", error);
//         res.status(500).json({ error: "Server error" });
//     } finally {
//         client.release();
//     }
// });
// // UPDATE resident
// router.put("/updateResident/:id", async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const { id } = req.params;
//         const { name, email, phone, address } = req.body;

//         const result = await client.query(
//             `UPDATE users 
//              SET name=$1, email=$2, phone=$3, address=$4
//              WHERE id=$5 RETURNING *`,
//             [name, email, phone, address, id]
//         );

//         res.status(200).json({
//             message: "Resident details updated successfully",
//             resident: result.rows[0]
//         });

//     } catch (error) {
//         console.error("Error updating resident details:", error);
//         res.status(500).json({ error: "Server error" });
//     } finally {
//         client.release();
//     }
// });


function generatePassword(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}";
    let password = "";
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

function isValidEmail(email) {
    return /^\S+@\S+\.\S+$/.test(email);
}

function isValidPhone(phone) {
    return /^\d{10}$/.test(phone);
}


// *****************************************************************
router.get("/getFlatsData/:society_code", async (req, res) => {
    const client = await pool.connect();
    try {
        const { society_code } = req.params;

        // Get all flats for the society
        const flatsResult = await client.query("SELECT * FROM flat WHERE society_code = $1", [society_code]);
        const flats = flatsResult.rows;

        // For each flat, fetch owner and resident details
        const flatsWithDetails = await Promise.all(flats.map(async (flat) => {
            let ownerDetails = null;
            let residentDetails = null;

            // Fetch owner details if owner_id exists
            if (flat.owner_id) {
                const ownerResult = await client.query("SELECT * FROM resident WHERE id = $1", [flat.owner_id]);
                ownerDetails = ownerResult.rows[0] || null;
            }

            // Fetch resident details if resident_id exists
            if (flat.resident_id) {
                const residentResult = await client.query("SELECT * FROM resident WHERE id = $1", [flat.resident_id]);
                residentDetails = residentResult.rows[0] || null;
            }

            return {
                ...flat,
                owner: ownerDetails,
                resident: residentDetails
            };
        }));

        res.status(200).json(flatsWithDetails);

    } catch (error) {
        console.error("Error fetching flat details:", error);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});


router.post('/saveFlatsData', async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            id,
            society_code,
            flat_id,
            occupancy,
            owner_id,
            resident_id,
            owner_name,
            owner_email,
            owner_phone,
            owner_address,
            resident_name,
            resident_email,
            resident_phone,
            resident_address
        } = req.body;

        let updatedOwnerId = owner_id;
        let updatedResidentId = resident_id;


        // Basic validations
        if (owner_email && !isValidEmail(owner_email)) {
            return res.status(400).json({ error: "Invalid owner email format" });
        }

        if (owner_phone && !isValidPhone(owner_phone)) {
            return res.status(400).json({ error: "Owner phone must be exactly 10 digits" });
        }

        if (occupancy === 'Rented') {
            if (resident_email && !isValidEmail(resident_email)) {
                return res.status(400).json({ error: "Invalid resident email format" });
            }

            if (resident_phone && !isValidPhone(resident_phone)) {
                return res.status(400).json({ error: "Resident phone must be exactly 10 digits" });
            }
        }


        // === Check for duplicate owner email ===
        if (owner_email) {
            const existingOwner = await client.query(
                `SELECT id FROM resident WHERE email = $1`,
                [owner_email]
            );

            if (existingOwner.rows.length > 0 && existingOwner.rows[0].id !== owner_id) {
                return res.status(400).json({ error: `Email already exists.` });
            }
        }

        // === Check for duplicate resident email ===
        if (occupancy === 'Rented' && resident_email) {
            const existingResident = await client.query(
                `SELECT id FROM resident WHERE email = $1`,
                [resident_email]
            );

            if (existingResident.rows.length > 0 && existingResident.rows[0].id !== resident_id) {
                return res.status(400).json({ error: `Email already exists.` });
            }
        }

        // === Handle Owner ===
        if (owner_name && owner_email) {
            if (owner_id) {
                await client.query(
                    `UPDATE resident 
                     SET name=$1, email=$2, phone=$3, address=$4
                     WHERE id=$5`,
                    [owner_name, owner_email, owner_phone, owner_address, owner_id]
                );
            } else {
                const owner_password = generatePassword(10);
                const ownerResult = await client.query(
                    `INSERT INTO resident (name, email, phone, society_code, flat_id, address, is_owner, initial_password)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                    [owner_name, owner_email, owner_phone, society_code, flat_id, owner_address, true, owner_password]
                );
                updatedOwnerId = ownerResult.rows[0].id;
            }
        }

        // === Handle Resident ===
        if (occupancy === 'Rented' && resident_name && resident_email) {
            if (resident_id) {
                await client.query(
                    `UPDATE resident 
                     SET name=$1, email=$2, phone=$3, address=$4
                     WHERE id=$5`,
                    [resident_name, resident_email, resident_phone, resident_address || null, resident_id]
                );
            } else {
                const resident_password = generatePassword(8);
                const residentResult = await client.query(
                    `INSERT INTO resident (name, email, phone, society_code, flat_id, address, is_owner, initial_password)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                    [resident_name, resident_email, resident_phone, society_code, flat_id, resident_address || null, false, resident_password]
                );
                updatedResidentId = residentResult.rows[0].id;
            }
        } else {
            updatedResidentId = null;
        }

        // === Update Flat ===
        const flatResult = await client.query(
            `UPDATE flat 
             SET flat_id=$1, occupancy=$2, owner_id=$3, resident_id=$4
             WHERE id=$5 RETURNING *`,
            [flat_id, occupancy, updatedOwnerId, updatedResidentId, id]
        );

        res.status(200).json({
            message: "Flat details updated successfully",
            flat: flatResult.rows[0],
            owner_id: updatedOwnerId,
            resident_id: updatedResidentId
        });

    } catch (error) {
        console.error("Error updating flat details:", error);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});



// CREATE flat
router.post("/createFlat", async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            society_code,
            flat_id,
            occupancy,
            owner_name,
            owner_email,
            owner_phone,
            owner_address,
            resident_name,
            resident_email,
            resident_phone,
            resident_address
        } = req.body;

        if (owner_email && !isValidEmail(owner_email)) {
            return res.status(400).json({ error: "Invalid owner email format" });
        }
        
        if (owner_phone && !isValidPhone(owner_phone)) {
            return res.status(400).json({ error: "Owner phone must be exactly 10 digits" });
        }
        
        if (resident_email && !isValidEmail(resident_email)) {
            return res.status(400).json({ error: "Invalid resident email format" });
        }
        
        if (resident_phone && !isValidPhone(resident_phone)) {
            return res.status(400).json({ error: "Resident phone must be exactly 10 digits" });
        }
        

        await client.query('BEGIN');

        // Check if owner email already exists
        if (owner_email) {
            const ownerCheck = await client.query(
                `SELECT * FROM resident WHERE email = $1`,
                [owner_email]
            );
            if (ownerCheck.rows.length > 0) {
                throw { code: "EMAIL_EXISTS", type: "owner", email: owner_email };
            }
        }

        // Check if resident email already exists
        if (resident_email) {
            const residentCheck = await client.query(
                `SELECT * FROM resident WHERE email = $1`,
                [resident_email]
            );
            if (residentCheck.rows.length > 0) {
                throw { code: "EMAIL_EXISTS", type: "resident", email: resident_email };
            }
        }

        // Insert the flat
        const flatResult = await client.query(
            `INSERT INTO flat (flat_id, occupancy, society_code)
             VALUES ($1, $2, $3) RETURNING *`,
            [flat_id, occupancy, society_code]
        );
        const flat = flatResult.rows[0];

        let ownerId = null;
        let residentId = null;

        if (owner_name && owner_email) {
            const owner_password = generatePassword(10);
            const ownerResult = await client.query(
                `INSERT INTO resident (name, email, phone, society_code, flat_id, address, is_owner, initial_password)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [owner_name, owner_email, owner_phone, society_code, flat_id, owner_address, true, owner_password]
            );
            ownerId = ownerResult.rows[0].id;
        }

        if (occupancy === 'Rented' && resident_name && resident_email) {
            const resident_password = generatePassword(8);
            const residentResult = await client.query(
                `INSERT INTO resident (name, email, phone, society_code, flat_id, address, is_owner, initial_password)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [resident_name, resident_email, resident_phone, society_code, flat_id, resident_address || null, false, resident_password]
            );
            residentId = residentResult.rows[0].id;
        }

        await client.query(
            `UPDATE flat 
             SET owner_id = $1, resident_id = $2
             WHERE id = $3`,
            [ownerId, residentId, flat.id]
        );

        await client.query('COMMIT');

        const completeFlat = await getCompleteFlatData(client, flat.id);

        res.status(201).json({
            message: "Flat created successfully",
            flat: completeFlat
        });

    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === "EMAIL_EXISTS") {
            return res.status(400).json({
                error: 'Email already exists.'
            });
        }

        console.error("Error creating flat:", error);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});


// Helper function to get complete flat data
async function getCompleteFlatData(client, flatId) {
    const flatResult = await client.query(
        `SELECT * FROM flat WHERE id = $1`, 
        [flatId]
    );
    const flat = flatResult.rows[0];

    let owner = null;
    let resident = null;

    if (flat.owner_id) {
        const ownerResult = await client.query(
            `SELECT * FROM resident WHERE id = $1`, 
            [flat.owner_id]
        );
        owner = ownerResult.rows[0];
    }

    if (flat.resident_id) {
        const residentResult = await client.query(
            `SELECT * FROM resident WHERE id = $1`, 
            [flat.resident_id]
        );
        resident = residentResult.rows[0];
    }

    return {
        ...flat,
        owner,
        resident
    };
}


module.exports = router;
