const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers["authorization"]?.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Access denied" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // user_type + id + email + society_code
        next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid token" });
    }
};


