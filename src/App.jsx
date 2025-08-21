import React, { useEffect, useMemo, useState } from "react";

// ==========================
// Nails Scheduler – Web (React)
// Persistence: localStorage
// Rules:
//  Mon–Fri: 08:00–16:00, max 5 clients/day
//  Saturday: 09:00–15:00, max 3 clients/day
//  Sunday: Closed
// Visuals:
//  • Selected day: circular "clock" filled by booked 30-min segments (blue). If fully booked → full red ring.
//  • Other days: stacked cards with a "battery"-style bar showing fill level.
//  • Each appointment can be 30/60/90 min (default 90). Overlaps prevented.
// ==========================

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
  // 0=Sunday, 1=Monday ... 6=Saturday
  return new Date(date).getDay();
}

function mondayOfWeek(date) {
  const d = startOfDay(date);
  let day = d.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
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
  const formatter = new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return formatter.format(d);
}

// ===== Business Rules =====
function rulesFor(date) {
  const wd = weekdayIndex(date); // 0=Sun ... 6=Sat
  if (wd === 0) return { start: 0, end: 0, max: 0, closed: true };
  if (wd === 6) return { start: 9, end: 15, max: 3, closed: false };
  return { start: 8, end: 16, max: 5, closed: false };
}

// --- Time slots in 30-minute steps & availability helpers ---
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
    const dur = Math.min(90, Math.max(30, Number(a.duration || 90))); // clamp 30–90
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
  const noFreeSlots = occ.every(Boolean);
  const maxReached = appts.length >= r.max;
  return noFreeSlots || maxReached;
}

const STORAGE_KEY = "nails_scheduler_v2";

