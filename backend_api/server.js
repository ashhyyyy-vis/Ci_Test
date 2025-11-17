const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();
const { sequelize } = require("./models");
const authRoutes = require("./routes/auth");

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Authentication routes
app.use("/api/auth", authRoutes);

// Teacher session routes
const teacherSessionRoutes = require("./routes/teacherSessions");
app.use("/api/teacher/sessions", teacherSessionRoutes);

// Student scan routes
const studentScanRoutes = require("./routes/studentScan");
app.use("/api/student", studentScanRoutes);

// reporting api
app.use("/api/report", require("./routes/report"));

const teacherReportRoutes = require("./routes/teacherReport");
app.use("/api/teacher/report", teacherReportRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", async () => {
  await sequelize.authenticate();
  console.log(`Server is running on 0.0.0.0:${PORT}`);
});
