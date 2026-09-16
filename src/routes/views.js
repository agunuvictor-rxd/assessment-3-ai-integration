import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDatabase } from '../db.js';
import {
  uploadView,
  jobDetailsView,
  jobsListView,
  signinView,
  signupView,
} from '../views/pages.js';

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

export const viewsRouter = Router();

viewsRouter.get('/', (req, res) => {
  res.redirect('/upload');
});

viewsRouter.get('/signin', (req, res) => {
  res.send(signinView());
});

viewsRouter.get('/signup', (req, res) => {
  res.send(signupView());
});

viewsRouter.get('/upload', requireAuth, (req, res) => {
  res.send(uploadView({ user: req.user }));
});

viewsRouter.get('/jobs', requireAuth, (req, res) => {
  const db = getDatabase();
  const jobs = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.send(jobsListView({ user: req.user, jobs }));
});

viewsRouter.get('/jobs/:id', requireAuth, (req, res) => {
  const db = getDatabase();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

  if (!job) {
    return res.status(404).send('Job not found.');
  }

  const parsedJob = {
    ...job,
    result_json: safeJsonParse(job.result_json),
    follow_up_result: safeJsonParse(job.follow_up_result),
  };

  res.send(jobDetailsView({ user: req.user, job: parsedJob }));
});
