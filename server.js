require('dotenv').config();

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is required. Copy .env.example to .env and configure it.');
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters. Configure it in your .env file.');
}

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const methodOverride = require('method-override');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./models/User');

const app = express();
const port = Number(process.env.PORT) || 3000;
app.locals.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method'));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/uploads', (req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  next();
}, express.static(path.join(__dirname, 'uploads')));

app.use(session({
  name: 'cleancircle.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    mongoOptions: { serverSelectionTimeoutMS: 10000 }
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use('/', require('./routes/authRoutes'));
app.use('/reports', require('./routes/reportRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/worker', require('./routes/workerRoutes'));

app.use((_req, res) => res.status(404).render('error', {
  title: 'Page not found',
  message: 'The page you are looking for does not exist.'
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500;
  const message = status === 500
    ? (error.message || 'Something went wrong. Please try again.')
    : error.message;
  res.status(status).render('error', { title: 'Something went wrong', message });
});

async function seedAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const exists = await User.exists({ role: 'admin' });
  if (exists) return;
  await User.create({
    name: ADMIN_NAME || 'CleanCircle Admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin'
  });
  console.log(`Initial admin created: ${ADMIN_EMAIL}`);
}

connectDB()
  .then(seedAdmin)
  .then(() => app.listen(port, () => console.log(`CleanCircle running at http://localhost:${port}`)))
  .catch((error) => {
    console.error('Application startup failed:', error);
    process.exitCode = 1;
  });
