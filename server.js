'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT_SECRET: use env var in production, generate a stable one otherwise
const SECRET_FILE = path.join(__dirname, '.jwt_secret');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  const fs = require('fs');
  if (fs.existsSync(SECRET_FILE)) {
    JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } else {
    JWT_SECRET = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(SECRET_FILE, JWT_SECRET, { mode: 0o600 });
  }
}

// ─── Database ─────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'medilink.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK(role IN ('patient','doctor')),
    first_name    TEXT    NOT NULL,
    last_name     TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patients (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                INTEGER UNIQUE NOT NULL REFERENCES users(id),
    date_of_birth          DATE,
    phone                  TEXT,
    address                TEXT,
    blood_type             TEXT,
    emergency_contact_name  TEXT,
    emergency_contact_phone TEXT,
    insurance_provider     TEXT,
    insurance_number       TEXT
  );

  CREATE TABLE IF NOT EXISTS doctors (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER UNIQUE NOT NULL REFERENCES users(id),
    specialty      TEXT NOT NULL,
    license_number TEXT UNIQUE NOT NULL,
    phone          TEXT,
    hospital       TEXT
  );

  CREATE TABLE IF NOT EXISTS clinical_records (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id    INTEGER UNIQUE NOT NULL REFERENCES patients(id),
    record_number TEXT    UNIQUE NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes         TEXT
  );

  CREATE TABLE IF NOT EXISTS consultations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id      INTEGER NOT NULL REFERENCES clinical_records(id),
    doctor_id      INTEGER NOT NULL REFERENCES doctors(id),
    date           DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason         TEXT NOT NULL,
    diagnosis      TEXT,
    treatment_plan TEXT,
    blood_pressure TEXT,
    heart_rate     INTEGER,
    temperature    REAL,
    weight         REAL,
    height         REAL,
    notes          TEXT
  );

  CREATE TABLE IF NOT EXISTS prescriptions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id  INTEGER NOT NULL REFERENCES consultations(id),
    medication       TEXT NOT NULL,
    dosage           TEXT NOT NULL,
    frequency        TEXT NOT NULL,
    duration         TEXT,
    instructions     TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS studies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id   INTEGER NOT NULL REFERENCES clinical_records(id),
    ordered_by  INTEGER REFERENCES doctors(id),
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    date        DATE,
    result      TEXT,
    status      TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
    notes       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS allergies (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id  INTEGER NOT NULL REFERENCES clinical_records(id),
    allergen   TEXT NOT NULL,
    reaction   TEXT,
    severity   TEXT CHECK(severity IN ('mild','moderate','severe')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conditions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id       INTEGER NOT NULL REFERENCES clinical_records(id),
    condition_name  TEXT NOT NULL,
    diagnosed_date  DATE,
    status          TEXT DEFAULT 'active' CHECK(status IN ('active','resolved','managed')),
    treatment       TEXT,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS medications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id     INTEGER NOT NULL REFERENCES clinical_records(id),
    name          TEXT NOT NULL,
    dosage        TEXT NOT NULL,
    frequency     TEXT NOT NULL,
    start_date    DATE,
    end_date      DATE,
    active        INTEGER DEFAULT 1,
    prescribed_by INTEGER REFERENCES doctors(id),
    notes         TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    token      TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used       INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: 'Acceso no permitido' });
    next();
  };
}

function generateRecordNumber() {
  const year = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 900000) + 100000);
  return `ML-${year}-${rand}`;
}