export default function App() {
  const [selectedDate, setSelectedDate] = useState(mondayOfWeek(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { setAppointments(JSON.parse(raw)); } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  }, [appointments]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(mondayOfWeek(selectedDate), i)), [selectedDate]);

  function apptsForDay(date) {
    const dayIso = isoDate(date);
    return appointments
      .filter(a => a.date === dayIso)
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  }

  function addAppt(appt) {
    setAppointments(prev => [...prev, appt]);
  }

  function removeAppt(id) {
    setAppointments(prev => prev.filter(a => a.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Organizer programări</h1>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-xl bg-white shadow hover:shadow-md"
              onClick={() => setSelectedDate(addDays(selectedDate, -7))}
            >
              ← Săptămâna anterioară
            </button>
            <button
              className="px-3 py-2 rounded-xl bg-white shadow hover:shadow-md"
              onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            >
              Săptămâna viitoare →
            </button>
          </div>
        </header>

        {/* Selected day panel (with CLOCK) */}
        <DayPanel
          date={selectedDate}
          appts={apptsForDay(selectedDate)}
          onAdd={() => setShowAdd(true)}
          onDelete={removeAppt}
        />

        {/* Week summary with battery bars (other days) */}
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
            onSave={(payload) => {
              addAppt(payload);
              setShowAdd(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ===== Visual Components =====
function DayPanel({ date, appts, onAdd, onDelete }) {
  const r = rulesFor(date);
  const remaining = Math.max(0, r.max - appts.length);
  const full = isFullyBooked(date, appts);
  const pct = coveragePct(date, appts);

  return (
    <section className="bg-white rounded-2xl shadow p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{roLongDate(date)}</h2>
          <p className="text-sm text-gray-600">
            {r.closed ? "Zi închisă" : `Program: ${String(r.start).padStart(2, "0")}:00–${String(r.end).padStart(2, "0")}:00`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!r.closed && (
            <span className="text-sm">Locuri rămase: <b>{remaining}</b></span>
          )}
          <button
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium shadow hover:shadow-lg disabled:opacity-50"
            onClick={onAdd}
            disabled={r.closed || remaining === 0 || full}
          >
            Adaugă programare
          </button>
        </div>
      </div>

      {/* Clock visualization */}
      {!r.closed && (
        <div className="mt-4 flex items-center justify-center">
          <DayClock date={date} appts={appts} />
        </div>
      )}

      {/* Stats */}
      {!r.closed && (
        <div className="mt-3 text-center text-sm text-gray-600">Umplere: {pct.toFixed(0)}%</div>
      )}

      {/* List */}
      {appts.length === 0 ? (
        <div className="text-center text-gray-500 py-6">Nicio programare pentru această zi.</div>
      ) : (
        <ul className="divide-y divide-gray-200 mt-4">
          {appts.map((a) => (
            <li key={a.id} className="py-3 flex items-center gap-4">
              <div className="text-lg font-semibold tabular-nums w-28">{a.time}{a.duration ? ` (${a.duration}m)` : ""}</div>
              <div className="flex-1">
                <div className="font-semibold">{a.clientName}</div>
                {a.notes && <div className="text-sm text-gray-600">{a.notes}</div>}
              </div>
              <button
                className="px-3 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                onClick={() => onDelete(a.id)}
                title="Șterge"
              >
                Șterge
              </button>
            </li>
          ))}
        </ul>
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
    const startAngle = (i / segments) * 2 * Math.PI - Math.PI / 2; // start at top
    const endAngle = ((i + 1) / segments) * 2 * Math.PI - Math.PI / 2;
    const largeArc = 0;
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Base ring (working hours) */}
      {[...Array(segments)].map((_, i) => (
        <path key={`base-${i}`} d={arcForIndex(i)} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
      ))}

      {/* Blue filled segments */}
      {!full && occ.map((filled, i) => (
        filled ? <path key={`fill-${i}`} d={arcForIndex(i)} stroke="#3b82f6" strokeWidth={stroke} fill="none" /> : null
      ))}

      {/* Red overlay when full */}
      {full && (
        <circle cx={center} cy={center} r={radius} stroke="#ef4444" strokeWidth={stroke} fill="none" />
      )}

      {/* Center label */}
      <text x={center} y={center} textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight="bold">
        {full ? "PLIN" : `${pct.toFixed(0)}%`}
      </text>
    </svg>
  );
}

function WeekBattery({ weekDays, selectedDate, onSelect, apptsProvider }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-gray-600 mb-2">Săptămâna (rezumat)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {weekDays.map((d, idx) => {
          const appts = apptsProvider(d);
          const pct = coveragePct(d, appts);
          const full = isFullyBooked(d, appts);
          const selected = sameDay(d, selectedDate);
          return (
            <button
              key={idx}
              onClick={() => onSelect(d)}
              className={`p-3 rounded-2xl border text-left shadow-sm hover:shadow transition ${selected ? "border-blue-400" : "border-gray-200"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">{roWeekdayShort(weekdayIndex(d))} {d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" })}</div>
                <div className="text-xs text-gray-600">{full ? "Plin" : `${pct.toFixed(0)}%`}</div>
              </div>
              <Battery pct={pct} full={full} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Battery({ pct, full }) {
  return (
    <div className="relative w-full h-6 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
      <div
        className={`h-full ${full ? "bg-red-500" : "bg-blue-500"}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
      <div className="absolute inset-0 grid grid-cols-10 opacity-25 pointer-events-none">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="border-r border-white/60" />
        ))}
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-5">
        <h3 className="text-lg font-bold mb-1">Programare nouă</h3>
        <p className="text-sm text-gray-600 mb-4">{roLongDate(date)}</p>

        {options.length === 0 ? (
          <div className="p-3 bg-yellow-50 rounded-xl text-sm text-yellow-800 mb-3">
            Nu mai sunt intervale libere pentru această zi.
          </div>
        ) : null}

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="block mb-1">Durată</span>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full border rounded-xl px-3 py-2"
            >
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="block mb-1">Ora</span>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
            >
              {options.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="block mb-1">Nume clientă</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
              placeholder="Ex: Andreea Popescu"
            />
          </label>

          <label className="block text-sm">
            <span className="block mb-1">Note (opțional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
              placeholder="Ex: Întreținere gel, french"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="px-4 py-2 rounded-xl bg-gray-100" onClick={onClose}>Închide</button>
          <button
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
            onClick={handleSave}
            disabled={!time || !name.trim()}
          >
            Salvează
          </button>
        </div>
      </div>
    </div>
  );
}
