import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html.js';

export function uploadView({ user }) {
  const content = `
    <div class="card">
      <h1>Upload Job Description</h1>
      <p class="subtitle">Upload a job specification to extract structured engineering requirements via AI.</p>

      <div id="alertBox" class="alert alert-error" style="display: none;"></div>

      <form id="uploadForm" enctype="multipart/form-data">
        <div style="margin-bottom: 1.5rem; border: 2px dashed var(--card-border); padding: 2rem; border-radius: 8px; text-align: center; background: #0f172a;">
          <label for="fileInput" style="display:block; font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff; cursor: pointer;">
            Choose a Job Description File
          </label>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">
            Accepted formats: <strong>.txt, .md, .json</strong> (Max file size: <strong>50 KB</strong>)
          </p>
          <input type="file" id="fileInput" name="file" accept=".txt,.md,.json" required style="color: var(--text-muted);">
        </div>

        <button type="submit" id="submitBtn" class="btn" style="width: 100%;">
          Start Asynchronous Analysis
        </button>
      </form>
    </div>
  `;

  const scripts = `
    <script>
      const form = document.getElementById('uploadForm');
      const fileInput = document.getElementById('fileInput');
      const alertBox = document.getElementById('alertBox');
      const submitBtn = document.getElementById('submitBtn');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.style.display = 'none';

        const file = fileInput.files[0];
        if (!file) {
          alertBox.textContent = 'Please choose a file to upload.';
          alertBox.style.display = 'block';
          return;
        }

        if (file.size > 51200) {
          alertBox.textContent = 'File exceeds the 50 KB maximum limit (' + file.size + ' bytes).';
          alertBox.style.display = 'block';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading and enqueueing job...';

        const formData = new FormData();
        formData.append('file', file);

        try {
          const res = await fetch('/api/ai/upload', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          if (!res.ok) {
            alertBox.textContent = data.error || 'Upload failed.';
            alertBox.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Start Asynchronous Analysis';
            return;
          }

          window.location.href = data.redirectUrl;
        } catch (err) {
          alertBox.textContent = 'Network communication error.';
          alertBox.style.display = 'block';
          submitBtn.disabled = false;
        }
      });
    </script>
  `;

  return renderLayout({ title: 'Upload Job Description', user, content, scripts });
}