function sanitizeStr(s) {
  return typeof s === 'string' ? s.trim() : s;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  let { email, password, firstName, lastName, role, dateOfBirth, phone, bloodType,
        licenseNumber, specialty, hospital } = req.body;

  email      = sanitizeStr(email)?.toLowerCase();
  firstName  = sanitizeStr(firstName);
  lastName   = sanitizeStr(lastName);
  role       = sanitizeStr(role);

  if (!email || !password || !firstName || !lastName || !role)
    return res.status(400).json({ error: 'Todos los campos obligatorios son requeridos' });
  if (!['patient', 'doctor'].includes(role))
    return res.status(400).json({ error: 'Rol inválido' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (role === 'doctor' && (!licenseNumber || !specialty))
    return res.status(400).json({ error: 'Cédula profesional y especialidad son requeridas' });

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'Este correo ya está registrado' });

  const hash = bcrypt.hashSync(password, 12);

  try {
    const userId = db.transaction(() => {
      const r = db.prepare(
        'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?,?,?,?,?)'
      ).run(email, hash, role, firstName, lastName);
      const uid = r.lastInsertRowid;

      if (role === 'patient') {
        const pr = db.prepare(
          'INSERT INTO patients (user_id, date_of_birth, phone, blood_type) VALUES (?,?,?,?)'
        ).run(uid, dateOfBirth || null, phone || null, bloodType || null);
        let rn;
        do { rn = generateRecordNumber(); }
        while (db.prepare('SELECT id FROM clinical_records WHERE record_number = ?').get(rn));
        db.prepare('INSERT INTO clinical_records (patient_id, record_number) VALUES (?,?)').run(pr.lastInsertRowid, rn);
      } else {
        db.prepare(
          'INSERT INTO doctors (user_id, specialty, license_number, phone, hospital) VALUES (?,?,?,?,?)'
        ).run(uid, sanitizeStr(specialty), sanitizeStr(licenseNumber), phone || null, hospital || null);
      }
      return uid;
    })();

    const token = jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, role, firstName, lastName });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'La cédula profesional ya está registrada' });
    res.status(500).json({ error: 'Error al crear cuenta' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = sanitizeStr(req.body.email)?.toLowerCase();
  const { password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Correo y contraseña son requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, role: user.role, firstName: user.first_name, lastName: user.last_name });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const email = sanitizeStr(req.body.email)?.toLowerCase();
  if (!email) return res.status(400).json({ error: 'Correo es requerido' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  // Prevent email enumeration — always return success
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const exp   = new Date(Date.now() + 3_600_000).toISOString();
    db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)').run(user.id, token, exp);
    // In production: send email with reset link. Dev: include token in response.
    return res.json({
      message: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.',
      _devResetToken: token   // REMOVE in production
    });
  }
  res.json({ message: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.' });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token y contraseña son requeridos' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const reset = db.prepare(
    `SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')`
  ).get(token);
  if (!reset) return res.status(400).json({ error: 'El enlace de recuperación no es válido o ha expirado' });

  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 12), reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
  })();
  res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare(
    'SELECT id, email, role, first_name, last_name, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const profile = user.role === 'patient'
    ? db.prepare('SELECT * FROM patients WHERE user_id = ?').get(user.id)
    : db.prepare('SELECT * FROM doctors WHERE user_id = ?').get(user.id);

  res.json({ ...user, profile });
});

app.put('/api/auth/profile', authenticate, (req, res) => {
  const { firstName, lastName, phone, dateOfBirth, address,
          emergencyContactName, emergencyContactPhone, hospital } = req.body;

  db.transaction(() => {
    if (firstName) db.prepare('UPDATE users SET first_name = ? WHERE id = ?').run(sanitizeStr(firstName), req.user.id);
    if (lastName)  db.prepare('UPDATE users SET last_name  = ? WHERE id = ?').run(sanitizeStr(lastName),  req.user.id);

    if (req.user.role === 'patient') {
      const fields = { phone, date_of_birth: dateOfBirth, address,
                       emergency_contact_name: emergencyContactName,
                       emergency_contact_phone: emergencyContactPhone };
      for (const [col, val] of Object.entries(fields)) {
        if (val !== undefined)
          db.prepare(`UPDATE patients SET ${col} = ? WHERE user_id = ?`).run(val || null, req.user.id);
      }
    } else {
      if (phone)    db.prepare('UPDATE doctors SET phone    = ? WHERE user_id = ?').run(phone,    req.user.id);
      if (hospital) db.prepare('UPDATE doctors SET hospital = ? WHERE user_id = ?').run(hospital, req.user.id);
    }
  })();
  res.json({ message: 'Perfil actualizado correctamente' });
});

// ─── Patients ─────────────────────────────────────────────────────────────────
app.get('/api/patients', authenticate, requireRole('doctor'), (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const rows = db.prepare(`
    SELECT p.id, u.first_name, u.last_name, u.email,
           p.date_of_birth, p.phone, p.blood_type,
           cr.record_number, cr.id AS record_id,
           (SELECT COUNT(*) FROM consultations c WHERE c.record_id = cr.id) AS consultation_count,
           (SELECT MAX(c.date) FROM consultations c WHERE c.record_id = cr.id) AS last_consultation
    FROM patients p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN clinical_records cr ON cr.patient_id = p.id
    WHERE u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR cr.record_number LIKE ?
    ORDER BY u.last_name, u.first_name
    LIMIT 100
  `).all(q, q, q, q);
  res.json(rows);
});

