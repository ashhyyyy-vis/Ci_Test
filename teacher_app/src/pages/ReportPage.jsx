import { useContext, useEffect, useState } from "react";
import api from "@/lib/axios";
import { AuthContext } from "@/context/AuthContext";

export default function ReportPage() {
  const { token } = useContext(AuthContext);

  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);

  // selections
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);

  // table operations
  const [percentageFilter, setPercentageFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("asc"); // asc | desc

  useEffect(() => {
    const loadReport = async () => {
      try {
        const res = await api.get("/teacher/report", {
          headers: { Authorization: `Bearer ${token}` },
        });

        setReport(res.data.report || []);
      } catch (err) {
        console.error("Report Fetch Error:", err);
      }
      setLoading(false);
    };

    loadReport();
  }, []);

  // Filter + sort logic
  const getFilteredStudents = () => {
    if (!selectedClass) return [];

    let students = [...selectedClass.students];

    // Filter by percentage
    if (percentageFilter !== "") {
      const min = parseFloat(percentageFilter);
      if (!isNaN(min)) {
        students = students.filter((s) => s.percentage <= min);
      }
    }

    // Sort
    students.sort((a, b) =>
      sortOrder === "asc"
        ? a.percentage - b.percentage
        : b.percentage - a.percentage
    );

    return students;
  };

  if (loading) return <p className="p-10 text-lg">Loading report...</p>;

  return (
    <div className="min-h-screen p-10 bg-gray-100">
      <h1 className="text-3xl font-bold mb-8">Attendance Report</h1>

      <div className="flex gap-8">
        {/* ------------------ LEFT: Course List ------------------ */}
        <div className="w-1/4 bg-white p-5 rounded-xl shadow-xl">
          <h2 className="text-xl font-semibold mb-4">Courses</h2>

          {report.map((course) => (
            <div
              key={course.courseId}
              onClick={() => {
                setSelectedCourse(course);
                setSelectedClass(null);
              }}
              className={`p-3 rounded cursor-pointer border mb-2 transition ${
                selectedCourse?.courseId === course.courseId
                  ? "bg-blue-100 border-blue-500"
                  : "bg-gray-50 border-gray-300 hover:bg-gray-100"
              }`}
            >
              <p className="font-bold">{course.courseName}</p>
              <p className="text-sm text-gray-600">{course.courseCode}</p>
            </div>
          ))}
        </div>

        {/* ------------------ MIDDLE: Class List ------------------ */}
        <div className="w-1/3 bg-white p-5 rounded-xl shadow-xl">
          <h2 className="text-xl font-semibold mb-4">Classes</h2>

          {!selectedCourse ? (
            <p className="text-gray-500">Select a course</p>
          ) : (
            selectedCourse.classes.map((cls) => (
              <div
                key={cls.classId}
                onClick={() => setSelectedClass(cls)}
                className={`p-3 rounded cursor-pointer border mb-3 transition ${
                  selectedClass?.classId === cls.classId
                    ? "bg-green-100 border-green-500"
                    : "bg-gray-50 border-gray-300 hover:bg-gray-100"
                }`}
              >
                <p className="font-semibold">{cls.className}</p>
                <p className="text-sm text-gray-600">
                  Total Classes: <b>{cls.totalClasses}</b>
                </p>
              </div>
            ))
          )}
        </div>

        {/* ------------------ RIGHT: Student Table ------------------ */}
        <div className="flex-1 bg-white p-6 rounded-xl shadow-xl">
          <h2 className="text-xl font-semibold mb-4">Student Attendance</h2>

          {!selectedClass ? (
            <p className="text-gray-500">Select a class</p>
          ) : (
            <>
              {/* Filter + Sort */}
              <div className="flex gap-4 mb-4">
                <input
                  type="number"
                  placeholder="Filter % <= value"
                  value={percentageFilter}
                  onChange={(e) => setPercentageFilter(e.target.value)}
                  className="border p-2 rounded w-48"
                />

                <button
                  onClick={() =>
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Sort: {sortOrder === "asc" ? "Low → High" : "High → Low"}
                </button>
              </div>

              {/* TABLE */}
              <div className="overflow-y-auto max-h-[60vh] border rounded">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">MIS</th>
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Present</th>
                      <th className="p-3 text-left">Total</th>
                      <th className="p-3 text-left">Percentage</th>
                    </tr>
                  </thead>

                  <tbody>
                    {getFilteredStudents().map((stu) => (
                      <tr key={stu.id} className="border-b">
                        <td className="p-3 font-bold">{stu.MIS}</td>
                        <td className="p-3">
                          {stu.firstName} {stu.lastName}
                        </td>
                        <td className="p-3">{stu.present}</td>
                        <td className="p-3">{stu.total}</td>
                        <td
                          className={`p-3 font-semibold ${
                            stu.percentage < 40
                              ? "text-red-600"
                              : stu.percentage < 75
                              ? "text-yellow-600"
                              : "text-green-700"
                          }`}
                        >
                          {stu.percentage.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