export function jobDetailsView({ user, job }) {
  const isTerminal = job.status === 'done' || job.status === 'failed';
  const result = job.result_json;
  const followUp = job.follow_up_result;

  const content = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div>
          <h1 style="margin-bottom: 0.25rem;">Analysis Job</h1>
          <p style="color: var(--text-muted); font-size: 0.85rem;">File: <code>${escapeHtml(job.original_filename)}</code> (${job.file_size_bytes} bytes)</p>
        </div>
        <span class="badge badge-${escapeHtml(job.status)}">${escapeHtml(job.status)}</span>
      </div>

      <!-- State: Pending or Processing -->
      ${!isTerminal ? `
        <div style="padding: 2.5rem; text-align: center; background: #0f172a; border-radius: 8px; border: 1px solid var(--card-border); margin: 1.5rem 0;">
          <div style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>
          <h3 style="margin-bottom: 0.5rem;">
            ${job.status === 'pending' ? 'Queued in Background Worker...' : 'Processing with AI Model...'}
          </h3>
          <p style="color: var(--text-muted); font-size: 0.9rem;">
            Controlled worker concurrency active. Attempts: <strong>${job.attempts}</strong>.
          </p>
        </div>
      ` : ''}

      <!-- State: Failed -->
      ${job.status === 'failed' ? `
        <div class="alert alert-error" style="margin: 1.5rem 0;">
          <strong>Job Failed:</strong> ${escapeHtml(job.error_message || 'An error occurred during model invocation or schema validation.')}
          <div style="margin-top: 0.5rem; font-size: 0.85rem;">
            Attempts made: ${job.attempts}.
          </div>
        </div>
        <a href="/upload" class="btn">Upload Another Job Description</a>
      ` : ''}

      <!-- State: Done -->
      ${job.status === 'done' && result ? `
        <div style="margin-top: 1.5rem;">
          <div style="background: #0f172a; border: 1px solid var(--card-border); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
              <h2 style="font-size: 1.4rem; color: #fff;">${escapeHtml(result.roleTitle)}</h2>
              <span style="color: var(--primary); font-weight: 700;">${escapeHtml(result.seniority)} Level</span>
            </div>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.25rem;">
              Department: <strong>${escapeHtml(result.department)}</strong> | Minimum Experience: <strong>${result.minYearsExperience} years</strong>
            </p>

            <h3 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: #e2e8f0;">Required Technical Skills</h3>
            <div style="margin-bottom: 1.25rem;">
              ${result.requiredSkills.map(skill => `<span class="chip">${escapeHtml(skill)}</span>`).join('')}
            </div>

            <h3 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: #e2e8f0;">Core Responsibilities</h3>
            <ul style="padding-left: 1.25rem; color: var(--text-muted); font-size: 0.9rem; line-height: 1.6;">
              ${result.responsibilities.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </div>

          <!-- Raw Output Collapsible -->
          <details style="margin-bottom: 1.5rem; background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--card-border);">
            <summary style="cursor: pointer; font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">
              Inspect Raw Model Output (Schema Validated)
            </summary>
            <pre style="margin-top: 0.75rem; font-size: 0.75rem; overflow-x: auto; color: #94a3b8; padding: 0.5rem; background: #0b0f19; border-radius: 4px;"><code>${escapeHtml(job.raw_output || '')}</code></pre>
          </details>

          <!-- Follow-up AI Action Section -->
          <div style="border-top: 1px solid var(--card-border); padding-top: 1.5rem; margin-top: 1.5rem;">
            <h2 style="font-size: 1.25rem; margin-bottom: 0.5rem;">Follow-up AI Action: Technical Interview Rubric</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
              Leverage Role 2 (Technical Interview Evaluator) to synthesize an interview evaluation matrix from these validated requirements.
            </p>

            ${!followUp ? `
              <button id="rubricBtn" class="btn" onclick="generateRubric('${job.id}')">
                Generate Technical Interview Rubric
              </button>
            ` : `
              <div style="background: #0f172a; border: 1px solid var(--primary); border-radius: 8px; padding: 1.5rem; margin-top: 1rem;">
                <h3 style="color: var(--primary); font-size: 1.15rem; margin-bottom: 1rem;">
                  Interview Rubric: ${escapeHtml(followUp.roleTitle)}
                </h3>

                ${followUp.competencies.map(c => `
                  <div style="margin-bottom: 1.25rem;">
                    <h4 style="font-size: 1rem; color: #fff; margin-bottom: 0.25rem;">• ${escapeHtml(c.name)}</h4>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                      Criteria: ${c.criteria.map(escapeHtml).join(' ')}
                    </p>
                    <div style="padding-left: 1rem; border-left: 2px solid var(--primary); font-size: 0.85rem; color: #e2e8f0;">
                      <strong>Targeted Questions:</strong>
                      <ul style="margin-top: 0.25rem; padding-left: 1rem;">
                        ${c.assessmentQuestions.map(q => `<li>${escapeHtml(q)}</li>`).join('')}
                      </ul>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  const scripts = `
    <script>
      ${!isTerminal ? `
        // Auto-poll job status until terminal state
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch('/api/ai/jobs/${job.id}');
            if (res.ok) {
              const data = await res.json();
              if (data.job.status === 'done' || data.job.status === 'failed') {
                clearInterval(pollInterval);
                window.location.reload();
              }
            }
          } catch (e) {}
        }, 1200);

        // Cancel polling when navigating away
        window.addEventListener('beforeunload', () => clearInterval(pollInterval));
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') clearInterval(pollInterval);
        });
      ` : ''}

      async function generateRubric(jobId) {
        const btn = document.getElementById('rubricBtn');
        btn.disabled = true;
        btn.textContent = 'Generating interview rubric (Role 2 Evaluator)...';

        try {
          const res = await fetch('/api/ai/jobs/' + jobId + '/follow-up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await res.json();
          if (!res.ok) {
            alert(data.error || 'Failed to generate rubric.');
            btn.disabled = false;
            return;
          }
          window.location.reload();
        } catch (e) {
          alert('Network communication error.');
          btn.disabled = false;
        }
      }
    </script>
  `;

  return renderLayout({ title: 'Analysis Result', user, content, scripts });
}

export function jobsListView({ user, jobs }) {
  const content = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <div>
          <h1>My Job Analyses</h1>
          <p class="subtitle" style="margin-bottom: 0;">History of background requirements extractions.</p>
        </div>
        <a href="/upload" class="btn">New Analysis</a>
      </div>

      ${jobs.length === 0 ? `
        <p style="color: var(--text-muted); font-size: 0.95rem;">No jobs analyzed yet. <a href="/upload" style="color: var(--primary);">Upload your first file</a>.</p>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${jobs.map(j => `
            <a href="/jobs/${j.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: #0f172a; border: 1px solid var(--card-border); border-radius: 8px; text-decoration: none; color: inherit;">
              <div>
                <strong style="color: #fff;">${escapeHtml(j.original_filename)}</strong>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">
                  ${new Date(j.created_at * 1000).toLocaleString()} • ${j.file_size_bytes} bytes
                </div>
              </div>
              <span class="badge badge-${escapeHtml(j.status)}">${escapeHtml(j.status)}</span>
            </a>
          `).join('')}
        </div>
      `}
    </div>
  `;

  return renderLayout({ title: 'My Analyses', user, content });
}

export function signinView() {
  const content = `
    <div class="card" style="max-width: 420px; margin: 3rem auto;">
      <h1>Sign in to AI Slice</h1>
      <p class="subtitle">Access your background AI processing workspace</p>
      <form id="signinForm">
        <div style="margin-bottom: 1rem;">
          <label style="display:block; font-size: 0.85rem; margin-bottom: 0.4rem;">Email</label>
          <input type="email" id="email" required style="width:100%; padding:0.75rem; background:#0f172a; border:1px solid var(--card-border); color:#fff; border-radius:8px;">
        </div>
        <div style="margin-bottom: 1.5rem;">
          <label style="display:block; font-size: 0.85rem; margin-bottom: 0.4rem;">Password</label>
          <input type="password" id="password" required style="width:100%; padding:0.75rem; background:#0f172a; border:1px solid var(--card-border); color:#fff; border-radius:8px;">
        </div>
        <button type="submit" class="btn" style="width:100%;">Sign In</button>
      </form>
      <div style="margin-top: 1rem; text-align: center; font-size: 0.85rem;">
        Don't have an account? <a href="/signup" style="color:var(--primary);">Sign up</a>
      </div>
    </div>
  `;

  const scripts = `
    <script>
      document.getElementById('signinForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const res = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (res.ok) window.location.href = '/upload';
        else alert('Invalid credentials');
      });
    </script>
  `;

  return renderLayout({ title: 'Sign In', content, scripts });
}

export function signupView() {
  const content = `
    <div class="card" style="max-width: 420px; margin: 3rem auto;">
      <h1>Create an Account</h1>
      <p class="subtitle">Start testing asynchronous AI background flows</p>
      <form id="signupForm">
        <div style="margin-bottom: 1rem;">
          <label style="display:block; font-size: 0.85rem; margin-bottom: 0.4rem;">Full Name</label>
          <input type="text" id="name" required style="width:100%; padding:0.75rem; background:#0f172a; border:1px solid var(--card-border); color:#fff; border-radius:8px;">
        </div>
        <div style="margin-bottom: 1rem;">
          <label style="display:block; font-size: 0.85rem; margin-bottom: 0.4rem;">Email</label>
          <input type="email" id="email" required style="width:100%; padding:0.75rem; background:#0f172a; border:1px solid var(--card-border); color:#fff; border-radius:8px;">
        </div>
        <div style="margin-bottom: 1.5rem;">
          <label style="display:block; font-size: 0.85rem; margin-bottom: 0.4rem;">Password</label>
          <input type="password" id="password" required style="width:100%; padding:0.75rem; background:#0f172a; border:1px solid var(--card-border); color:#fff; border-radius:8px;">
        </div>
        <button type="submit" class="btn" style="width:100%;">Create Account</button>
      </form>
      <div style="margin-top: 1rem; text-align: center; font-size: 0.85rem;">
        Already have an account? <a href="/signin" style="color:var(--primary);">Sign in</a>
      </div>
    </div>
  `;

  const scripts = `
    <script>
      document.getElementById('signupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        if (res.ok) window.location.href = '/upload';
        else {
          const d = await res.json();
          alert(d.error || 'Signup failed');
        }
      });
    </script>
  `;

  return renderLayout({ title: 'Sign Up', content, scripts });
}


