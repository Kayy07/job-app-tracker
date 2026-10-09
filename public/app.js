const state = { jobs: [], statuses: [], draft: null };

const elements = {
  scrapeForm: document.querySelector('#scrape-form'),
  scrapeMessage: document.querySelector('#scrape-message'),
  reviewPanel: document.querySelector('#review-panel'),
  reviewForm: document.querySelector('#review-form'),
  saveMessage: document.querySelector('#save-message'),
  parsedPreview: document.querySelector('#parsed-preview'),
  cancelReview: document.querySelector('#cancel-review'),
  jobs: document.querySelector('#jobs'),
  stats: document.querySelector('#stats'),
  emptyState: document.querySelector('#empty-state'),
  search: document.querySelector('#search'),
  template: document.querySelector('#job-template'),
};

async function api(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function text(value) {
  return value || '';
}

function renderParsed(parsed) {
  const groups = [
    ['Responsibilities', parsed?.responsibilities],
    ['Required qualifications', parsed?.requiredQualifications],
    ['Preferred qualifications', parsed?.preferredQualifications],
    ['Benefits', parsed?.benefits],
    ['Application instructions', parsed?.applicationInstructions],
  ].filter(([, items]) => items?.length);

  elements.parsedPreview.replaceChildren();
  if (parsed?.summary) {
    const summary = document.createElement('p');
    summary.textContent = parsed.summary;
    elements.parsedPreview.append(summary);
  }
  for (const [heading, items] of groups) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    const list = document.createElement('ul');
    title.textContent = heading;
    items.forEach(item => {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      list.append(listItem);
    });
    section.append(title, list);
    elements.parsedPreview.append(section);
  }
}

function openReview(job) {
  state.draft = job;
  const statusSelect = elements.reviewForm.elements.currentStatus;
  statusSelect.replaceChildren(...state.statuses.map(status => new Option(status, status)));
  for (const field of ['companyName', 'positionTitle', 'currentStatus', 'onsiteRemote', 'location', 'payRate', 'deadline', 'link', 'jobDescription']) {
    elements.reviewForm.elements[field].value = text(job[field]);
  }
  renderParsed(job.parsedDescription);
  elements.reviewPanel.classList.remove('hidden');
  elements.reviewPanel.scrollIntoView({ behavior: 'smooth' });
}

function jobSearchText(job) {
  return [job.companyName, job.positionTitle, job.location, job.onsiteRemote, ...(job.parsedDescription?.skills || [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function renderJobs() {
  const query = elements.search.value.trim().toLowerCase();
  const jobs = state.jobs.filter(job => jobSearchText(job).includes(query));
  elements.jobs.replaceChildren();
  elements.emptyState.hidden = state.jobs.length > 0;

  for (const job of jobs) {
    const fragment = elements.template.content.cloneNode(true);
    fragment.querySelector('.company').textContent = job.companyName || 'Unknown company';
    fragment.querySelector('.title').textContent = job.positionTitle || 'Untitled position';
    fragment.querySelector('.summary').textContent = job.parsedDescription?.summary || 'No summary available.';
    const status = fragment.querySelector('.status');
    state.statuses.forEach(value => status.append(new Option(value, value, false, value === job.currentStatus)));
    status.addEventListener('change', async event => {
      try {
        const result = await api(`/api/jobs/${encodeURIComponent(job.id)}`, {
          method: 'PATCH', body: JSON.stringify({ currentStatus: event.target.value }),
        });
        Object.assign(job, result.job);
        renderStats();
      } catch (error) {
        event.target.value = job.currentStatus;
        alert(error.message);
      }
    });

    const metadata = [job.onsiteRemote, job.location, job.payRate, job.deadline ? `Deadline: ${job.deadline}` : null].filter(Boolean);
    fragment.querySelector('.metadata').textContent = metadata.join(' • ');
    const skills = fragment.querySelector('.skills');
    (job.parsedDescription?.skills || []).slice(0, 8).forEach(skill => {
      const tag = document.createElement('span');
      tag.textContent = skill;
      skills.append(tag);
    });
    const link = fragment.querySelector('.listing-link');
    link.href = job.link || '#';
    link.hidden = !job.link;
    elements.jobs.append(fragment);
  }
}

function renderStats() {
  elements.stats.replaceChildren(...state.statuses.map(status => {
    const item = document.createElement('div');
    const count = state.jobs.filter(job => job.currentStatus === status).length;
    item.innerHTML = `<strong>${count}</strong><span>${status}</span>`;
    return item;
  }));
}

async function loadJobs() {
  const result = await api('/api/jobs');
  state.jobs = result.jobs;
  state.statuses = result.statuses;
  renderStats();
  renderJobs();
}

elements.scrapeForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  elements.scrapeMessage.textContent = 'Opening the listing and extracting its details…';
  try {
    const result = await api('/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ url: new FormData(elements.scrapeForm).get('url') }),
    });
    elements.scrapeMessage.textContent = 'Import complete. Review the fields below.';
    openReview(result.job);
  } catch (error) {
    elements.scrapeMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

elements.reviewForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  elements.saveMessage.textContent = 'Saving…';
  const job = Object.fromEntries(new FormData(elements.reviewForm));
  try {
    const result = await api('/api/jobs', { method: 'POST', body: JSON.stringify(job) });
    state.jobs.unshift(result.job);
    elements.saveMessage.textContent = '';
    elements.reviewPanel.classList.add('hidden');
    elements.reviewForm.reset();
    elements.scrapeForm.reset();
    renderStats();
    renderJobs();
  } catch (error) {
    elements.saveMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

elements.cancelReview.addEventListener('click', () => elements.reviewPanel.classList.add('hidden'));
elements.search.addEventListener('input', renderJobs);

loadJobs().catch(error => {
  elements.emptyState.textContent = `Could not load jobs: ${error.message}`;
});