app.get('/api/patients/:id', authenticate, (req, res) => {
  const pid = parseInt(req.params.id);
  if (isNaN(pid)) return res.status(400).json({ error: 'ID inválido' });

  if (req.user.role === 'patient') {
    const self = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(req.user.id);
    if (!self || self.id !== pid) return res.status(403).json({ error: 'Acceso no permitido' });
  }

  const patient = db.prepare(`
    SELECT p.*, u.first_name, u.last_name, u.email, u.created_at AS registered_at
    FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(pid);

  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  res.json(patient);
});

// ─── Clinical Record ──────────────────────────────────────────────────────────
function getFullRecord(patientId) {
  const record = db.prepare(`
    SELECT cr.*, p.blood_type, p.date_of_birth, p.phone, p.address,
           p.emergency_contact_name, p.emergency_contact_phone,
           p.insurance_provider, p.insurance_number,
           u.first_name, u.last_name, u.email
    FROM clinical_records cr
    JOIN patients p ON p.id = cr.patient_id
    JOIN users u ON u.id = p.user_id
    WHERE cr.patient_id = ?
  `).get(patientId);
  if (!record) return null;

  const consultations = db.prepare(`
    SELECT c.*, u.first_name AS doctor_first_name, u.last_name AS doctor_last_name, d.specialty
    FROM consultations c
    JOIN doctors d ON d.id = c.doctor_id
    JOIN users u ON u.id = d.user_id
    WHERE c.record_id = ? ORDER BY c.date DESC
  `).all(record.id);

  for (const c of consultations) {
    c.prescriptions = db.prepare(
      'SELECT * FROM prescriptions WHERE consultation_id = ? ORDER BY id'
    ).all(c.id);
  }

  return {
    record,
    consultations,
    studies:    db.prepare(`SELECT s.*, u.first_name AS doctor_first_name, u.last_name AS doctor_last_name FROM studies s LEFT JOIN doctors d ON d.id = s.ordered_by LEFT JOIN users u ON u.id = d.user_id WHERE s.record_id = ? ORDER BY s.created_at DESC`).all(record.id),
    allergies:  db.prepare('SELECT * FROM allergies  WHERE record_id = ? ORDER BY allergen').all(record.id),
    conditions: db.prepare('SELECT * FROM conditions WHERE record_id = ? ORDER BY status, condition_name').all(record.id),
    medications:db.prepare('SELECT * FROM medications WHERE record_id = ? ORDER BY active DESC, name').all(record.id),
  };
}

app.get('/api/patients/:id/record', authenticate, (req, res) => {
  const pid = parseInt(req.params.id);
  if (isNaN(pid)) return res.status(400).json({ error: 'ID inválido' });

  if (req.user.role === 'patient') {
    const self = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(req.user.id);
    if (!self || self.id !== pid) return res.status(403).json({ error: 'Acceso no permitido' });
  }

  const data = getFullRecord(pid);
  if (!data) return res.status(404).json({ error: 'Expediente no encontrado' });
  res.json(data);
});

app.get('/api/my-record', authenticate, requireRole('patient'), (req, res) => {
  const patient = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(req.user.id);
  if (!patient) return res.status(404).json({ error: 'Perfil de paciente no encontrado' });
  const data = getFullRecord(patient.id);
  if (!data) return res.status(404).json({ error: 'Expediente no encontrado' });
  res.json({ ...data, patientId: patient.id });
});

// ─── Consultations ────────────────────────────────────────────────────────────
app.post('/api/consultations', authenticate, requireRole('doctor'), (req, res) => {
  const { patientId, reason, diagnosis, treatmentPlan, bloodPressure,
          heartRate, temperature, weight, height, notes, prescriptions: rxList } = req.body;

  if (!patientId || !reason) return res.status(400).json({ error: 'Paciente y motivo son requeridos' });

  const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(req.user.id);
  if (!doctor) return res.status(403).json({ error: 'Perfil de médico no encontrado' });

  const record = db.prepare('SELECT id FROM clinical_records WHERE patient_id = ?').get(patientId);
  if (!record) return res.status(404).json({ error: 'Expediente no encontrado' });

  const cid = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO consultations
        (record_id, doctor_id, reason, diagnosis, treatment_plan, blood_pressure, heart_rate, temperature, weight, height, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(record.id, doctor.id, reason, diagnosis||null, treatmentPlan||null, bloodPressure||null,
           heartRate||null, temperature||null, weight||null, height||null, notes||null);

    if (Array.isArray(rxList)) {
      for (const rx of rxList) {
        if (rx.medication && rx.dosage && rx.frequency) {
          db.prepare(
            'INSERT INTO prescriptions (consultation_id, medication, dosage, frequency, duration, instructions) VALUES (?,?,?,?,?,?)'
          ).run(r.lastInsertRowid, rx.medication, rx.dosage, rx.frequency, rx.duration||null, rx.instructions||null);
        }
      }
    }
    return r.lastInsertRowid;
  })();

  res.status(201).json({ id: cid, message: 'Consulta registrada exitosamente' });
});

// ─── Studies ──────────────────────────────────────────────────────────────────
app.post('/api/studies', authenticate, requireRole('doctor'), (req, res) => {
  const { patientId, type, name, date, result, status, notes } = req.body;
  if (!patientId || !type || !name) return res.status(400).json({ error: 'Paciente, tipo y nombre son requeridos' });

  const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(req.user.id);
  const record = db.prepare('SELECT id FROM clinical_records WHERE patient_id = ?').get(patientId);
  if (!record) return res.status(404).json({ error: 'Expediente no encontrado' });

  const r = db.prepare(
    'INSERT INTO studies (record_id, ordered_by, type, name, date, result, status, notes) VALUES (?,?,?,?,?,?,?,?)'
  ).run(record.id, doctor?.id||null, type, name, date||null, result||null, status||'pending', notes||null);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Estudio registrado' });
});

app.put('/api/studies/:id', authenticate, requireRole('doctor'), (req, res) => {
  const { result, status, notes } = req.body;
  db.prepare('UPDATE studies SET result = ?, status = ?, notes = ? WHERE id = ?')
    .run(result||null, status||'pending', notes||null, req.params.id);
  res.json({ message: 'Estudio actualizado' });
});

// ─── Allergies ────────────────────────────────────────────────────────────────
app.post('/api/allergies', authenticate, requireRole('doctor'), (req, res) => {
  const { patientId, allergen, reaction, severity } = req.body;
  if (!patientId || !allergen) return res.status(400).json({ error: 'Paciente y alérgeno son requeridos' });

  const record = db.prepare('SELECT id FROM clinical_records WHERE patient_id = ?').get(patientId);
  if (!record) return res.status(404).json({ error: 'Expediente no encontrado' });

  const r = db.prepare(
    'INSERT INTO allergies (record_id, allergen, reaction, severity) VALUES (?,?,?,?)'
  ).run(record.id, allergen, reaction||null, severity||null);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Alergia registrada' });
});

app.delete('/api/allergies/:id', authenticate, requireRole('doctor'), (req, res) => {
  db.prepare('DELETE FROM allergies WHERE id = ?').run(req.params.id);
  res.json({ message: 'Alergia eliminada' });
});

// ─── Conditions ───────────────────────────────────────────────────────────────
app.post('/api/conditions', authenticate, requireRole('doctor'), (req, res) => {
  const { patientId, conditionName, diagnosedDate, status, treatment, notes } = req.body;
  if (!patientId || !conditionName) return res.status(400).json({ error: 'Paciente y condición son requeridos' });

  const record = db.prepare('SELECT id FROM clinical_records WHERE patient_id = ?').get(patientId);
  if (!record) return res.status(404).json({ error: 'Expediente no encontrado' });

  const r = db.prepare(
    'INSERT INTO conditions (record_id, condition_name, diagnosed_date, status, treatment, notes) VALUES (?,?,?,?,?,?)'
  ).run(record.id, conditionName, diagnosedDate||null, status||'active', treatment||null, notes||null);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Condición registrada' });
});

app.put('/api/conditions/:id', authenticate, requireRole('doctor'), (req, res) => {
  const { status, treatment, notes } = req.body;
  db.prepare('UPDATE conditions SET status = ?, treatment = ?, notes = ? WHERE id = ?')
    .run(status||'active', treatment||null, notes||null, req.params.id);
  res.json({ message: 'Condición actualizada' });
});

// ─── Medications ──────────────────────────────────────────────────────────────
app.post('/api/medications', authenticate, requireRole('doctor'), (req, res) => {
  const { patientId, name, dosage, frequency, startDate, endDate, notes } = req.body;
  if (!patientId || !name || !dosage || !frequency)
    return res.status(400).json({ error: 'Paciente, nombre, dosis y frecuencia son requeridos' });

  const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(req.user.id);
  const record = db.prepare('SELECT id FROM clinical_records WHERE patient_id = ?').get(patientId);
  if (!record) return res.status(404).json({ error: 'Expediente no encontrado' });

  const r = db.prepare(
    'INSERT INTO medications (record_id, name, dosage, frequency, start_date, end_date, prescribed_by, notes) VALUES (?,?,?,?,?,?,?,?)'
  ).run(record.id, name, dosage, frequency, startDate||null, endDate||null, doctor?.id||null, notes||null);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Medicamento registrado' });
});

app.put('/api/medications/:id', authenticate, requireRole('doctor'), (req, res) => {
  const { active, endDate, notes } = req.body;
  db.prepare('UPDATE medications SET active = ?, end_date = ?, notes = ? WHERE id = ?')
    .run(active ? 1 : 0, endDate||null, notes||null, req.params.id);
  res.json({ message: 'Medicamento actualizado' });
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
app.get('/api/dashboard/doctor', authenticate, requireRole('doctor'), (req, res) => {
  const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(req.user.id);
  if (!doctor) return res.status(404).json({ error: 'Perfil de médico no encontrado' });

  const totalPatients      = db.prepare('SELECT COUNT(*) AS n FROM patients').get().n;
  const totalConsultations = db.prepare('SELECT COUNT(*) AS n FROM consultations WHERE doctor_id = ?').get(doctor.id).n;
  const todayConsultations = db.prepare(`SELECT COUNT(*) AS n FROM consultations WHERE doctor_id = ? AND date(date) = date('now')`).get(doctor.id).n;
  const recentConsultations = db.prepare(`
    SELECT c.id, c.date, c.reason, c.diagnosis,
           u.first_name, u.last_name, cr.record_number, p.id AS patient_id
    FROM consultations c
    JOIN clinical_records cr ON cr.id = c.record_id
    JOIN patients p ON p.id = cr.patient_id
    JOIN users u ON u.id = p.user_id
    WHERE c.doctor_id = ?
    ORDER BY c.date DESC LIMIT 10
  `).all(doctor.id);

  res.json({ totalPatients, totalConsultations, todayConsultations, recentConsultations });
});

app.get('/api/dashboard/patient', authenticate, requireRole('patient'), (req, res) => {
  const patient = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(req.user.id);
  if (!patient) return res.status(404).json({ error: 'Perfil de paciente no encontrado' });

  const record = db.prepare('SELECT id, record_number FROM clinical_records WHERE patient_id = ?').get(patient.id);
  if (!record) return res.status(404).json({ error: 'Expediente no encontrado' });

  const totalConsultations = db.prepare('SELECT COUNT(*) AS n FROM consultations WHERE record_id = ?').get(record.id).n;
  const activeMedications  = db.prepare('SELECT COUNT(*) AS n FROM medications WHERE record_id = ? AND active = 1').get(record.id).n;
  const allergyCount       = db.prepare('SELECT COUNT(*) AS n FROM allergies WHERE record_id = ?').get(record.id).n;
  const pendingStudies     = db.prepare(`SELECT COUNT(*) AS n FROM studies WHERE record_id = ? AND status = 'pending'`).get(record.id).n;
  const lastConsultation   = db.prepare(`
    SELECT c.date, c.reason, c.diagnosis,
           u.first_name AS doctor_first_name, u.last_name AS doctor_last_name, d.specialty
    FROM consultations c
    JOIN doctors d ON d.id = c.doctor_id
    JOIN users u ON u.id = d.user_id
    WHERE c.record_id = ? ORDER BY c.date DESC LIMIT 1
  `).get(record.id);

  res.json({ recordNumber: record.record_number, patientId: patient.id,
             totalConsultations, activeMedications, allergyCount, pendingStudies, lastConsultation });
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  MediLink corriendo en → http://localhost:${PORT}\n`);
});
