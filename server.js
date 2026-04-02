require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'deftech_jwt_secret_change_in_production';
const MONGO_URI  = process.env.MONGO_URI  || 'mongodb://localhost:27017/deftech';

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ═══════════════════════════════════════════════════════════
//  MONGOOSE SCHEMAS & MODELS
// ═══════════════════════════════════════════════════════════

// ── 1. Users ───────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true },
  role:       { type: String, enum: ['student', 'admin'], default: 'student' },
  enrolledAt: { type: Date, default: Date.now },
  lastLogin:  { type: Date },
}, { timestamps: true });

userSchema.methods.toSafeObject = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role, enrolledAt: this.enrolledAt };
};

const User = mongoose.model('User', userSchema);

// ── 2. Platform Stats (single global document) ─────────────
const platformStatsSchema = new mongoose.Schema({
  _id:              { type: String, default: 'global' },
  totalEnrolled:    { type: Number, default: 0 },
  totalQuizzesTaken:{ type: Number, default: 0 },
  lastUpdated:      { type: Date, default: Date.now },
});
const PlatformStats = mongoose.model('PlatformStats', platformStatsSchema);

// ── 3. Per-User Progress (one document per user) ───────────
//    Each user gets their own document in the "progresses" collection.
//    The userId field ties it to the User document.
const progressSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  userName: { type: String },

  // moduleProgress: Map { 'military-rank' => 3, 'missile-tech' => 2 }
  moduleProgress: { type: Map, of: Number, default: {} },

  // quizScores: Map { 'military-rank' => 85, 'missile-tech' => 100 }
  quizScores: { type: Map, of: Number, default: {} },

  completedCourses: [{ type: String }],

  quizHistory: [{
    courseId:       String,
    courseName:     String,
    score:          Number,
    totalQuestions: Number,
    correctAnswers: Number,
    takenAt:        { type: Date, default: Date.now },
  }],

  achievements: [{ type: String }],
}, { timestamps: true });

const Progress = mongoose.model('Progress', progressSchema);

