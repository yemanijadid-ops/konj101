import { api } from './common.js';

const form = document.getElementById('form');
const error = document.getElementById('error');
const submit = document.getElementById('submit');

api('/api/session')
  .then((s) => {
    if (s.authenticated) location.replace('/admin/dashboard.html');
  })
  .catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.classList.add('hidden');
  submit.disabled = true;
  try {
    await api('/api/login', { method: 'POST', body: { password: document.getElementById('password').value } });
    location.href = '/admin/dashboard.html';
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('hidden');
    document.getElementById('password').select();
  } finally {
    submit.disabled = false;
  }
});
