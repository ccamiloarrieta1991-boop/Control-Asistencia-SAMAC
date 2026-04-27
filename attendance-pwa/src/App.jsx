import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, PieChart, Pie, Cell, ResponsiveContainer
} from "recharts";
import * as XLSX from "xlsx";

// ─── Constants ────────────────────────────────────────────────────────────────
const GRADES = ["Kinder","1° Grado","2° Grado","3° Grado","4° Grado","5° Grado","6° Grado"];
const STATUSES = {
  present: { label:"Asistió",    short:"A", color:"#22c55e", bg:"#dcfce7", text:"#15803d" },
  absent:  { label:"No Asistió", short:"F", color:"#ef4444", bg:"#fee2e2", text:"#b91c1c" },
  excused: { label:"Excusa",     short:"E", color:"#f59e0b", bg:"#fef3c7", text:"#b45309" },
  late:    { label:"Tarde",      short:"T", color:"#8b5cf6", bg:"#ede9fe", text:"#6d28d9" },
  none:    { label:"Sin marcar", short:"—", color:"#94a3b8", bg:"#f1f5f9", text:"#64748b" },
};
const STATUS_KEYS = ["present","absent","excused","late"];
const TODAY = new Date().toISOString().slice(0,10);

// ─── Week helpers ─────────────────────────────────────────────────────────────
function getWeekDates(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon); x.setDate(mon.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

// Returns the dates within the week (of refDate) where the student was absent
function getWeekAbsentDates(studentId, grade, records, refDate) {
  return getWeekDates(refDate).filter(d =>
    records[`${grade}||${d}`]?.[studentId] === "absent"
  );
}

function weekLabel(dateStr) {
  const dates = getWeekDates(dateStr);
  const fmt = d => new Date(d + "T12:00:00").toLocaleDateString("es-ES",{ weekday:"short", day:"2-digit", month:"short" });
  return `${fmt(dates[0])} → ${fmt(dates[6])}`;
}

function fmtDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-ES",{ weekday:"long", day:"numeric", month:"long" });
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const buildDefault = () => { const d = {}; GRADES.forEach(g => { d[g] = []; }); return d; };

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT MODAL — shown when 2nd absence is detected in same week
// ═══════════════════════════════════════════════════════════════════════════════
function AbsenceAlertModal({ alert, onClose }) {
  if (!alert) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.modalIcon}>🚨</div>
        <h2 style={S.modalTitle}>Alerta de Inasistencias</h2>
        <p style={S.modalStudent}>{alert.name}</p>
        <p style={S.modalGrade}>{alert.grade}</p>

        <div style={S.modalAlert}>
          <strong>{alert.absCount} inasistencias</strong> registradas esta semana
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={S.modalSubLabel}>Fechas de falta:</p>
          {alert.absDates.map(d => (
            <div key={d} style={S.modalDateChip}>
              📅 {fmtDate(d)}
            </div>
          ))}
        </div>

        <p style={S.modalNote}>
          {alert.absCount === 2
            ? "Este estudiante acaba de alcanzar 2 inasistencias en la misma semana."
            : `Este estudiante lleva ${alert.absCount} inasistencias en la semana.`}
        </p>

        <button onClick={onClose} style={S.modalBtn}>Entendido</button>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState("attendance");
  const [students, setStudents] = useState(() => load("att-students", buildDefault()));
  const [records,  setRecords]  = useState(() => load("att-records",  {}));
  const [absenceAlert, setAbsenceAlert] = useState(null); // { name, grade, absCount, absDates }
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  const persistStudents = useCallback((s) => { setStudents(s); save("att-students", s); }, []);

  // Save records and check if any student just hit 2 absences this week
  const persistRecords = useCallback((newRecords, triggerInfo) => {
    setRecords(newRecords);
    save("att-records", newRecords);
    // triggerInfo = { studentId, studentName, grade, date } when marking a single student
    if (triggerInfo) {
      const { studentId, studentName, grade, date } = triggerInfo;
      const absDates = getWeekAbsentDates(studentId, grade, newRecords, date);
      if (absDates.length >= 2) {
        setAbsenceAlert({ name: studentName, grade, absCount: absDates.length, absDates });
      }
    }
  }, []);

  // Count students with 2+ absences this week across all grades (for badge)
  const alertCount = (() => {
    let n = 0;
    GRADES.forEach(g => {
      (students[g] || []).forEach(s => {
        if (getWeekAbsentDates(s.id, g, records, TODAY).length >= 2) n++;
      });
    });
    return n;
  })();

  const tabs = [
    { id:"attendance", icon:"✏️", label:"Asistencia" },
    { id:"students",   icon:"👥", label:"Estudiantes" },
    { id:"report",     icon:"📋", label:"Reporte" },
    { id:"chart",      icon:"📊", label:"Gráficas" },
    { id:"alerts",     icon:"🚨", label:"Alertas", badge: alertCount },
  ];

  return (
    <div style={S.app}>
      {/* Global absence alert modal */}
      <AbsenceAlertModal alert={absenceAlert} onClose={() => setAbsenceAlert(null)} />

      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.headerLogo}>
            <span style={{ fontSize:32 }}>🏫</span>
            <div>
              <div style={S.headerTitle}>Control de Asistencia</div>
              <div style={S.headerSub}>Sistema Escolar</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <div style={S.headerDate}>
              📅 {new Date().toLocaleDateString("es-ES",{ weekday:"short", day:"numeric", month:"short", year:"numeric" })}
            </div>
            {installPrompt && !installed && (
              <button onClick={handleInstall} style={S.installBtn}>📲 Instalar App</button>
            )}
          </div>
        </div>
      </header>

      <nav style={S.nav}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...S.navBtn, ...(tab===t.id ? S.navActive : {}) }}>
            <span>{t.icon}</span>
            <span style={S.navLabel}>{t.label}</span>
            {t.badge > 0 && <span style={S.navBadge}>{t.badge}</span>}
          </button>
        ))}
      </nav>

      <main style={S.main}>
        {tab==="attendance" && <TabAttendance students={students} records={records} onSave={persistRecords} />}
        {tab==="students"   && <TabStudents   students={students} onSave={persistStudents} />}
        {tab==="report"     && <TabReport     students={students} records={records} />}
        {tab==="chart"      && <TabChart      students={students} records={records} />}
        {tab==="alerts"     && <TabAlerts     students={students} records={records} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: ASISTENCIA
// ═══════════════════════════════════════════════════════════════════════════════
function TabAttendance({ students, records, onSave }) {
  const [grade, setGrade] = useState(GRADES[0]);
  const [date, setDate]   = useState(TODAY);
  const [toast, setToast] = useState("");

  const list      = students[grade] || [];
  const key       = `${grade}||${date}`;
  const dayRecord = records[key] || {};

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const setStatus = (student, status) => {
    // Toggle off if same status clicked
    const newStatus = dayRecord[student.id] === status ? undefined : status;
    const newDay = { ...dayRecord };
    if (newStatus === undefined) delete newDay[student.id]; else newDay[student.id] = newStatus;
    const updated = { ...records, [key]: newDay };

    // Pass trigger info only when marking as absent (so modal can fire)
    const trigger = newStatus === "absent"
      ? { studentId: student.id, studentName: student.name, grade, date }
      : null;
    onSave(updated, trigger);
  };

  const markAll = (status) => {
    const newDay = {};
    list.forEach(s => { newDay[s.id] = status; });
    onSave({ ...records, [key]: newDay }, null);
    showToast(`✅ Todos marcados como "${STATUSES[status].label}"`);
  };

  const exportDay = () => {
    const rows = list.map(s => ({
      "Nombre": s.name, "Grado": grade, "Fecha": date,
      "Estado": STATUSES[dayRecord[s.id] || "none"].label,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asistencia");
    XLSX.writeFile(wb, `asistencia_${grade.replace(/[°\s]/g,"")}_${date}.xlsx`);
    showToast("📥 Archivo Excel descargado");
  };

  const counts = STATUS_KEYS.reduce((acc, s) => {
    acc[s] = list.filter(st => dayRecord[st.id] === s).length; return acc;
  }, {});
  const unmarked = list.length - STATUS_KEYS.reduce((a, s) => a + counts[s], 0);

  // Pre-compute week absences per student for inline indicators
  const weekAbsMap = {};
  list.forEach(s => {
    weekAbsMap[s.id] = getWeekAbsentDates(s.id, grade, records, date).length;
  });

  return (
    <div style={S.tabContent}>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.card}>
        <div style={S.row}>
          <div style={{ flex:1 }}>
            <label style={S.label}>Grado</label>
            <select value={grade} onChange={e => setGrade(e.target.value)} style={S.select}>
              {GRADES.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ flex:1 }}>
            <label style={S.label}>Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={S.input} />
          </div>
        </div>

        <div style={S.pills}>
          {STATUS_KEYS.map(s => (
            <div key={s} style={{ ...S.pill, background:STATUSES[s].bg, color:STATUSES[s].text }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:STATUSES[s].color, display:"inline-block", marginRight:4 }}/>
              {STATUSES[s].label}: <b style={{ marginLeft:4 }}>{counts[s]}</b>
            </div>
          ))}
          {unmarked > 0 && (
            <div style={{ ...S.pill, background:"#f1f5f9", color:"#64748b" }}>Sin marcar: <b style={{ marginLeft:4 }}>{unmarked}</b></div>
          )}
        </div>

        <div style={{ ...S.row, marginTop:14, paddingTop:14, borderTop:"1px solid #f1f5f9", flexWrap:"wrap" }}>
          <span style={{ fontSize:13, fontWeight:600, color:"#64748b", alignSelf:"center" }}>Marcar todos:</span>
          {STATUS_KEYS.map(s => (
            <button key={s} onClick={() => markAll(s)}
              style={{ ...S.massBtn, background:STATUSES[s].bg, color:STATUSES[s].text, border:`1.5px solid ${STATUSES[s].color}` }}>
              {STATUSES[s].short} {STATUSES[s].label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>👨‍🎓 {grade}</span>
          <span style={{ fontSize:13, color:"#94a3b8" }}>{list.length} estudiantes</span>
        </div>
        {list.length === 0 ? (
          <p style={S.empty}>No hay estudiantes. Agrégalos en la pestaña 👥</p>
        ) : list.map((student, i) => {
          const status  = dayRecord[student.id] || "none";
          const weekAbs = weekAbsMap[student.id];
          const isAlert = weekAbs >= 2;
          const isWarn  = weekAbs === 1;
          return (
            <div key={student.id} style={{
              ...S.studentRow,
              background: isAlert ? "#fff5f5" : isWarn ? "#fffbeb" : i%2===0 ? "#fafafa" : "#fff",
              borderLeft: isAlert ? "4px solid #ef4444" : isWarn ? "4px solid #f59e0b" : "4px solid transparent",
            }}>
              <span style={S.studentNum}>{i+1}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={S.studentName}>{student.name}</div>
                {isAlert && (
                  <span style={S.alertChip}>🚨 {weekAbs} faltas esta semana</span>
                )}
                {isWarn && (
                  <span style={S.warnChip}>⚠️ 1 falta — próxima activa alerta</span>
                )}
              </div>
              <div style={S.statusBtns}>
                {STATUS_KEYS.map(s => (
                  <button key={s} onClick={() => setStatus(student, s)}
                    style={{
                      ...S.statusBtn,
                      background: status===s ? STATUSES[s].color : "#f1f5f9",
                      color: status===s ? "#fff" : "#94a3b8",
                      boxShadow: status===s ? `0 2px 8px ${STATUSES[s].color}55` : "none",
                      transform: status===s ? "scale(1.1)" : "scale(1)",
                    }}>
                    {STATUSES[s].short}
                  </button>
                ))}
              </div>
              <span style={{ ...S.badge, background:STATUSES[status].bg, color:STATUSES[status].text }}>
                {STATUSES[status].label}
              </span>
            </div>
          );
        })}
      </div>

      <div style={S.actions}>
        <button onClick={() => showToast("💾 Asistencia guardada")} style={S.btnPrimary}>💾 Guardar</button>
        <button onClick={exportDay} style={S.btnSecondary}>📥 Exportar Excel</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: ALERTAS
// ═══════════════════════════════════════════════════════════════════════════════
function TabAlerts({ students, records }) {
  const [refDate, setRefDate] = useState(TODAY);
  const [grade, setGrade]     = useState("all");

  const weekDates = getWeekDates(refDate);

  const prevWeek = () => {
    const d = new Date(refDate + "T12:00:00"); d.setDate(d.getDate()-7);
    setRefDate(d.toISOString().slice(0,10));
  };
  const nextWeek = () => {
    const d = new Date(refDate + "T12:00:00"); d.setDate(d.getDate()+7);
    setRefDate(d.toISOString().slice(0,10));
  };

  const gradesToScan = grade === "all" ? GRADES : [grade];

  // Students with 2+ absences this week (in alert)
  const alertRows = [];
  // Students with exactly 1 absence this week (in observation)
  const warnRows = [];

  gradesToScan.forEach(g => {
    (students[g] || []).forEach(s => {
      const absDates = weekDates.filter(d => records[`${g}||${d}`]?.[s.id] === "absent");
      if (absDates.length >= 2) alertRows.push({ ...s, grade:g, absCount:absDates.length, absDates });
      else if (absDates.length === 1) warnRows.push({ ...s, grade:g, absDate:absDates[0] });
    });
  });

  const exportAlerts = () => {
    const rows = alertRows.map(s => ({
      "Nombre":s.name, "Grado":s.grade,
      "Inasistencias":s.absCount,
      "Semana":weekLabel(refDate),
      "Fechas":s.absDates.join(", "),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alertas");
    XLSX.writeFile(wb, `alertas_${refDate}.xlsx`);
  };

  return (
    <div style={S.tabContent}>
      {/* Header info */}
      <div style={{ ...S.card, background:"linear-gradient(135deg,#1e293b,#334155)", color:"#fff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:36 }}>🚨</span>
          <div>
            <div style={{ fontFamily:"'Fraunces',serif", fontSize:18, fontWeight:800 }}>Monitor de Inasistencias</div>
            <div style={{ fontSize:13, opacity:0.7, marginTop:4 }}>
              Alerta automática al registrar <b>2 inasistencias</b> en la misma semana
            </div>
          </div>
        </div>
      </div>

      {/* Week navigator + grade filter */}
      <div style={S.card}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={prevWeek} style={S.weekNavBtn}>◀</button>
            <span style={{ fontWeight:600, fontSize:14, color:"#1e293b", whiteSpace:"nowrap" }}>
              {weekLabel(refDate)}
            </span>
            <button onClick={nextWeek} style={S.weekNavBtn}>▶</button>
            <button onClick={() => setRefDate(TODAY)}
              style={{ ...S.weekNavBtn, fontSize:11, padding:"5px 10px", color:"#0ea5e9", borderColor:"#bae6fd" }}>
              Hoy
            </button>
          </div>
          <select value={grade} onChange={e => setGrade(e.target.value)} style={{ ...S.select, maxWidth:200 }}>
            <option value="all">— Todos los grados —</option>
            {GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>

        {/* Day strip */}
        <div style={{ display:"flex", gap:4, marginTop:12 }}>
          {weekDates.map(d => {
            const isToday = d === TODAY;
            const isPast  = d < TODAY;
            return (
              <div key={d} style={{
                flex:1, textAlign:"center", padding:"6px 2px", borderRadius:8,
                background: isToday ? "#0ea5e9" : isPast ? "#f1f5f9" : "#fff",
                border: isToday ? "none" : "1px solid #e2e8f0",
                color: isToday ? "#fff" : isPast ? "#64748b" : "#94a3b8",
                fontSize:11, fontWeight:600,
              }}>
                <div style={{ textTransform:"capitalize" }}>
                  {new Date(d+"T12:00:00").toLocaleDateString("es-ES",{ weekday:"short" })}
                </div>
                <div style={{ fontSize:15, fontWeight:700, marginTop:2 }}>{d.slice(8)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {alertRows.length === 0 && warnRows.length === 0 && (
        <div style={{ ...S.card, textAlign:"center", padding:48 }}>
          <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:17, fontWeight:700, color:"#1e293b" }}>Sin alertas esta semana</div>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:6 }}>
            Ningún estudiante tiene 2 o más inasistencias en {weekLabel(refDate)}
          </div>
        </div>
      )}

      {/* 🚨 Alert cards */}
      {alertRows.length > 0 && (
        <div style={S.card}>
          <div style={S.cardHeader}>
            <div>
              <span style={{ ...S.cardTitle, color:"#ef4444" }}>
                🚨 En alerta — {alertRows.length} estudiante{alertRows.length>1?"s":""}
              </span>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:3 }}>
                2 o más inasistencias esta semana
              </div>
            </div>
            <button onClick={exportAlerts} style={S.btnSecondary}>📥 Excel</button>
          </div>

          {alertRows.map((s, i) => (
            <div key={s.id} style={{
              display:"flex", alignItems:"center", gap:14, padding:"14px 12px",
              borderRadius:10, marginBottom:6,
              background: i%2===0 ? "#fff5f5" : "#fff",
              border:"1px solid #fecaca",
            }}>
              <div style={{ fontSize:28, flexShrink:0 }}>🚨</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, color:"#1e293b" }}>{s.name}</div>
                <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{s.grade}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:7 }}>
                  {s.absDates.map(d => (
                    <span key={d} style={{
                      fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:12,
                      background:"#fee2e2", color:"#b91c1c",
                    }}>
                      📅 {new Date(d+"T12:00:00").toLocaleDateString("es-ES",{ weekday:"short", day:"numeric", month:"short" })}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign:"center", flexShrink:0 }}>
                <div style={{ fontSize:34, fontWeight:900, color:"#ef4444", lineHeight:1 }}>{s.absCount}</div>
                <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>faltas</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ⚠️ Observation cards */}
      {warnRows.length > 0 && (
        <div style={S.card}>
          <div style={S.cardHeader}>
            <div>
              <span style={{ ...S.cardTitle, color:"#b45309" }}>
                ⚠️ En observación — {warnRows.length} estudiante{warnRows.length>1?"s":""}
              </span>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:3 }}>
                1 inasistencia — una más activa la alerta
              </div>
            </div>
          </div>
          {warnRows.map((s, i) => (
            <div key={s.id} style={{
              display:"flex", alignItems:"center", gap:14, padding:"12px 12px",
              borderRadius:10, marginBottom:6,
              background: i%2===0 ? "#fffbeb" : "#fff",
              border:"1px solid #fde68a",
            }}>
              <div style={{ fontSize:26, flexShrink:0 }}>⚠️</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, color:"#1e293b" }}>{s.name}</div>
                <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{s.grade}</div>
                <span style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:12, background:"#fef3c7", color:"#b45309", display:"inline-block", marginTop:6 }}>
                  📅 {new Date(s.absDate+"T12:00:00").toLocaleDateString("es-ES",{ weekday:"short", day:"numeric", month:"short" })}
                </span>
              </div>
              <div style={{ textAlign:"center", flexShrink:0 }}>
                <div style={{ fontSize:34, fontWeight:900, color:"#f59e0b", lineHeight:1 }}>1</div>
                <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>falta</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: ESTUDIANTES
// ═══════════════════════════════════════════════════════════════════════════════
function TabStudents({ students, onSave }) {
  const [grade, setGrade]     = useState(GRADES[0]);
  const [newName, setNewName] = useState("");
  const [search, setSearch]   = useState("");
  const [importing, setImporting] = useState(false);
  const [toast, setToast]         = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const list     = students[grade] || [];
  const filtered = list.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const addStudent = () => {
    const name = newName.trim(); if (!name) return;
    onSave({ ...students, [grade]: [...list, { id:`${grade}-${Date.now()}`, name }] });
    setNewName(""); showToast(`✅ "${name}" agregado`);
  };

  const removeStudent = (id) => onSave({ ...students, [grade]: list.filter(s => s.id !== id) });

  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb   = XLSX.read(evt.target.result, { type:"binary" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header:1 });
        const headers  = data[0]?.map(h => String(h).toLowerCase().trim()) || [];
        const nameIdx  = headers.findIndex(h => h.includes("nombre") || h.includes("name"));
        const gradeIdx = headers.findIndex(h => h.includes("grado") || h.includes("grade"));
        if (nameIdx === -1) { showToast("❌ No se encontró columna 'Nombre'"); setImporting(false); return; }
        const ns = { ...students }; let count=0, skipped=0;
        data.slice(1).forEach(row => {
          const name = String(row[nameIdx]||"").trim(); if (!name) return;
          const tg   = gradeIdx !== -1 ? String(row[gradeIdx]||"").trim() : grade;
          const mg   = GRADES.find(g => g.toLowerCase()===tg.toLowerCase()) || grade;
          if (!ns[mg]) ns[mg]=[];
          if (ns[mg].some(s => s.name.toLowerCase()===name.toLowerCase())) { skipped++; return; }
          ns[mg] = [...ns[mg], { id:`${mg}-${Date.now()}-${count}`, name }]; count++;
        });
        onSave(ns);
        showToast(`✅ ${count} importados${skipped>0?`, ${skipped} duplicados omitidos`:""}`);
      } catch { showToast("❌ Error al leer el archivo"); }
      setImporting(false); e.target.value="";
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Nombre","Grado"],["Ana García","1° Grado"],["Luis Martínez","2° Grado"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estudiantes");
    XLSX.writeFile(wb, "plantilla_estudiantes.xlsx");
    showToast("📥 Plantilla descargada");
  };

  return (
    <div style={S.tabContent}>
      {toast && <div style={S.toast}>{toast}</div>}
      <div style={{ ...S.card, background:"linear-gradient(135deg,#f0f9ff,#e0f2fe)", border:"1.5px solid #bae6fd" }}>
        <div style={S.cardTitle}>📥 Importar desde Excel</div>
        <p style={{ fontSize:13, color:"#475569", margin:"8px 0 14px" }}>
          Sube un archivo <b>.xlsx</b> con columnas <b>Nombre</b> y <b>Grado</b>.
        </p>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <label style={{ ...S.btnPrimary, display:"inline-block", cursor:"pointer" }}>
            {importing ? "⏳ Procesando…" : "📂 Seleccionar archivo"}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ display:"none" }} />
          </label>
          <button onClick={downloadTemplate} style={S.btnSecondary}>📋 Descargar plantilla</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.row}>
          <div style={{ flex:1 }}>
            <label style={S.label}>Grado</label>
            <select value={grade} onChange={e => { setGrade(e.target.value); setSearch(""); }} style={S.select}>
              {GRADES.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ flex:2 }}>
            <label style={S.label}>Buscar</label>
            <input placeholder="Buscar por nombre…" value={search} onChange={e => setSearch(e.target.value)} style={S.input} />
          </div>
        </div>
        <div style={{ ...S.row, marginTop:12 }}>
          <input placeholder="Nombre del nuevo estudiante…" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key==="Enter" && addStudent()}
            style={{ ...S.input, flex:1 }} />
          <button onClick={addStudent} style={S.btnPrimary}>➕ Agregar</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>👥 {grade}</span>
          <span style={{ fontSize:13, color:"#94a3b8" }}>{list.length} estudiantes</span>
        </div>
        {filtered.length === 0 ? (
          <p style={S.empty}>{search ? "Sin resultados." : "No hay estudiantes."}</p>
        ) : filtered.map((s, i) => (
          <div key={s.id} style={{ ...S.studentRow, background:i%2===0?"#fafafa":"#fff", borderLeft:"4px solid transparent" }}>
            <span style={S.studentNum}>{i+1}</span>
            <span style={{ ...S.studentName, flex:1 }}>{s.name}</span>
            <button onClick={() => removeStudent(s.id)} style={S.deleteBtn}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: REPORTE
// ═══════════════════════════════════════════════════════════════════════════════
function TabReport({ students, records }) {
  const [grade, setGrade] = useState(GRADES[0]);
  const [from,  setFrom]  = useState(() => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); });
  const [to,    setTo]    = useState(TODAY);
  const [view,  setView]  = useState("summary");

  const list  = students[grade] || [];
  const dates = (() => {
    const arr=[]; const cur=new Date(from); const end=new Date(to);
    while(cur<=end){ arr.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
    return arr;
  })();

  const stats = list.map(s => {
    const c = { present:0, absent:0, excused:0, late:0, none:0 };
    dates.forEach(d => { const st=records[`${grade}||${d}`]?.[s.id]||"none"; c[st]++; });
    const recorded=dates.length-c.none;
    const pct=recorded>0?Math.round((c.present+c.late)/recorded*100):null;
    return { ...s, ...c, total:dates.length, recorded, pct };
  });

  const exportReport = () => {
    const rows=stats.map(s=>({ "Nombre":s.name,"Grado":grade,"Desde":from,"Hasta":to,
      "Asistió":s.present,"No Asistió":s.absent,"Excusa":s.excused,"Tarde":s.late,
      "Sin Marcar":s.none,"% Asistencia":s.pct!==null?`${s.pct}%`:"N/A" }));
    const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Reporte");
    XLSX.writeFile(wb,`reporte_${grade.replace(/[°\s]/g,"")}_${from}_${to}.xlsx`);
  };

  const pctColor = p => p===null?"#94a3b8":p>=90?"#22c55e":p>=75?"#f59e0b":"#ef4444";

  return (
    <div style={S.tabContent}>
      <div style={S.card}>
        <div style={S.row}>
          <div style={{ flex:1 }}><label style={S.label}>Grado</label>
            <select value={grade} onChange={e=>setGrade(e.target.value)} style={S.select}>
              {GRADES.map(g=><option key={g}>{g}</option>)}</select></div>
          <div style={{ flex:1 }}><label style={S.label}>Desde</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.input}/></div>
          <div style={{ flex:1 }}><label style={S.label}>Hasta</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.input}/></div>
        </div>
        <div style={{ ...S.row, marginTop:10, justifyContent:"space-between" }}>
          <div style={{ display:"flex", gap:8 }}>
            <span style={S.pillGray}>📅 {dates.length} días</span>
            <span style={S.pillGray}>👥 {list.length} estudiantes</span>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {["summary","detail"].map(v=>(
              <button key={v} onClick={()=>setView(v)}
                style={{ ...S.toggleBtn, ...(view===v?S.toggleActive:{}) }}>
                {v==="summary"?"Resumen":"Detalle"}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>📋 {grade}</span>
          <button onClick={exportReport} style={S.btnSecondary}>📥 Excel</button>
        </div>
        <div style={{ overflowX:"auto" }}>
          {view==="summary" ? (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>#</th>
                <th style={{ ...S.th, textAlign:"left" }}>Estudiante</th>
                {STATUS_KEYS.map(s=><th key={s} style={{ ...S.th, color:STATUSES[s].text }}>{STATUSES[s].short}</th>)}
                <th style={S.th}>S/M</th><th style={S.th}>%</th>
              </tr></thead>
              <tbody>{stats.map((s,i)=>(
                <tr key={s.id} style={{ background:i%2===0?"#fafafa":"#fff" }}>
                  <td style={S.td}>{i+1}</td>
                  <td style={{ ...S.td, textAlign:"left", fontWeight:500 }}>{s.name}</td>
                  {STATUS_KEYS.map(sk=><td key={sk} style={{ ...S.td, color:STATUSES[sk].text, fontWeight:600 }}>{s[sk]}</td>)}
                  <td style={{ ...S.td, color:"#94a3b8" }}>{s.none}</td>
                  <td style={S.td}><span style={{ ...S.badge, background:pctColor(s.pct)+"22", color:pctColor(s.pct) }}>
                    {s.pct!==null?`${s.pct}%`:"—"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={{ ...S.th, textAlign:"left", position:"sticky", left:0, background:"#f8fafc", zIndex:1 }}>Estudiante</th>
                {dates.map(d=><th key={d} style={{ ...S.th, fontSize:10, whiteSpace:"nowrap" }}>{d.slice(5)}</th>)}
              </tr></thead>
              <tbody>{list.map((s,i)=>(
                <tr key={s.id} style={{ background:i%2===0?"#fafafa":"#fff" }}>
                  <td style={{ ...S.td, textAlign:"left", fontWeight:500, whiteSpace:"nowrap", position:"sticky", left:0, background:i%2===0?"#fafafa":"#fff" }}>{s.name}</td>
                  {dates.map(d=>{ const st=records[`${grade}||${d}`]?.[s.id]||"none"; return (
                    <td key={d} style={{ ...S.td, padding:"4px 2px" }}>
                      <span style={{ ...S.badge, background:STATUSES[st].bg, color:STATUSES[st].text, padding:"2px 6px", fontSize:11 }}>
                        {STATUSES[st].short}</span></td>
                  );})}
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: GRÁFICAS
// ═══════════════════════════════════════════════════════════════════════════════
function TabChart({ students, records }) {
  const [grade, setGrade] = useState(GRADES[0]);
  const [focus, setFocus] = useState("all");
  const [type,  setType]  = useState("bar");
  const [from,  setFrom]  = useState(() => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); });
  const [to,    setTo]    = useState(TODAY);
  const list  = students[grade] || [];
  const dates = (() => {
    const arr=[]; const cur=new Date(from); const end=new Date(to);
    while(cur<=end){ arr.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
    return arr;
  })();
  const barData = list.map(s => {
    const row={name:s.name.split(" ")[0]}; STATUS_KEYS.forEach(sk=>{row[sk]=0;});
    dates.forEach(d=>{const st=records[`${grade}||${d}`]?.[s.id]; if(st) row[st]++;}); return row;
  });
  const pieData = (() => {
    const c={present:0,absent:0,excused:0,late:0};
    const targets=focus==="all"?list:list.filter(s=>s.id===focus);
    targets.forEach(s=>dates.forEach(d=>{const st=records[`${grade}||${d}`]?.[s.id]; if(st&&c[st]!==undefined) c[st]++;}));
    return STATUS_KEYS.filter(sk=>c[sk]>0).map(sk=>({name:STATUSES[sk].label,value:c[sk],color:STATUSES[sk].color}));
  })();
  const summary = (() => {
    const c={present:0,absent:0,excused:0,late:0};
    list.forEach(s=>dates.forEach(d=>{const st=records[`${grade}||${d}`]?.[s.id]; if(st&&c[st]!==undefined) c[st]++;})); return c;
  })();
  return (
    <div style={S.tabContent}>
      <div style={S.card}>
        <div style={S.row}>
          <div style={{ flex:1 }}><label style={S.label}>Grado</label>
            <select value={grade} onChange={e=>{setGrade(e.target.value);setFocus("all");}} style={S.select}>
              {GRADES.map(g=><option key={g}>{g}</option>)}</select></div>
          <div style={{ flex:1 }}><label style={S.label}>Desde</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.input}/></div>
          <div style={{ flex:1 }}><label style={S.label}>Hasta</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.input}/></div>
        </div>
        <div style={S.row}>
          <div style={{ flex:2 }}><label style={S.label}>Estudiante</label>
            <select value={focus} onChange={e=>setFocus(e.target.value)} style={S.select}>
              <option value="all">— Todos —</option>
              {list.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div style={{ flex:1 }}><label style={S.label}>Tipo</label>
            <select value={type} onChange={e=>setType(e.target.value)} style={S.select}>
              <option value="bar">Barras</option><option value="pie">Pastel</option></select></div>
        </div>
      </div>
      <div style={S.summaryGrid}>
        {STATUS_KEYS.map(sk=>(
          <div key={sk} style={{ ...S.summaryCard, borderTop:`4px solid ${STATUSES[sk].color}` }}>
            <div style={{ fontSize:30,fontWeight:800,color:STATUSES[sk].color }}>{summary[sk]}</div>
            <div style={{ fontSize:12,color:"#64748b",marginTop:4 }}>{STATUSES[sk].label}</div>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <div style={S.cardTitle}>{type==="bar"?"📊 Por Estudiante":"🥧 Distribución"}</div>
        <div style={{ marginTop:16 }}>
          {type==="bar" ? (
            barData.length===0?<p style={S.empty}>Sin datos.</p>:(
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData} margin={{top:5,right:10,bottom:60,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="name" tick={{fontSize:11}} angle={-35} textAnchor="end" interval={0}/>
                  <YAxis tick={{fontSize:11}}/><Tooltip/><Legend/>
                  {STATUS_KEYS.map(sk=><Bar key={sk} dataKey={sk} name={STATUSES[sk].label} fill={STATUSES[sk].color} radius={[3,3,0,0]}/>)}
                </BarChart>
              </ResponsiveContainer>
            )
          ) : (
            pieData.length===0?<p style={S.empty}>Sin datos.</p>:(
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}
                    label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                    {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                  </Pie><Tooltip/><Legend/>
                </PieChart>
              </ResponsiveContainer>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  app: { minHeight:"100vh", background:"#f0f4f8", paddingBottom:24 },
  header: { background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", color:"#fff", padding:"14px 20px", boxShadow:"0 4px 20px rgba(0,0,0,0.2)" },
  headerInner: { display:"flex", alignItems:"center", justifyContent:"space-between", maxWidth:960, margin:"0 auto", flexWrap:"wrap", gap:10 },
  headerLogo: { display:"flex", alignItems:"center", gap:12 },
  headerTitle: { fontFamily:"'Fraunces',serif", fontSize:20, fontWeight:800 },
  headerSub: { fontSize:11, opacity:0.6, marginTop:2 },
  headerDate: { fontSize:12, opacity:0.8, background:"rgba(255,255,255,0.1)", padding:"5px 12px", borderRadius:20, textTransform:"capitalize" },
  installBtn: { fontSize:13, fontWeight:600, padding:"7px 14px", borderRadius:20, border:"2px solid #38bdf8", background:"transparent", color:"#7dd3fc", cursor:"pointer" },
  nav: { background:"#fff", borderBottom:"2px solid #e2e8f0", display:"flex", overflowX:"auto", padding:"0 12px" },
  navBtn: { padding:"12px 14px", border:"none", background:"none", cursor:"pointer", fontSize:13, fontFamily:"'DM Sans',sans-serif", fontWeight:500, color:"#64748b", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap", borderBottom:"3px solid transparent", transition:"all 0.2s", flexShrink:0, position:"relative" },
  navActive: { color:"#0ea5e9", borderBottomColor:"#0ea5e9", background:"#f0f9ff" },
  navLabel: { fontSize:13 },
  navBadge: { position:"absolute", top:7, right:4, background:"#ef4444", color:"#fff", fontSize:10, fontWeight:800, minWidth:17, height:17, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px" },
  main: { maxWidth:960, margin:"0 auto", padding:"20px 14px" },
  tabContent: { display:"flex", flexDirection:"column", gap:14 },
  card: { background:"#fff", borderRadius:14, padding:18, boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:"1px solid #e8edf2" },
  cardHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 },
  cardTitle: { fontFamily:"'Fraunces',serif", fontSize:17, fontWeight:700, color:"#1e293b" },
  row: { display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" },
  label: { display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" },
  select: { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:14, background:"#fff", color:"#1e293b", outline:"none" },
  input: { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:14, color:"#1e293b", outline:"none", boxSizing:"border-box" },
  pills: { display:"flex", flexWrap:"wrap", gap:7, marginTop:12 },
  pill: { fontSize:12, fontWeight:500, padding:"4px 11px", borderRadius:20, display:"flex", alignItems:"center" },
  pillGray: { fontSize:12, color:"#64748b", background:"#f1f5f9", padding:"4px 11px", borderRadius:20 },
  massBtn: { fontSize:12, fontWeight:600, padding:"6px 12px", borderRadius:20, cursor:"pointer", transition:"all 0.15s" },
  studentRow: { display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:8, marginBottom:2, transition:"background 0.2s" },
  studentNum: { width:24, textAlign:"center", fontSize:11, color:"#94a3b8", fontWeight:600, flexShrink:0 },
  studentName: { fontSize:14, fontWeight:500, color:"#1e293b" },
  alertChip: { display:"inline-block", fontSize:11, fontWeight:600, background:"#fee2e2", color:"#b91c1c", padding:"2px 8px", borderRadius:10, marginLeft:8 },
  warnChip:  { display:"inline-block", fontSize:11, fontWeight:600, background:"#fef3c7", color:"#b45309", padding:"2px 8px", borderRadius:10, marginLeft:8 },
  statusBtns: { display:"flex", gap:4, flexShrink:0 },
  statusBtn: { width:32, height:32, borderRadius:7, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, transition:"all 0.15s" },
  badge: { fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:12, whiteSpace:"nowrap" },
  weekNavBtn: { padding:"6px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, background:"#f8fafc", cursor:"pointer", fontSize:14, fontWeight:600, color:"#475569" },
  actions: { display:"flex", gap:10, flexWrap:"wrap" },
  btnPrimary: { padding:"10px 20px", background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontSize:14, fontWeight:600, boxShadow:"0 4px 12px #0ea5e940" },
  btnSecondary: { padding:"10px 20px", background:"#f8fafc", color:"#0ea5e9", border:"2px solid #bae6fd", borderRadius:10, cursor:"pointer", fontSize:14, fontWeight:600 },
  deleteBtn: { background:"none", border:"none", cursor:"pointer", fontSize:17, padding:4, borderRadius:6, opacity:0.6 },
  table: { width:"100%", borderCollapse:"collapse", fontSize:13 },
  th: { padding:"9px 7px", background:"#f8fafc", fontWeight:700, color:"#475569", textAlign:"center", fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", borderBottom:"2px solid #e2e8f0" },
  td: { padding:"9px 7px", textAlign:"center", borderBottom:"1px solid #f1f5f9", color:"#334155" },
  toggleBtn: { padding:"5px 13px", border:"1.5px solid #e2e8f0", borderRadius:8, background:"#f8fafc", cursor:"pointer", fontSize:12, fontWeight:500, color:"#64748b" },
  toggleActive: { background:"#0ea5e9", color:"#fff", borderColor:"#0ea5e9" },
  summaryGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10 },
  summaryCard: { background:"#fff", borderRadius:12, padding:"16px 14px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", textAlign:"center", border:"1px solid #e8edf2" },
  empty: { textAlign:"center", color:"#94a3b8", padding:"28px 0", fontSize:13 },
  toast: { position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"#fff", padding:"12px 22px", borderRadius:24, fontSize:14, fontWeight:500, zIndex:999, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", whiteSpace:"nowrap" },
  // Modal
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, backdropFilter:"blur(4px)" },
  modalBox: { background:"#fff", borderRadius:20, padding:28, maxWidth:380, width:"100%", boxShadow:"0 24px 60px rgba(0,0,0,0.3)", textAlign:"center", animation:"none" },
  modalIcon: { fontSize:52, marginBottom:8 },
  modalTitle: { fontFamily:"'Fraunces',serif", fontSize:22, fontWeight:800, color:"#ef4444", marginBottom:8 },
  modalStudent: { fontSize:18, fontWeight:700, color:"#1e293b", marginBottom:2 },
  modalGrade: { fontSize:13, color:"#64748b", marginBottom:16 },
  modalAlert: { background:"#fee2e2", color:"#b91c1c", borderRadius:12, padding:"12px 16px", fontSize:15, fontWeight:600, marginBottom:16 },
  modalSubLabel: { fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 },
  modalDateChip: { background:"#f1f5f9", color:"#334155", borderRadius:8, padding:"7px 12px", fontSize:13, fontWeight:500, marginBottom:6, textAlign:"left" },
  modalNote: { fontSize:13, color:"#64748b", marginBottom:20, lineHeight:1.5 },
  modalBtn: { width:"100%", padding:"13px", background:"linear-gradient(135deg,#ef4444,#dc2626)", color:"#fff", border:"none", borderRadius:12, cursor:"pointer", fontSize:15, fontWeight:700, fontFamily:"'DM Sans',sans-serif" },
};