// ═══════════════════════════════════════════════════════════
//  STATIC COURSE + QUIZ DATA  (JSON — no DB needed for these)
// ═══════════════════════════════════════════════════════════
const COURSES = [
  {
    id: 'military-rank', title: 'Military Rank Structure',
    category: 'Defence Basics', difficulty: 'Beginner', modules: 3, time: 45,
    emoji: '🎖️', bannerColor: 'linear-gradient(135deg,#0d2219,#1a4a30)',
    desc: "Master India's complete military rank hierarchy across Army, Navy, and Air Force.",
    longDesc: 'This foundational course covers the complete rank structure of the Indian Armed Forces — Army, Navy, and Indian Air Force. Learn the insignia, pay grades, appointment titles, and the operational command structure from Sepoy to Field Marshal.',
    moduleList: [
      { title: 'Army Ranks — Commissioned & Non-Commissioned', sub: 'Junior Commissioned Officers to Field Marshal' },
      { title: 'Navy & Air Force Rank Equivalents', sub: 'Cross-service rank mapping and joint operations' },
      { title: 'Command Structure & Chain of Authority', sub: 'How orders flow from MoD to battlefield' },
    ]
  },
  {
    id: 'drdo-overview', title: 'DRDO Overview',
    category: 'Defence Research', difficulty: 'Intermediate', modules: 4, time: 60,
    emoji: '🔬', bannerColor: 'linear-gradient(135deg,#0d1a22,#1a3a4a)',
    desc: "Deep dive into India's DRDO — its labs, flagship programmes, and Atmanirbhar vision.",
    longDesc: "DRDO is the R&D backbone of Indian defence. This course covers its organizational structure, cluster of 52 labs, flagship weapon programmes (Agni, Arjun, Tejas), Make in India push, and emerging research areas including AI, directed energy, and quantum.",
    moduleList: [
      { title: 'DRDO — History, Structure & Mandate', sub: '52 laboratories and their specializations' },
      { title: 'Flagship Programmes — Missiles & Aircraft', sub: 'Agni, Prithvi, Tejas LCA development' },
      { title: 'Arjun Tank & Land Systems', sub: 'MBT Arjun, infantry systems, artillery' },
      { title: 'Atmanirbhar Bharat & Export Vision', sub: 'Defence exports and future roadmap' },
    ]
  },
  {
    id: 'missile-tech', title: 'Missile Technology Basics',
    category: 'Space & Missiles', difficulty: 'Intermediate', modules: 5, time: 75,
    emoji: '🚀', bannerColor: 'linear-gradient(135deg,#1a0d22,#3a1a4a)',
    desc: "Explore India's missile arsenal — Agni-V to BrahMos. Propulsion, guidance, and deterrence.",
    longDesc: "From solid-fueled ballistic missiles to hypersonic glide vehicles, this course demystifies missile technology. Learn propulsion physics, inertial navigation, terminal guidance, re-entry vehicle design, and India's Integrated Guided Missile Development Programme.",
    moduleList: [
      { title: 'Missile Physics — Propulsion & Trajectories', sub: 'Solid vs liquid propellant, burn stages' },
      { title: "IGMDP — India's Missile Programme", sub: 'Agni, Prithvi, Akash, Trishul, Nag' },
      { title: 'BrahMos — Supersonic Cruise Missile', sub: 'India-Russia collaboration and Mach 2.8 technology' },
      { title: 'Guidance Systems & Warhead Technology', sub: 'INS, GPS, terminal homing, CEP' },
      { title: 'Strategic Deterrence & Missile Defence', sub: 'Nuclear triad, BMDS, S-400 integration' },
    ]
  },
  {
    id: 'radar-systems', title: 'Radar Systems',
    category: 'Electronics & Surveillance', difficulty: 'Advanced', modules: 4, time: 60,
    emoji: '📡', bannerColor: 'linear-gradient(135deg,#0a1a0d,#1a3020)',
    desc: "Technical deep dive into AESA, PESA, phased arrays, and India's Uttam radar programme.",
    longDesc: "Radar is the invisible backbone of modern defence. This advanced course covers electromagnetic wave principles, pulse vs continuous wave radar, phased array antenna theory, AESA vs PESA architectures, LPI design, and electronic countermeasures.",
    moduleList: [
      { title: 'Electromagnetic Fundamentals & Radar Basics', sub: 'RF propagation, reflection, Doppler' },
      { title: 'Phased Array Architecture — PESA & AESA', sub: 'Beam steering, T/R modules, bandwidth' },
      { title: "India's Radar Programmes — Uttam & Rohini", sub: 'DRDO radar development milestones' },
      { title: 'Electronic Warfare & Counter-Radar', sub: 'EW, jamming, LPI, stealth detection' },
    ]
  },
  {
    id: 'defence-innovation', title: 'Defence Innovation & Future Tech',
    category: 'Innovation', difficulty: 'Advanced', modules: 3, time: 50,
    emoji: '⚡', bannerColor: 'linear-gradient(135deg,#1a1a0d,#3a3a1a)',
    desc: 'AI warfare, autonomous systems, hypersonic weapons, AMCA, FINSAS, and quantum tech.',
    longDesc: "India's defence future is being written today. This course surveys AI-enabled autonomous drones, swarm warfare, directed energy weapons (DEW), hypersonic glide vehicles, quantum communication, the AMCA 5th-generation stealth fighter, and FINSAS.",
    moduleList: [
      { title: 'AI, Autonomy & Drone Swarms', sub: 'UAV swarms, loitering munitions, AI targeting' },
      { title: 'Hypersonic & Directed Energy Weapons', sub: 'HGV technology, LASER, RAILGUN programmes' },
      { title: 'AMCA, FINSAS & Future Platforms', sub: '5th-gen fighter, smart soldier, space assets' },
    ]
  }
];

