const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const {
  Course,
  Session,
  Attendance,
  SessionClass,
  CourseStats,
  Class,
  Student,
} = require("../models");
const { Op } = require("sequelize");
const redis = require("../config/redis");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const QRCode = require("qrcode");

// Run cleanup before each session
router.use(async (req, res, next) => {
  await cleanupExpiredSessions();
  next();
});

// GET teacher courses and classes under that course
router.get("/courses", auth(["teacher"]), async (req, res) => {
  try {
    const courses = await Course.findAll({
      where: { teacherId: req.user.id },
      include: [
        {
          model: Class,
          through: {
            attributes: ["totalClasses"], // from CourseStats
          },
        },
      ],
    });

    res.json({ success: true, courses });
  } catch (err) {
    console.error("Teacher Courses Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// POST start a session
router.post("/start", auth(["teacher"]), async (req, res) => {
  try {
    const { courseId, classIds, duration = 3 } = req.body; //duration in minutes

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + duration * 60000);

    const session = await Session.create({
      id: uuidv4(),
      courseId,
      teacherId: req.user.id,
      startTime,
      endTime,
      active: true,
    });

    //store session -> class
    for (const classId of classIds) {
      await SessionClass.create({
        id: uuidv4(),
        sessionId: session.id,
        classId,
      });

      //incrementing total for each class
      await CourseStats.increment("totalClasses", {
        where: { courseId, classId },
      });
    }

    // redis store cache for fast access
    await redis.set(
      `activeSession:${session.id}`,
      JSON.stringify({
        teacherId: req.user.id,
        courseId,
        classIds,
        startTime,
        endTime,
      }),
      "EX",
      duration * 60 + 20 // expire after duration + time for end session message
    );

    res.json({ success: true, session });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// GET QR (generate dynamic QR token)
router.get("/:sessionId/qr", auth(["teacher"]), async (req, res) => {
  try {
    const { sessionId } = req.params;

    const sessionActive = await redis.get(`activeSession:${sessionId}`);
    if (!sessionActive)
      return res.status(400).json({
        success: false,
        message: "Session is inactive or has expired",
      });

    const nonce = uuidv4();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 500; // QR expiry 500 seconds
    const qrPayload = { sessionId, nonce, iat, exp };
    const qrToken = jwt.sign(qrPayload, process.env.QR_JWT_SECRET);

    await redis.set(
      `qr:${nonce}`,
      JSON.stringify({ sessionId, iat, exp }),
      "EX",
      520 // 500 seconds + 20 extra seconds in redis
    ); // Store nonce with 65 seconds expiry

    const qrImage = await QRCode.toDataURL(qrToken);
    res.json({
      success: true,
      qrImage,
      qrToken,
      validFrom: iat * 1000,
      validTo: exp * 1000,
    });
  } catch (error) {
    console.error("QR generation Error: ", error);
    res.status(500).json({ success: false, message: "QR generation Error" });
  }
});

//GET live attendance
router.get("/:sessionId/live", auth(["teacher"]), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentIds = await redis.smembers(`liveAttendance:${sessionId}`);

    const students = await Student.findAll({
      where: { id: studentIds },
      attributes: ["id", "firstName", "lastName", "MIS"],
    });

    res.json({
      success: true,
      presentStudents: students,
    });
  } catch (error) {
    console.error("Live attendance Error: ", error);
    res.status(500).json({
      success: false,
      message: "Live attendance Error",
    });
  }
});

// GET all students marked or not
router.get("/:sessionId/students", auth(["teacher"]), async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Fetch session
    const session = await Session.findByPk(sessionId, {
      include: [{ model: Class, through: SessionClass }],
    });

    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    // Extract all classIds for this session
    const classIds = session.Classes.map((cls) => cls.id);

    if (!classIds.length) return res.json({ success: true, students: [] });

    // Fetch ALL students in these classes  ⬅ FIXED HERE
    const students = await Student.findAll({
      where: { classId: { [Op.in]: classIds } },
      attributes: [
        "id",
        "firstName",
        "lastName",
        "MIS",
        "department",
        "branch",
        "classId",
      ],
      include: [{ model: Class, as: "class" }],
    });

    // Fetch attendance data
    const attendance = await Attendance.findAll({
      where: { sessionId },
    });

    const presentMap = {};
    attendance.forEach((a) => (presentMap[a.studentId] = true));

    // Build response
    const list = students.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      MIS: s.MIS,
      department: s.department,
      branch: s.branch,
      class: {
        id: s.class?.id,
        name: s.class?.name,
        code: s.class?.code,
      },
      present: !!presentMap[s.id], // True if in attendance table
    }));

    return res.json({ success: true, students: list });
  } catch (error) {
    console.error("GET SESSION STUDENTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching session students",
    });
  }
});

