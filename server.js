const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const path = require('path');
const fs = require('fs');

const authFedRoutes = require("./src/routes/federationRoutes");
const authSocietyRoutes = require("./src/routes/societyRoutes");
const authResidentRoutes = require("./src/routes/residentRoutes");
const blogRoutes=require("./src/routes/communityRoutes")
const noticeRoutes=require("./src/routes/noticeRoutes")
const complaintRoutes=require("./src/routes/complaintRoutes")
const documentRoutes=require("./src/routes/documentRoutes")

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/federation", authFedRoutes);
app.use("/society", authSocietyRoutes);
app.use("/resident", authResidentRoutes);
app.use('/blogs', blogRoutes)
app.use('/notices', noticeRoutes)
app.use('/complaints', complaintRoutes)
app.use('/documents', documentRoutes)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
