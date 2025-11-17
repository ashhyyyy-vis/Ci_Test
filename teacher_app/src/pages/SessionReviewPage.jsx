import { useEffect, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/axios";
import { AuthContext } from "@/context/AuthContext";

export default function SessionReviewPage() {
  const { sessionId } = useParams();
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [original, setOriginal] = useState([]); // keep snapshot of original for comparison
  const [editedRows, setEditedRows] = useState({});
  const [summary, setSummary] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ------------------------------
  // FETCH STUDENT LIST
  // ------------------------------
  const fetchStudents = async () => {
    try {
      const res = await api.get(`/teacher/sessions/${sessionId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setStudents(res.data.students || []);
      setOriginal(JSON.parse(JSON.stringify(res.data.students))); // deep clone
    } catch (err) {
      console.error("STUDENT FETCH ERROR:", err);
    }

    setLoading(false);
  };

  // ------------------------------
  // TOGGLE PRESENT / ABSENT
  // ------------------------------
  const togglePresence = (id) => {
    const originalStu = original.find((s) => s.id === id);
    const updatedStu = students.find((s) => s.id === id);

    const newValue = !updatedStu.present;

    // toggle in list
    setStudents((prev) =>
      prev.map((stu) => (stu.id === id ? { ...stu, present: newValue } : stu))
    );

    // detect if changed from original
    const changed = originalStu.present !== newValue;

    setEditedRows((prev) => ({
      ...prev,
      [id]: changed,
    }));
  };

  // ------------------------------
  // SAVE FINAL ATTENDANCE
  // ------------------------------
  const saveAttendance = async () => {
    setSaving(true);

    const payload = {
      marked: [], // changed → present = true
      unmarked: [], // changed → present = false
    };

    students.forEach((stu) => {
      if (!editedRows[stu.id]) return;

      if (stu.present) {
        payload.marked.push(stu.id);
      } else {
        payload.unmarked.push(stu.id);
      }
    });

    try {
      const res = await api.post(
        `/teacher/sessions/${sessionId}/mark`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSummary(res.data.summary);
    } catch (err) {
      console.error("SAVE ERROR:", err);
      alert("Failed to save attendance.");
    }

    setSaving(false);
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-10">
      <h1 className="text-3xl font-bold mb-6">Session Review</h1>

      {loading ? (
        <p>Loading students...</p>
      ) : (
        <div className="bg-white shadow-xl rounded-xl p-6">
          {/* ------------------------- SUMMARY BOX ------------------------- */}
          {summary && (
            <div className="mb-6 p-5 rounded-lg bg-green-100 border border-green-300">
              <p className="font-bold text-xl text-green-800">
                Attendance Updated Successfully!
              </p>

              <div className="mt-3">
                <p className="font-semibold text-green-900">
                  Marked Present: {summary.markedCount}
                </p>
                {summary.marked.length > 0 && (
                  <ul className="mt-2 ml-4 list-disc text-sm">
                    {summary.marked.map((s) => (
                      <li key={s.id}>
                        <b>{s.MIS}</b> — {s.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-3">
                <p className="font-semibold text-red-900">
                  Marked Absent: {summary.unmarkedCount}
                </p>
                {summary.unmarked.length > 0 && (
                  <ul className="mt-2 ml-4 list-disc text-sm">
                    {summary.unmarked.map((s) => (
                      <li key={s.id}>
                        <b>{s.MIS}</b> — {s.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                onClick={() => navigate("/home")}
                className="mt-5 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go to Home
              </button>
            </div>
          )}

          {/* ------------------------- STUDENT TABLE ------------------------- */}
          {!summary && (
            <>
              <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left w-20">Present</th>
                      <th className="p-3 text-left">MIS</th>
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Class</th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((stu) => (
                      <tr
                        key={stu.id}
                        className={`border-b transition ${
                          editedRows[stu.id] ? "bg-yellow-50" : "bg-white"
                        }`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={stu.present}
                            onChange={() => togglePresence(stu.id)}
                            className="w-5 h-5 cursor-pointer"
                          />
                        </td>

                        <td className="p-3 font-bold">{stu.MIS}</td>
                        <td className="p-3 text-gray-700">
                          {stu.firstName} {stu.lastName}
                        </td>
                        <td className="p-3 text-gray-600 text-sm">
                          {stu.class?.name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* SAVE BUTTON */}
              <div className="text-center mt-6">
                <button
                  onClick={saveAttendance}
                  disabled={saving}
                  className="px-8 py-3 rounded-lg bg-blue-600 text-white text-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? "Saving..." : "Save Attendance"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
