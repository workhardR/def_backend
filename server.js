

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const DB_FILE = path.join(__dirname, 'data', 'db.json');

function readDB() {
  if (!fs.existsSync(DB_FILE)) return { users: {}, progress: {}, scores: {}, history: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const COURSES = [
  {
    id: 'military-rank',
    title: 'Military Rank Structure',
    category: 'Defence Basics',
    difficulty: 'Beginner',
    modules: 3,
    time: 45,
    desc: "Master India's complete military rank hierarchy across Army, Navy, and Air Force.",
    moduleList: [
      { title: 'Army Ranks — Commissioned & Non-Commissioned', sub: 'Junior Commissioned Officers to Field Marshal' },
      { title: 'Navy & Air Force Rank Equivalents', sub: 'Cross-service rank mapping' },
      { title: 'Command Structure & Chain of Authority', sub: 'How orders flow from MoD to battlefield' },
    ]
  },
  {
    id: 'drdo-overview',
    title: 'DRDO Overview',
    category: 'Defence Research',
    difficulty: 'Intermediate',
    modules: 4,
    time: 60,
    desc: "Deep dive into India's DRDO — its labs, flagship programmes, and Atmanirbhar vision.",
    moduleList: [
      { title: 'DRDO — History, Structure & Mandate', sub: '52 laboratories and specializations' },
      { title: 'Flagship Programmes — Missiles & Aircraft', sub: 'Agni, Prithvi, Tejas LCA' },
      { title: 'Arjun Tank & Land Systems', sub: 'MBT Arjun, infantry systems, artillery' },
      { title: 'Atmanirbhar Bharat & Export Vision', sub: 'Defence exports and future roadmap' },
    ]
  },
  {
    id: 'missile-tech',
    title: 'Missile Technology Basics',
    category: 'Space & Missiles',
    difficulty: 'Intermediate',
    modules: 5,
    time: 75,
    desc: "Explore India's missile arsenal — Agni-V to BrahMos. Propulsion, guidance, and deterrence.",
    moduleList: [
      { title: 'Missile Physics — Propulsion & Trajectories', sub: 'Solid vs liquid propellant, burn stages' },
      { title: 'IGMDP — India\'s Missile Programme', sub: 'Agni, Prithvi, Akash, Trishul, Nag' },
      { title: 'BrahMos — Supersonic Cruise Missile', sub: 'India-Russia collaboration' },
      { title: 'Guidance Systems & Warhead Technology', sub: 'INS, GPS, terminal homing, CEP' },
      { title: 'Strategic Deterrence & Missile Defence', sub: 'Nuclear triad, BMDS, S-400' },
    ]
  },
  {
    id: 'radar-systems',
    title: 'Radar Systems',
    category: 'Electronics & Surveillance',
    difficulty: 'Advanced',
    modules: 4,
    time: 60,
    desc: 'Technical deep dive into AESA, PESA, phased arrays, and India\'s Uttam radar programme.',
    moduleList: [
      { title: 'Electromagnetic Fundamentals & Radar Basics', sub: 'RF propagation, reflection, Doppler' },
      { title: 'Phased Array Architecture — PESA & AESA', sub: 'Beam steering, T/R modules' },
      { title: 'India\'s Radar Programmes — Uttam & Rohini', sub: 'DRDO radar milestones' },
      { title: 'Electronic Warfare & Counter-Radar', sub: 'EW, jamming, LPI, stealth detection' },
    ]
  },
  {
    id: 'defence-innovation',
    title: 'Defence Innovation & Future Tech',
    category: 'Innovation',
    difficulty: 'Advanced',
    modules: 3,
    time: 50,
    desc: 'AI warfare, autonomous systems, hypersonic weapons, AMCA, FINSAS, and quantum tech.',
    moduleList: [
      { title: 'AI, Autonomy & Drone Swarms', sub: 'UAV swarms, loitering munitions' },
      { title: 'Hypersonic & Directed Energy Weapons', sub: 'HGV, LASER, RAILGUN programmes' },
      { title: 'AMCA, FINSAS & Future Platforms', sub: '5th-gen fighter, smart soldier' },
    ]
  }
];

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
  if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
  res.json({ success: true, course });
});

app.post('/api/progress/:userId/:courseId', (req, res) => {
  const { userId, courseId } = req.params;
  const { moduleIndex } = req.body;
  const db = readDB();

  if (!db.progress[userId]) db.progress[userId] = {};
  const current = db.progress[userId][courseId] || 0;
  if (moduleIndex >= current) {
    db.progress[userId][courseId] = moduleIndex + 1;
  }

  writeDB(db);
  res.json({ success: true, progress: db.progress[userId][courseId] });
});

