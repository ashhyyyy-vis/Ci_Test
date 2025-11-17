import { useEffect, useState, useContext, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/axios";
import { AuthContext } from "@/context/AuthContext";

export default function SessionPage() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  // QR state
  const [qrImage, setQrImage] = useState(null);
  const [qrExpiry, setQrExpiry] = useState(null);
  const [qrRemaining, setQrRemaining] = useState(null);

  // Session state
  const [sessionEndTime, setSessionEndTime] = useState(null);
  const [sessionRemaining, setSessionRemaining] = useState(null);

  // Live attendance
  const [presentStudents, setPresentStudents] = useState([]);

  // When session ends
  const [sessionEnded, setSessionEnded] = useState(false);

  // Extend session UI
  const [extendMinutes, setExtendMinutes] = useState(5);
  const [extending, setExtending] = useState(false);

  // Refs
  const qrIntervalRef = useRef(null);
  const sessionIntervalRef = useRef(null);
  const liveIntervalRef = useRef(null);

  // -----------------------------
  // FETCH QR
  // -----------------------------
  const fetchQr = async () => {
    try {
      const res = await api.get(`/teacher/sessions/${sessionId}/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setQrImage(res.data.qrImage);
      setQrExpiry(res.data.validTo);
    } catch (err) {
      console.error("QR ERROR:", err);
    }
  };

  // -----------------------------
  // FETCH LIVE
  // -----------------------------
  const fetchLive = async () => {
    try {
      const res = await api.get(`/teacher/sessions/${sessionId}/live`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setPresentStudents(res.data.presentStudents || []);
    } catch (err) {
      console.error("LIVE ERROR:", err);
    }
  };

  // -----------------------------
  // EXTEND SESSION
  // -----------------------------
  const extendSession = async () => {
    try {
      setExtending(true);

      const res = await api.post(
        `/teacher/sessions/${sessionId}/extend`,
        { extraMinutes: extendMinutes },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const newEndUTC = new Date(res.data.newEnd).getTime();
      setSessionEndTime(newEndUTC);

      // Restart countdown
      setSessionEnded(false);

      setExtending(false);
      alert("Session extended successfully!");
    } catch (err) {
      console.error("EXTEND ERROR:", err);
      setExtending(false);
    }
  };

  // -----------------------------
  // END SESSION NOW
  // -----------------------------
  const endSessionNow = async () => {
    try {
      await api.post(
        `/teacher/sessions/${sessionId}/end`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSessionEnded(true);
    } catch (err) {
      console.error("END ERROR:", err);
    }
  };

  // -----------------------------
  // INITIAL LOAD
  // -----------------------------
  useEffect(() => {
    fetchQr();
    fetchLive();

    const state = location.state?.session;
    if (state?.endTime) {
      setSessionEndTime(new Date(state.endTime).getTime());
    }

    // QR countdown
    qrIntervalRef.current = setInterval(() => {
      if (!qrExpiry) return;
      const now = Date.now();
      const left = Math.max(Math.floor((qrExpiry - now) / 1000), 0);
      setQrRemaining(left);

      if (left <= 0) fetchQr();
    }, 1000);

    // Session countdown
    sessionIntervalRef.current = setInterval(() => {
      if (!sessionEndTime) return;
      const now = Date.now();
      const left = Math.max(Math.floor((sessionEndTime - now) / 1000), 0);
      setSessionRemaining(left);

      if (left <= 0) {
        clearInterval(sessionIntervalRef.current);
        setSessionEnded(true);
      }
    }, 1000);

    // Live attendance every 5 sec
    liveIntervalRef.current = setInterval(fetchLive, 5000);

    return () => {
      clearInterval(qrIntervalRef.current);
      clearInterval(sessionIntervalRef.current);
      clearInterval(liveIntervalRef.current);
    };
  }, [qrExpiry, sessionEndTime]);

  const format = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen p-10 bg-gray-100 flex gap-6">
      {/* LEFT — LIVE ATTENDANCE */}
      <div className="w-1/3">
        <div className="bg-white h-full p-4 shadow-xl rounded-xl overflow-y-auto">
          <h2 className="text-xl font-semibold mb-3">Live Attendance</h2>

          {presentStudents.length === 0 ? (
            <p className="text-gray-500">No students yet...</p>
          ) : (
            <ul className="space-y-3">
              {presentStudents.map((stu) => (
                <li
                  key={stu.id}
                  className="p-3 bg-green-50 border border-green-300 rounded-lg shadow-sm"
                >
                  <p className="font-bold text-lg">{stu.MIS}</p>
                  <p className="text-sm text-gray-700">
                    {stu.firstName} {stu.lastName}
                  </p>
                  {stu.Class && (
                    <p className="text-xs text-gray-500 mt-1">
                      {stu.Class.name}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* CENTER — QR */}
      <div className="flex-1 flex flex-col items-center">
        <div className="bg-white p-6 shadow-xl rounded-xl">
          {qrImage ? (
            <img src={qrImage} className="w-[420px] h-[420px]" />
          ) : (
            <p>Loading QR...</p>
          )}
        </div>

        {sessionEnded && (
          <div className="mt-8 text-center">
            <p className="text-red-600 font-bold text-xl mb-4">Session Ended</p>

            <div className="flex gap-4 justify-center">
              {/* Extend Session */}
              <div className="bg-white p-4 rounded-xl shadow-md">
                <p className="text-sm mb-2 font-medium">
                  Extend Session By (mins)
                </p>

                <select
                  className="border p-2 rounded w-32"
                  value={extendMinutes}
                  onChange={(e) => setExtendMinutes(Number(e.target.value))}
                >
                  {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} min
                    </option>
                  ))}
                </select>

                <button
                  onClick={extendSession}
                  disabled={extending}
                  className="mt-3 w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  {extending ? "Extending..." : "Extend"}
                </button>
              </div>

              {/* Review Page */}
              <button
                onClick={() => navigate(`/session/${sessionId}/review`)}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg shadow hover:bg-blue-700"
              >
                Go to Review
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT — TIMERS */}
      <div className="w-1/4">
        <div className="bg-white p-4 shadow-xl rounded-xl">
          <h2 className="text-xl font-semibold mb-4">Timers</h2>

          <p className="text-lg">
            <b>Session Ends In:</b>
            <br />
            <span className="text-red-600">
              {sessionRemaining !== null ? format(sessionRemaining) : "..."}
            </span>
          </p>

          <p className="text-lg mt-6">
            <b>QR Refresh In:</b>
            <br />
            <span className="text-blue-600">
              {qrRemaining !== null ? `${qrRemaining}s` : "..."}
            </span>
          </p>

          {!sessionEnded && (
            <button
              onClick={endSessionNow}
              className="mt-6 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 w-full"
            >
              End Session Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