// POST bulk mark students present
router.post("/:sessionId/mark", auth(["teacher"]), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { marked = [], unmarked = [] } = req.body;

    // Validate input
    if (!Array.isArray(marked) || !Array.isArray(unmarked)) {
      return res.status(400).json({
        success: false,
        message: "marked and unmarked must be arrays",
      });
    }

    // SESSION CHECK
    const session = await Session.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Allowed classes for this session
    const allowedClasses = await SessionClass.findAll({
      where: { sessionId },
      attributes: ["classId"],
    });

    const allowedClassIds = allowedClasses.map((c) => c.classId);

    let markedStudents = [];
    let unmarkedStudents = [];

    // ------------------------------------
    // 1️⃣ PROCESS MARKED STUDENTS
    // ------------------------------------
    if (marked.length > 0) {
      const markList = await Student.findAll({
        where: { id: marked },
      });

      for (const student of markList) {
        if (!allowedClassIds.includes(student.classId)) continue;

        await Attendance.findOrCreate({
          where: { sessionId, studentId: student.id },
          defaults: { markedAt: new Date() },
        });

        await redis.sadd(`liveAttendance:${sessionId}`, student.id);

        markedStudents.push({
          id: student.id,
          MIS: student.MIS,
          name: `${student.firstName} ${student.lastName}`,
        });
      }
    }

    // ------------------------------------
    // 2️⃣ PROCESS UNMARKED STUDENTS (DELETE)
    // ------------------------------------
    if (unmarked.length > 0) {
      const unmarkList = await Student.findAll({
        where: { id: unmarked },
      });

      for (const student of unmarkList) {
        if (!allowedClassIds.includes(student.classId)) continue;

        await Attendance.destroy({
          where: { sessionId, studentId: student.id },
        });

        await redis.srem(`liveAttendance:${sessionId}`, student.id);

        unmarkedStudents.push({
          id: student.id,
          MIS: student.MIS,
          name: `${student.firstName} ${student.lastName}`,
        });
      }
    }

    return res.json({
      success: true,
      message: "Attendance updated successfully",
      summary: {
        markedCount: markedStudents.length,
        unmarkedCount: unmarkedStudents.length,
        marked: markedStudents,
        unmarked: unmarkedStudents,
      },
    });
  } catch (error) {
    console.error("BULK MARK/UNMARK STUDENTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating attendance",
    });
  }
});

//POST extend session
// POST extend session
router.post("/:sessionId/extend", auth(["teacher"]), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { extraMinutes } = req.body;

    const session = await Session.findByPk(sessionId);
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    // Reactivate if previously ended
    if (!session.active) {
      session.active = true;
    }

    // Extend endTime
    const newEnd = new Date(session.endTime.getTime() + extraMinutes * 60000);
    session.endTime = newEnd;
    await session.save();

    // Extend Redis TTL
    const ttl = await redis.ttl(`activeSession:${sessionId}`);
    if (ttl > 0) {
      await redis.expire(`activeSession:${sessionId}`, ttl + extraMinutes * 60);
    } else {
      // Redis key expired → recreate it
      await redis.set(
        `activeSession:${sessionId}`,
        JSON.stringify({
          teacherId: session.teacherId,
          courseId: session.courseId,
          classIds: [], // or refetch
          startTime: session.startTime,
          endTime: newEnd,
        }),
        "EX",
        extraMinutes * 60
      );
    }

    return res.json({
      success: true,
      message: "Session extended",
      newEnd,
    });
  } catch (error) {
    console.error("Extend session Error: ", error);
    res.status(500).json({ success: false, message: "Extend session Error" });
  }
});

// Post end session
router.post("/:sessionId/end", auth(["teacher"]), async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findByPk(sessionId);

    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    // If already inactive → do nothing but return OK
    if (!session.active) {
      return res.json({
        success: true,
        message: "Session already ended",
      });
    }

    // Mark inactive
    session.active = false;
    session.endTime = new Date();
    await session.save();

    // Flush Redis live attendance to DB
    const studentIds = await redis.smembers(`liveAttendance:${sessionId}`);
    for (const sid of studentIds) {
      await Attendance.findOrCreate({
        where: { sessionId, studentId: sid },
        defaults: { markedAt: new Date() },
      });
    }

    // Cleanup Redis
    await redis.del(`activeSession:${sessionId}`);
    await redis.del(`liveAttendance:${sessionId}`);

    return res.json({
      success: true,
      message: "Session closed successfully",
    });
  } catch (error) {
    console.error("End session Error: ", error);
    res.status(500).json({ success: false, message: "End session Error" });
  }
});

// Auto Cleanup of expired sessions
async function cleanupExpiredSessions() {
  try {
    const now = new Date();
    const expiredSessions = await Session.findAll({
      where: {
        active: true,
        endTime: { [Op.lt]: now },
      },
    });
    for (const session of expiredSessions) {
      session.active = false;
      await session.save();
      const studentIds = await redis.smembers(`liveAttendance:${session.id}`);
      for (const sid of studentIds) {
        await Attendance.findOrCreate({
          where: { sessionId: session.id, studentId: sid },
          defaults: { markedAt: new Date() },
        });
      }
      // Clean Redis
      await redis.del(`activeSession:${session.id}`);
      await redis.del(`liveAttendance:${session.id}`);
      //console.log(`Cleaned up expired session ${session.id}`);
    }
  } catch (error) {
    console.error("Cleanup Error: ", error);
  }
}

module.exports = router;
