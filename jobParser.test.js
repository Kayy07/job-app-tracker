const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJobDescription } = require('./jobParser');

test('parses common job description sections and technical skills', () => {
  const description = `
We build software that helps university students find meaningful work. This intern ships production features with a small engineering team.

What You'll Do
- Build user-facing features with React and TypeScript
- Integrate REST APIs and services on AWS

Required Qualifications
- Currently pursuing a Computer Science degree
- Working knowledge of Git

Preferred Qualifications
- Experience with Next.js or Node.js
- Familiarity with PostgreSQL

What You'll Get
- Direct engineering mentorship
- Flexible hours around your classes

How to Apply
Email your resume and portfolio to recruiting@example.com.
`;

  const parsed = parseJobDescription(description);

  assert.match(parsed.summary, /helps university students/);
  assert.deepEqual(parsed.responsibilities, [
    'Build user-facing features with React and TypeScript',
    'Integrate REST APIs and services on AWS',
  ]);
  assert.deepEqual(parsed.requiredQualifications, [
    'Currently pursuing a Computer Science degree',
    'Working knowledge of Git',
  ]);
  assert.deepEqual(parsed.preferredQualifications, [
    'Experience with Next.js or Node.js',
    'Familiarity with PostgreSQL',
  ]);
  assert.deepEqual(parsed.benefits, [
    'Direct engineering mentorship',
    'Flexible hours around your classes',
  ]);
  assert.deepEqual(parsed.applicationInstructions, [
    'Email your resume and portfolio to recruiting@example.com.',
  ]);
  assert.deepEqual(parsed.skills, [
    'AWS', 'Git', 'Next.js', 'Node.js', 'PostgreSQL', 'React', 'REST APIs', 'TypeScript',
  ]);
});

test('returns an empty structured result for a missing description', () => {
  assert.deepEqual(parseJobDescription(''), {
    summary: null,
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    skills: [],
    benefits: [],
    applicationInstructions: [],
  });
});
