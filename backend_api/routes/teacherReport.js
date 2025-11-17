const express = require("express");
const { auth } = require("../middleware/authMiddleware");

const {
  Teacher,
  Course,
  Class,
  Student,
  Attendance,
  Session,
  CourseStats,
  SessionClass,
} = require("../models");

const router = express.Router();

// ===============================
// GET /api/teacher/report
// ===============================
router.get("/", auth(["teacher"]), async (req, res) => {
  try {
    const teacherId = req.user.id;

    // 1️⃣ Fetch all courses taught by teacher
    const courses = await Course.findAll({
      where: { teacherId },
      include: [
        {
          model: CourseStats,
          include: [{ model: Class }],
        },
      ],
    });

    const result = [];

    // 2️⃣ Build report for each course
    for (const course of courses) {
      const courseReport = {
        courseId: course.id,
        courseName: course.name,
        courseCode: course.code,
        classes: [],
      };

      // Each CourseStats = a class mapped to this course
      for (const stat of course.CourseStats) {
        const classInfo = stat.Class;

        // 3️⃣ Fetch all students in this class
        const students = await Student.findAll({
          where: { classId: classInfo.id },
          attributes: [
            "id",
            "firstName",
            "lastName",
            "MIS",
            "department",
            "branch",
          ],
        });

        // 4️⃣ Get attendance for this course & class
        const sessions = await Session.findAll({
          where: { courseId: course.id },
          attributes: ["id"],
          include: [
            {
              model: Class,
              where: { Id: classInfo.id },
              through: { attributes: [] },
            },
          ],
        });

        const sessionIds = sessions.map((s) => s.id);

        // Present count per student
        const attendance = await Attendance.findAll({
          where: { sessionId: sessionIds },
        });

        const presentMap = {};
        attendance.forEach((a) => {
          presentMap[a.studentId] = (presentMap[a.studentId] || 0) + 1;
        });

        // 5️⃣ Build student report
        const studentReports = students.map((s) => {
          const present = presentMap[s.id] || 0;
          const total = stat.totalClasses || 0;
          return {
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            MIS: s.MIS,
            department: s.department,
            branch: s.branch,
            present,
            total,
            percentage:
              total === 0 ? 0 : Number(((present / total) * 100).toFixed(2)),
          };
        });

        // Add class info to report
        courseReport.classes.push({
          classId: classInfo.id,
          className: classInfo.name,
          classCode: classInfo.code,
          totalClasses: stat.totalClasses,
          students: studentReports,
        });
      }

      result.push(courseReport);
    }

    return res.json({
      success: true,
      report: result,
    });
  } catch (error) {
    console.error("TEACHER REPORT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error generating teacher report",
    });
  }
});

module.exports = router;
