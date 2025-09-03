import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { readDB, writeDB, add, list, update as updateRecord, remove as removeRecord } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const TOKEN_NAME = 'hrms_token';
const TOKEN_MAX_AGE = 60 * 60 * 8; // 8h

export const authRouter = express.Router();

// Seed an admin if none exists (username: admin, password: admin123)
function ensureAdmin() {
  const db = readDB();
  if (!db.users || db.users.length === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.users.push({
      id: 'seed-admin',
      username: 'admin',
      name: 'Admin',
      dept: '',
      role: 'admin',
      passwordHash,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    writeDB(db);
  }
}

ensureAdmin();

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_MAX_AGE,
  });
}

export function setAuthCookie(res, token) {
  res.cookie(TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: TOKEN_MAX_AGE * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(TOKEN_NAME, { path: '/' });
}

export function requireAuth(req, res, next) {
  const token = req.cookies[TOKEN_NAME] || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

export function currentUser(req, res) {
  const token = req.cookies[TOKEN_NAME] || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.json({ user: null });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const users = list('users');
    const full = users.find((u) => u.id === payload.sub);
    if (!full) return res.json({ user: null });
    const { passwordHash, ...safe } = full;
    return res.json({ user: safe });
  } catch (e) {
    return res.json({ user: null });
  }
}

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const users = list('users');
  const user = users.find((u) => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password || '', user.passwordHash))
    return res.status(400).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  setAuthCookie(res, token);
  const { passwordHash, ...safe } = user;
  res.json({ user: safe, token });
});

authRouter.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// Admin can create users with roles
authRouter.post('/users', requireAuth, requireRole('admin'), (req, res) => {
  const { username, name, role = 'editor', password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = list('users');
  if (users.some((u) => u.username === username)) return res.status(400).json({ error: 'Username taken' });
  const passwordHash = bcrypt.hashSync(password, 10);
  const user = add('users', { username, name: name || username, role, dept: '', passwordHash });
  const { passwordHash: ph, ...safe } = user;
  res.json({ user: safe });
});

// Admin: list users (no password hash)
authRouter.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = list('users').map(({ passwordHash, ...rest }) => rest);
  res.json({ users });
});

// Admin: update user (name, role, optional password)
authRouter.put('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { name, role, password } = req.body || {};
  const dbUsers = list('users');
  const target = dbUsers.find((u) => u.id === id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Prevent demoting last admin
  if (target.role === 'admin' && role && role !== 'admin') {
    const adminCount = dbUsers.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot demote the last admin' });
  }

  const updater = {};
  if (name !== undefined) updater.name = name;
  if (role !== undefined) updater.role = role;
  if (password) updater.passwordHash = bcrypt.hashSync(password, 10);

  const updated = updateRecord('users', id, updater);
  const { passwordHash, ...safe } = updated;
  res.json({ user: safe });
});

// Admin: delete user (not self, not last admin)
authRouter.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const dbUsers = list('users');
  const target = dbUsers.find((u) => u.id === id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (req.user.sub === id) return res.status(400).json({ error: 'Cannot delete yourself' });
  if (target.role === 'admin') {
    const adminCount = dbUsers.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last admin' });
  }
  const ok = removeRecord('users', id);
  if (!ok) return res.status(500).json({ error: 'Delete failed' });
  res.json({ ok: true });
});

// Current user can update their profile (name, dept)
authRouter.put('/me', requireAuth, (req, res) => {
  const { name, dept } = req.body || {};
  const updated = updateRecord('users', req.user.sub, { name, dept });
  if (!updated) return res.status(404).json({ error: 'User not found' });
  const { passwordHash, ...safe } = updated;
  res.json({ user: safe });
});
