const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const VALID_STATUSES = ['Saved', 'Applied', 'Interviewing', 'Rejected', 'Offer'];

class JobStore {
  constructor(filePath = path.join(__dirname, 'data', 'jobs.json')) {
    this.filePath = filePath;
  }

  async readAll() {
    try {
      const contents = await fs.readFile(this.filePath, 'utf8');
      const jobs = JSON.parse(contents);
      return Array.isArray(jobs) ? jobs : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async writeAll(jobs) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }

  async create(input) {
    const jobs = await this.readAll();
    const now = new Date().toISOString();
    const job = {
      id: crypto.randomUUID(),
      companyName: input.companyName || null,
      positionTitle: input.positionTitle || null,
      jobDescription: input.jobDescription || '',
      parsedDescription: input.parsedDescription || null,
      currentStatus: VALID_STATUSES.includes(input.currentStatus) ? input.currentStatus : 'Saved',
      link: input.link || null,
      deadline: input.deadline || null,
      onsiteRemote: input.onsiteRemote || 'Unknown',
      location: input.location || null,
      payRate: input.payRate || null,
      createdAt: now,
      updatedAt: now,
    };
    jobs.unshift(job);
    await this.writeAll(jobs);
    return job;
  }

  async update(id, input) {
    const jobs = await this.readAll();
    const index = jobs.findIndex(job => job.id === id);
    if (index === -1) return null;

    const allowedFields = [
      'companyName', 'positionTitle', 'jobDescription', 'parsedDescription',
      'currentStatus', 'link', 'deadline', 'onsiteRemote', 'location', 'payRate',
    ];
    const updates = Object.fromEntries(
      allowedFields.filter(field => Object.hasOwn(input, field)).map(field => [field, input[field]])
    );
    if (updates.currentStatus && !VALID_STATUSES.includes(updates.currentStatus)) {
      throw new Error('Invalid job status');
    }

    jobs[index] = { ...jobs[index], ...updates, updatedAt: new Date().toISOString() };
    await this.writeAll(jobs);
    return jobs[index];
  }
}

module.exports = { JobStore, VALID_STATUSES };
