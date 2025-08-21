
import React, { useEffect, useMemo, useState } from "react";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a, b) {
  return isoDate(a) === isoDate(b);
}

function weekdayIndex(date) {
  return new Date(date).getDay(); // 0=Sun .. 6=Sat
}

function mondayOfWeek(date) {
  const d = startOfDay(date);
  let day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function roWeekdayShort(idx) {
  return ["D", "Lu", "Ma", "Mi", "Jo", "Vi", "S"][idx];
}

function roLongDate(d) {
  return new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

// Business rules
function rulesFor(date) {
  const wd = weekdayIndex(date);
  if (wd === 0) return { start: 0, end: 0, max: 0, closed: true };
  if (wd === 6) return { start: 9, end: 15, max: 3, closed: false };
  return { start: 8, end: 16, max: 5, closed: false };
}

// Helpers 30-min slots
function halfHourSlots(date) {
  const r = rulesFor(date);
  if (r.closed || r.start >= r.end) return [];
  const slots = [];
  for (let h = r.start; h < r.end; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

function toMinutes(t) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

function workingWindow(date) {
  const r = rulesFor(date);
  return { startMin: r.start * 60, endMin: r.end * 60, slots: (r.end - r.start) * 2 };
}

function buildOccupancy(date, appts) {
  const { startMin, endMin } = workingWindow(date);
  const len = Math.max(0, (endMin - startMin) / 30);
  const occ = new Array(len).fill(false);
  appts.forEach(a => {
    const s = Math.max(toMinutes(a.time), startMin);
    const dur = Math.min(90, Math.max(30, Number(a.duration || 90)));
    const e = Math.min(s + dur, endMin);
    for (let m = s; m < e; m += 30) {
      const idx = Math.floor((m - startMin) / 30);
      if (idx >= 0 && idx < occ.length) occ[idx] = true;
    }
  });
  return occ;
}

function coveragePct(date, appts) {
  const occ = buildOccupancy(date, appts);
  if (occ.length === 0) return 0;
  const filled = occ.filter(Boolean).length;
  return (filled / occ.length) * 100;
}

function isFullyBooked(date, appts) {
  const r = rulesFor(date);
  if (r.closed) return false;
  const occ = buildOccupancy(date, appts);
  const noFree = occ.every(Boolean);
  const maxReached = appts.length >= r.max;
  return noFree || maxReached;
}

const STORAGE_KEY = "nails_scheduler_v2";

export default function App() {
  const [selectedDate, setSelectedDate] = useState(mondayOfWeek(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { try { setAppointments(JSON.parse(raw)); } catch {} }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  }, [appointments]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(mondayOfWeek(selectedDate), i)),
    [selectedDate]
  );

  function apptsForDay(date) {
    const dayIso = isoDate(date);
    return appointments
      .filter(a => a.date === dayIso)
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  }

  function addAppt(appt) { setAppointments(prev => [...prev, appt]); }
  function removeAppt(id) { setAppointments(prev => prev.filter(a => a.id !== id)); }

  return (
    <div>
      <div className="container">
        <header className="row" style={{justifyContent: "space-between", marginBottom: 12}}>
          <h1 className="h1">Organizer programări</h1>
          <div className="row">
            <button className="btn" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>← Săptămâna anterioară</button>
            <button className="btn" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>Săptămâna viitoare →</button>
          </div>
        </header>

        <DayPanel date={selectedDate} appts={apptsForDay(selectedDate)} onAdd={() => setShowAdd(true)} onDelete={removeAppt} />

        <WeekBattery
          weekDays={weekDays}
          selectedDate={selectedDate}
          onSelect={(d) => setSelectedDate(d)}
          apptsProvider={apptsForDay}
        />

        {showAdd && (
          <AddModal
            date={selectedDate}
            existing={apptsForDay(selectedDate)}
            onClose={() => setShowAdd(false)}
            onSave={(payload) => { addAppt(payload); setShowAdd(false); }}
          />
        )}
      </div>
    </div>
  );
}

function DayPanel({ date, appts, onAdd, onDelete }) {
  const r = rulesFor(date);
  const remaining = Math.max(0, r.max - appts.length);
  const full = isFullyBooked(date, appts);
  const pct = coveragePct(date, appts);

  return (
    <section className="card">
      <div className="row" style={{justifyContent:"space-between"}}>
        <div>
          <div className="h2">{roLongDate(date)}</div>
          <div className="badge">{r.closed ? "Zi închisă" : `Program: ${String(r.start).padStart(2,"0")}:00–${String(r.end).padStart(2,"0")}:00`}</div>
        </div>
        <div className="row">
          {!r.closed && <span className="badge">Locuri rămase: <b>{remaining}</b></span>}
          <button className="btn btn-primary" onClick={onAdd} disabled={r.closed || remaining===0 || full}>Adaugă programare</button>
        </div>
      </div>

      {!r.closed && (
        <div style={{display:"flex", justifyContent:"center", marginTop: 12}}>
          <DayClock date={date} appts={appts} />
        </div>
      )}
      {!r.closed && <div className="center" style={{paddingTop:8}}>Umplere: {pct.toFixed(0)}%</div>}

      {appts.length === 0 ? (
        <div className="center">Nicio programare pentru această zi.</div>
      ) : (
        <div className="list">
          {appts.map(a => (
            <div className="list-item" key={a.id}>
              <div className="time">{a.time}{a.duration ? ` (${a.duration}m)` : ""}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700}}>{a.clientName}</div>
                {a.notes && <div className="badge">{a.notes}</div>}
              </div>
              <button className="btn" onClick={() => onDelete(a.id)}>Șterge</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DayClock({ date, appts }) {
  const occ = buildOccupancy(date, appts);
  const full = isFullyBooked(date, appts);
  const pct = coveragePct(date, appts);

  const size = 240;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const segments = Math.max(1, occ.length);

  function arcForIndex(i) {
    const startAngle = (i / segments) * 2 * Math.PI - Math.PI / 2;
    const endAngle = ((i + 1) / segments) * 2 * Math.PI - Math.PI / 2;
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {Array.from({length: segments}).map((_, i) => (
        <path key={`base-${i}`} d={arcForIndex(i)} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
      ))}
      {!full && occ.map((filled, i) => (
        filled ? <path key={`fill-${i}`} d={arcForIndex(i)} stroke="#3b82f6" strokeWidth={stroke} fill="none" /> : null
      ))}
      {full && <circle cx={center} cy={center} r={radius} stroke="#ef4444" strokeWidth={stroke} fill="none" />}
      <text x={center} y={center} textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight="bold">
        {full ? "PLIN" : `${pct.toFixed(0)}%`}
      </text>
    </svg>
  );
}

function WeekBattery({ weekDays, selectedDate, onSelect, apptsProvider }) {
  return (
    <section style={{marginTop: 16}}>
      <div className="badge" style={{marginBottom: 8}}>Săptămâna (rezumat)</div>
      <div className="grid" style={{gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))"}}>
        {weekDays.map((d, idx) => {
          const appts = apptsProvider(d);
          const pct = coveragePct(d, appts);
          const full = isFullyBooked(d, appts);
          const selected = sameDay(d, selectedDate);
          return (
            <button
              key={idx}
              className="card"
              style={{ textAlign: "left", borderColor: selected ? "#93c5fd" : "#e5e7eb" }}
              onClick={() => onSelect(d)}
            >
              <div className="row" style={{justifyContent:"space-between", marginBottom: 8}}>
                <div className="badge"><b>{roWeekdayShort(weekdayIndex(d))}</b> {d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" })}</div>
                <div className="badge">{full ? "Plin" : `${pct.toFixed(0)}%`}</div>
              </div>
              <div className="battery">
                <div className={`battery-fill ${full ? "full": ""}`} style={{width: `${Math.max(0, Math.min(100, pct))}%`}} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AddModal({ date, existing, onClose, onSave }) {
  const occExisting = buildOccupancy(date, existing);

  function canFit(date, startTime, dur, occupancy) {
    const { startMin, endMin } = workingWindow(date);
    const s = toMinutes(startTime);
    const d = Math.min(90, Math.max(30, Number(dur)));
    const e = s + d;
    if (e > endMin) return false;
    for (let m = s; m < e; m += 30) {
      const idx = Math.floor((m - startMin) / 30);
      if (idx < 0 || idx >= occupancy.length || occupancy[idx]) return false;
    }
    return true;
  }

  function optionsFor(dur) {
    return halfHourSlots(date).filter((t) => canFit(date, t, dur, occExisting));
  }

  const [duration, setDuration] = useState(90);
  const [options, setOptions] = useState(optionsFor(90));
  const [time, setTime] = useState(options[0] || "");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const opts = optionsFor(duration);
    setOptions(opts);
    setTime(opts[0] || "");
  }, [duration, date]);

  function handleSave() {
    if (!time || !name.trim()) return;
    onSave({
      id: uid(),
      date: isoDate(date),
      time,
      duration: Number(duration),
      clientName: name.trim(),
      notes: notes.trim(),
    });
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target.classList.contains('modal-backdrop')) onClose(); }}>
      <div className="modal">
        <div className="h2" style={{marginBottom: 4}}>Programare nouă</div>
        <div className="badge" style={{marginBottom: 12}}>{roLongDate(date)}</div>

        {options.length === 0 ? (
          <div className="card" style={{background:"#fff7ed", borderColor:"#fdba74", color:"#9a3412"}}>
            Nu mai sunt intervale libere pentru această zi.
          </div>
        ) : null}

        <div style={{display:"grid", gap: 10}}>
          <label>
            <span>Durată</span>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))}>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
            </select>
          </label>

          <label>
            <span>Ora</span>
            <select value={time} onChange={e => setTime(e.target.value)}>
              {options.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label>
            <span>Nume clientă</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Andreea Popescu" />
          </label>

          <label>
            <span>Note (opțional)</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Întreținere gel, french" />
          </label>
        </div>

        <div className="row" style={{justifyContent:"flex-end", marginTop: 12}}>
          <button className="btn" onClick={onClose}>Închide</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!time || !name.trim()}>Salvează</button>
        </div>
      </div>
    </div>
  );
}