const QUIZZES = {
  'military-rank': [
    { q: 'What is the highest rank in the Indian Army?', opts: ['General','Field Marshal','Lieutenant General','Chief of Army Staff'], ans: 1, exp: 'Field Marshal is the highest rank in the Indian Army — a 5-star rank awarded only during wartime or for extraordinary service. Only two officers have held it: K.M. Cariappa and Sam Manekshaw.' },
    { q: 'Which rank in the Indian Air Force is equivalent to a General in the Army?', opts: ['Air Marshal','Air Chief Marshal','Air Vice Marshal','Wing Commander'], ans: 1, exp: 'Air Chief Marshal is a 4-star rank equivalent to General in the Indian Army.' },
    { q: 'What does "JCO" stand for in the Indian Army?', opts: ['Junior Combat Officer','Joint Command Officer','Junior Commissioned Officer','Joint Corps Officer'], ans: 2, exp: 'JCO — Junior Commissioned Officer — ranks between NCO and commissioned officer. Examples: Naib Subedar, Subedar, Subedar Major.' },
    { q: 'Which naval rank is equivalent to a Brigadier in the Army?', opts: ['Commodore','Captain','Rear Admiral','Commander'], ans: 0, exp: 'Commodore (one-star) in the Indian Navy is equivalent to Brigadier (one-star) in the Indian Army.' },
    { q: 'The rank of "Sepoy" in the Army is equivalent to which Air Force rank?', opts: ['Flying Officer','Aircraftman','Corporal','Leading Aircraftman'], ans: 1, exp: 'Aircraftman (AC) is the lowest enlisted rank in the Indian Air Force, equivalent to Sepoy in the Army.' },
  ],
  'drdo-overview': [
    { q: 'When was DRDO established?', opts: ['1948','1958','1962','1971'], ans: 1, exp: 'DRDO was established in 1958 by merging the Technical Development Establishment of the Indian Army with the Directorate of Technical Development & Production.' },
    { q: 'How many laboratories does DRDO operate across India?', opts: ['32','41','52','67'], ans: 2, exp: 'DRDO operates 52 laboratories and establishments spread across India, employing over 30,000 scientists and staff.' },
    { q: 'What does IGMDP stand for?', opts: ['Integrated Guided Missile Defence Programme','Indian Government Missile Development Project','Integrated Guided Missile Development Programme','Indo-Government Military Defence Programme'], ans: 2, exp: 'IGMDP — Integrated Guided Missile Development Programme — was launched in 1983 under Dr. A.P.J. Abdul Kalam.' },
    { q: 'The Tejas LCA was developed by:', opts: ['DRDO alone','HAL alone','ADA with HAL as production agency','Boeing-HAL JV'], ans: 2, exp: 'ADA (Aeronautical Development Agency) designed it; HAL produces it.' },
  ],
  'missile-tech': [
    { q: 'What is the approximate range of the Agni-V ballistic missile?', opts: ['1,500 km','3,500 km','5,000+ km','800 km'], ans: 2, exp: "Agni-V is India's ICBM with a range exceeding 5,000 km." },
    { q: 'BrahMos is a joint venture between India and which country?', opts: ['France','Israel','Russia','USA'], ans: 2, exp: 'BrahMos is a joint venture between DRDO (India) and NPO Mashinostroyenia (Russia). The name comes from Brahmaputra and Moskva rivers.' },
    { q: 'Which propulsion type does the Agni series primarily use?', opts: ['Liquid propellant','Solid propellant','Hybrid propellant','Ram jet'], ans: 1, exp: 'The Agni series uses solid propellant motors, offering quick launch readiness and storage safety.' },
    { q: 'What is the maximum speed of the BrahMos missile?', opts: ['Mach 1.2','Mach 2.8','Mach 4','Mach 0.9'], ans: 1, exp: 'BrahMos travels at approximately Mach 2.8 (~3,400 km/h).' },
    { q: 'What does "CEP" stand for in missile guidance?', opts: ['Circular Error Probable','Combat Engagement Point','Cruise Engine Power','Central Explosive Payload'], ans: 0, exp: 'CEP — Circular Error Probable — is the radius within which 50% of missiles will land. Lower = higher accuracy.' },
  ],
  'radar-systems': [
    { q: 'What does AESA stand for?', opts: ['Active Electronically Scanned Array','Advanced Electronic Surveillance Apparatus','Automated Electronic Signal Array','Active Energy Scanning Antenna'], ans: 0, exp: 'AESA — Active Electronically Scanned Array — uses thousands of individual T/R modules, each with its own amplifier.' },
    { q: 'What is the primary advantage of a phased array radar?', opts: ['Lower cost','Faster beam steering with no moving parts','Longer range only','Smaller size'], ans: 1, exp: 'Phased arrays steer the beam electronically, enabling simultaneous multi-target tracking impossible with mechanical steering.' },
    { q: "India's indigenous AESA radar for the Tejas Mk2 is called:", opts: ['Rohini','Uttam','Indra','Phalcon'], ans: 1, exp: "Uttam AESA fire-control radar is being developed by DRDO's LRDE for the Tejas Mk2." },
    { q: 'What does "LPI" mean in radar EW?', opts: ['Low Power Interface','Long Period Intercept','Low Probability of Intercept','Laser Pulse Integration'], ans: 2, exp: 'LPI — Low Probability of Intercept — uses waveform design techniques (frequency hopping, spread spectrum) to avoid detection by enemy ESM.' },
  ],
  'defence-innovation': [
    { q: 'What does AMCA stand for?', opts: ['Advanced Military Combat Aircraft','Advanced Medium Combat Aircraft','Aerial Multi-Combat Asset','Autonomous Military Combat Asset'], ans: 1, exp: "AMCA — Advanced Medium Combat Aircraft — is India's indigenous 5th-gen stealth fighter under development by ADA and HAL." },
    { q: 'What is a "loitering munition"?', opts: ['A cruise missile that circles before striking','A drone that can be recalled','An unmanned system that loiters and attacks on target identification','A slow-flying bomber'], ans: 2, exp: 'A loitering munition loiters over a target area and dives to detonate on target identification. Examples: Harop (Israel), Switchblade (USA).' },
    { q: 'FINSAS stands for:', opts: ['Future Infantry Soldier as a System','Forward Infantry Network and Surveillance','Fast Infantry Netting & Assault System','Future Integrated Naval Soldier Armament System'], ans: 0, exp: "FINSAS — Future Infantry Soldier as a System — modernizes the Indian infantry with integrated comm, navigation, night vision, smart weapons, and battlefield networking." },
  ],
};