app.get('/api/progress/:userId', (req, res) => {
  const db = readDB();
  const progress = db.progress[req.params.userId] || {};
  res.json({ success: true, progress });
});

app.post('/api/quiz/submit', (req, res) => {
  const { userId, courseId, score, totalQuestions, correctAnswers } = req.body;
  if (!userId || !courseId || score === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const db = readDB();
  if (!db.scores[userId]) db.scores[userId] = {};
  if (!db.history[userId]) db.history[userId] = [];

  // Store best score
  const prev = db.scores[userId][courseId];
  if (prev === undefined || score > prev) {
    db.scores[userId][courseId] = score;
  }

  // Append to history
  db.history[userId].unshift({
    courseId,
    courseName: COURSES.find(c => c.id === courseId)?.title || courseId,
    score,
    totalQuestions,
    correctAnswers,
    date: new Date().toISOString()
  });
  if (db.history[userId].length > 20) db.history[userId] = db.history[userId].slice(0, 20);

  writeDB(db);

  let grade = score >= 90 ? 'Distinction' : score >= 70 ? 'Merit' : score >= 50 ? 'Pass' : 'Fail';
  res.json({ success: true, score, grade, isNewBest: prev === undefined || score > prev });
});

app.get('/api/scores/:userId', (req, res) => {
  const db = readDB();
  const scores = db.scores[req.params.userId] || {};
  const history = (db.history[req.params.userId] || []).slice(0, 10);
  res.json({ success: true, scores, history });
});

app.get('/api/dashboard/:userId', (req, res) => {
  const db = readDB();
  const userId = req.params.userId;
  const progress = db.progress[userId] || {};
  const scores = db.scores[userId] || {};
  const history = (db.history[userId] || []).slice(0, 10);

  const completedCourses = COURSES.filter(c => (progress[c.id] || 0) >= c.modules).map(c => c.id);
  const scoreValues = Object.values(scores);
  const avgScore = scoreValues.length ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) : 0;
  const totalModules = Object.values(progress).reduce((a, b) => a + b, 0);

  const achievements = computeAchievements(completedCourses, scores, avgScore);

  res.json({
    success: true,
    dashboard: {
      completedCourses,
      totalCompleted: completedCourses.length,
      quizzesTaken: scoreValues.length,
      avgScore,
      totalModules,
      scores,
      history,
      progress,
      achievements,
      courseProgress: COURSES.map(c => ({
        id: c.id,
        title: c.title,
        emoji: c.emoji,
        totalModules: c.modules,
        completedModules: progress[c.id] || 0,
        percentage: Math.round(((progress[c.id] || 0) / c.modules) * 100),
        score: scores[c.id]
      }))
    }
  });
});

function computeAchievements(done, scores, avg) {
  const scoreVals = Object.values(scores);
  return [
    { id: 'first_course', icon: '🎖️', name: 'First Steps', earned: done.length >= 1 },
    { id: 'all_courses',  icon: '🏆', name: 'Defence Scholar', earned: done.length >= 5 },
    { id: 'perfect_quiz', icon: '⭐', name: 'Sharpshooter', earned: scoreVals.some(s => s === 100) },
    { id: 'high_avg',     icon: '🎯', name: 'Top Analyst', earned: avg >= 80 },
    { id: 'first_quiz',   icon: '📝', name: 'Quiz Cadet', earned: scoreVals.length >= 1 },
    { id: 'three_quizzes',icon: '🔬', name: 'Research Officer', earned: scoreVals.length >= 3 },
    { id: 'all_quizzes',  icon: '🌟', name: 'Grand Commander', earned: scoreVals.length >= 5 },
    { id: 'missile_done', icon: '🚀', name: 'Rocket Scientist', earned: !!scores['missile-tech'] },
  ];
}

// GET / — serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n⚡ DEFTECH Server running at http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   GET  /api/courses`);
  console.log(`   GET  /api/courses/:id`);
  console.log(`   GET  /api/progress/:userId`);
  console.log(`   POST /api/progress/:userId/:courseId`);
  console.log(`   POST /api/quiz/submit`);
  console.log(`   GET  /api/scores/:userId`);
  console.log(`   GET  /api/dashboard/:userId\n`);
});

module.exports = app;