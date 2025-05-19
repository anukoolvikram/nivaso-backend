const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../models/db");

const router = express.Router();

const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.SECRET_KEY;

router.post("/login", async (req, res) => {
    const client = await pool.connect();
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const result = await client.query("SELECT * FROM resident WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const user = result.rows[0];

        // Case 1: first-time login with initial_password
        if (user.password === null) { 
            if (password.trim().normalize() === user.initial_password.trim().normalize()) {

                // Generate token
                const token = jwt.sign({
                    id: user.id,
                    email: user.email,
                    society_code: user.society_code
                }, SECRET_KEY, { expiresIn: "7d" });
                
                
                // Optional: Set cookie (for session-like usage)
                // res.cookie("token", token, {
                //     httpOnly: true,
                //     secure: process.env.NODE_ENV === "production",
                //     sameSite: "strict",
                //     maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                // });

                return res.status(200).json({
                    message: "Login successful",
                    society_code: user.society_code,
                    token,
                    user_type:"resident"
                });
            } else {
                return res.status(400).json({ error: "Invalid credentials" });
            }
        }

        // Case 2: login with hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // Generate token
        const token = jwt.sign({
            id: user.id,
            email: user.email,
            society_code: user.society_code
        }, SECRET_KEY, { expiresIn: "7d" });

        // Optional: Set cookie (like session)
        // res.cookie("token", token, {
        //     httpOnly: true,
        //     secure: process.env.NODE_ENV === "production",
        //     sameSite: "strict",
        //     maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        // });

        res.status(200).json({
            message: "Login successful",
            society_code: user.society_code,
            token,
            user_type:"resident"
        });

    } catch (error) {
        console.error("Error logging in resident:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    } finally {
        client.release();
    }
});



module.exports = router;