// ═══════════════════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Unauthorized — no token provided.' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized — invalid or expired token.' });
  }
}

// ═══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12) });

    // Each user gets their own progress document in the "progresses" collection
    await Progress.create({ userId: user._id, userName: user.name });

    // Atomically bump the global enrollment counter
    await PlatformStats.findByIdAndUpdate(
      'global',
      { $inc: { totalEnrolled: 1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, message: 'Account created successfully!', token, user: user.toSafeObject() });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, message: 'Login successful!', token, user: user.toSafeObject() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// GET /api/auth/me  [protected]
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  PUBLIC STATS  (no auth needed — shown on homepage)
// ═══════════════════════════════════════════════════════════

// GET /api/stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await PlatformStats.findById('global');
    res.json({
      success: true,
      totalEnrolled:    stats ? stats.totalEnrolled    : 0,
      totalQuizzesTaken:stats ? stats.totalQuizzesTaken: 0,
      totalCourses:     COURSES.length,
      totalModules:     COURSES.reduce((a, c) => a + c.modules, 0),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not fetch platform stats.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  COURSE ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/courses', (req, res) => {
  const { difficulty, category, search } = req.query;
  let result = [...COURSES];
  if (difficulty) result = result.filter(c => c.difficulty === difficulty);
  if (category)   result = result.filter(c => c.category.toLowerCase().includes(category.toLowerCase()));
  if (search)     result = result.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.desc.toLowerCase().includes(search.toLowerCase())
  );
  res.json({ success: true, count: result.length, courses: result });
});

app.get('/api/courses/:id', (req, res) => {
  const course = COURSES.find(c => c.id === req.params.id);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
  res.json({ success: true, course: { ...course, questionCount: (QUIZZES[course.id] || []).length } });
});

// GET /api/quiz/:courseId  [protected — serves questions without answers]
app.get('/api/quiz/:courseId', authMiddleware, (req, res) => {
  const qs = QUIZZES[req.params.courseId];
  if (!qs) return res.status(404).json({ success: false, message: 'Quiz not found for this course.' });
  // Strip answer indices before sending to client
  const clientSafe = qs.map(({ q, opts }) => ({ q, opts }));
  res.json({ success: true, questions: clientSafe });
});

// ═══════════════════════════════════════════════════════════
//  PROGRESS ROUTES  [all protected]
// ═══════════════════════════════════════════════════════════

// GET /api/progress
app.get('/api/progress', authMiddleware, async (req, res) => {
  try {
    const prog = await Progress.findOne({ userId: req.user.id });
    if (!prog) return res.status(404).json({ success: false, message: 'Progress record not found.' });
    res.json({ success: true, progress: serializeProgress(prog) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/progress/module  { courseId, moduleIndex }
app.post('/api/progress/module', authMiddleware, async (req, res) => {
  try {
    const { courseId, moduleIndex } = req.body;
    const course = COURSES.find(c => c.id === courseId);
    if (!course) return res.status(400).json({ success: false, message: 'Invalid courseId.' });

    const prog = await Progress.findOne({ userId: req.user.id });
    if (!prog) return res.status(404).json({ success: false, message: 'Progress record not found.' });

    const current = prog.moduleProgress.get(courseId) || 0;
    const newVal  = moduleIndex >= current ? moduleIndex + 1 : current;
    prog.moduleProgress.set(courseId, newVal);

    if (newVal >= course.modules && !prog.completedCourses.includes(courseId))
      prog.completedCourses.push(courseId);

    await prog.save();
    res.json({ success: true, completedModules: newVal, courseComplete: newVal >= course.modules });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/quiz/submit  { courseId, answers: [0,2,1,...] }
// Server-side grading — answers never leave the server
app.post('/api/quiz/submit', authMiddleware, async (req, res) => {
  try {
    const { courseId, answers } = req.body;
    const questions = QUIZZES[courseId];
    if (!questions)
      return res.status(400).json({ success: false, message: 'Invalid courseId.' });
    if (!Array.isArray(answers) || answers.length !== questions.length)
      return res.status(400).json({ success: false, message: `Expected ${questions.length} answers.` });

    // Grade on the server
    const results = questions.map((q, i) => ({
      correct: answers[i] === q.ans,
      correctIndex: q.ans,
      explanation: q.exp,
    }));
    const correctCount = results.filter(r => r.correct).length;
    const score  = Math.round((correctCount / questions.length) * 100);
    const grade  = score >= 90 ? 'Distinction' : score >= 70 ? 'Merit' : score >= 50 ? 'Pass' : 'Fail';

    const prog = await Progress.findOne({ userId: req.user.id });
    if (!prog) return res.status(404).json({ success: false, message: 'Progress record not found.' });

    // Best score logic
    const prev      = prog.quizScores.get(courseId);
    const isNewBest = prev === undefined || score > prev;
    if (isNewBest) prog.quizScores.set(courseId, score);

    // History (keep last 20)
    const courseName = COURSES.find(c => c.id === courseId)?.title || courseId;
    prog.quizHistory.unshift({ courseId, courseName, score, totalQuestions: questions.length, correctAnswers: correctCount });
    if (prog.quizHistory.length > 20) prog.quizHistory = prog.quizHistory.slice(0, 20);

    // Auto-complete all modules when quiz is taken
    const course = COURSES.find(c => c.id === courseId);
    if (course) {
      if ((prog.moduleProgress.get(courseId) || 0) < course.modules)
        prog.moduleProgress.set(courseId, course.modules);
      if (!prog.completedCourses.includes(courseId))
        prog.completedCourses.push(courseId);
    }

    prog.achievements = computeAchievements(prog);
    await prog.save();

    await PlatformStats.findByIdAndUpdate('global', { $inc: { totalQuizzesTaken: 1 } }, { upsert: true });

    res.json({ success: true, score, grade, correctCount, total: questions.length, isNewBest, results });
  } catch (err) {
    console.error('Quiz submit error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/dashboard
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const [prog, stats] = await Promise.all([
      Progress.findOne({ userId: req.user.id }),
      PlatformStats.findById('global'),
    ]);
    if (!prog) return res.status(404).json({ success: false, message: 'Progress record not found.' });

    const scoreVals = [...prog.quizScores.values()];
    const avgScore  = scoreVals.length ? Math.round(scoreVals.reduce((a,b)=>a+b,0)/scoreVals.length) : 0;
    const totalMods = [...prog.moduleProgress.values()].reduce((a,b)=>a+b,0);

    res.json({
      success: true,
      dashboard: {
        completedCourses:  prog.completedCourses,
        totalCompleted:    prog.completedCourses.length,
        quizzesTaken:      scoreVals.length,
        avgScore,
        totalModules:      totalMods,
        scores:            Object.fromEntries(prog.quizScores),
        history:           prog.quizHistory.slice(0,10),
        achievements:      prog.achievements,
        courseProgress:    COURSES.map(c => ({
          id: c.id, title: c.title, emoji: c.emoji,
          totalModules:      c.modules,
          completedModules:  prog.moduleProgress.get(c.id) || 0,
          percentage:        Math.round(((prog.moduleProgress.get(c.id)||0)/c.modules)*100),
          score:             prog.quizScores.get(c.id),
        })),
        platformStats: { totalEnrolled: stats ? stats.totalEnrolled : 0 },
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── HELPERS ────────────────────────────────────────────────
function computeAchievements(prog) {
  const sv  = [...prog.quizScores.values()];
  const avg = sv.length ? Math.round(sv.reduce((a,b)=>a+b,0)/sv.length) : 0;
  const earned = [];
  if (prog.completedCourses.length >= 1) earned.push('first_course');
  if (prog.completedCourses.length >= 5) earned.push('all_courses');
  if (sv.some(s=>s===100))               earned.push('perfect_quiz');
  if (avg>=80 && sv.length>=3)           earned.push('high_avg');
  if (sv.length >= 1)                    earned.push('first_quiz');
  if (sv.length >= 3)                    earned.push('three_quizzes');
  if (sv.length >= 5)                    earned.push('all_quizzes');
  if (prog.quizScores.has('missile-tech'))earned.push('missile_done');
  return earned;
}

function serializeProgress(prog) {
  return {
    moduleProgress:   Object.fromEntries(prog.moduleProgress),
    quizScores:       Object.fromEntries(prog.quizScores),
    completedCourses: prog.completedCourses,
    quizHistory:      prog.quizHistory,
    achievements:     prog.achievements,
  };
}

// ── CATCH-ALL → serve frontend ─────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ═══════════════════════════════════════════════════════════
//  CONNECT TO MONGODB + START SERVER
// ═══════════════════════════════════════════════════════════
async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected →', MONGO_URI);
    await PlatformStats.findByIdAndUpdate('global', {}, { upsert: true });

    app.listen(PORT, () => {
      console.log(`\n⚡ DEFTECH Server → http://localhost:${PORT}`);
      console.log('\n📡 API Routes:');
      [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET  /api/auth/me          [protected]',
        'GET  /api/stats            [public]',
        'GET  /api/courses',
        'GET  /api/courses/:id',
        'GET  /api/quiz/:courseId   [protected]',
        'GET  /api/progress         [protected]',
        'POST /api/progress/module  [protected]',
        'POST /api/quiz/submit      [protected, server-graded]',
        'GET  /api/dashboard        [protected]',
      ].forEach(r => console.log('  ', r));
      console.log('');
    });
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

start();
module.exports = app;
