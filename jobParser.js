const SECTION_RULES = [
  ['responsibilities', /^(?:core )?responsibilit(?:y|ies)|what you(?:'|’)ll do|what you will do|the role|role overview|day[- ]to[- ]day/i],
  ['requiredQualifications', /^(?:minimum|required|basic) qualifications?|what we require|requirements?|who you are|what we(?:'|’)re looking for|required skills?/i],
  ['preferredQualifications', /^(?:preferred|desired|bonus|nice[- ]to[- ]have) qualifications?|preferred skills?|it(?:'|’)s a plus/i],
  ['benefits', /^(?:benefits?|perks?|what we offer|what you(?:'|’)ll get|compensation and benefits|life at)/i],
  ['applicationInstructions', /^(?:how to apply|to apply|application (?:process|instructions)|please submit)/i],
];

const SKILLS = [
  'AWS', 'Azure', 'C', 'C#', 'C++', 'CSS', 'Django', 'Docker', 'Elasticsearch',
  'Express', 'Figma', 'Firebase', 'Git', 'GitHub', 'Go', 'GraphQL', 'HTML', 'Java',
  'JavaScript', 'Kotlin', 'Kubernetes', 'MongoDB', 'MySQL', 'Next.js', 'Node.js',
  'PostgreSQL', 'Python', 'React', 'React Native', 'Redis', 'Redux', 'REST APIs',
  'Ruby', 'Rust', 'S3', 'Scala', 'Spark', 'SQL', 'Swift', 'TypeScript', 'Vue',
];

function cleanLine(line) {
  return line
    .replace(/^[\s•●▪◦*-]+/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionFor(line) {
  const normalized = cleanLine(line).replace(/:$/, '');
  return SECTION_RULES.find(([, rule]) => rule.test(normalized))?.[0] || null;
}

function looksLikeHeading(line) {
  const cleaned = cleanLine(line).replace(/:$/, '');
  if (!cleaned || cleaned.length > 80 || /[.!?]$/.test(cleaned)) return false;
  const words = cleaned.split(/\s+/);
  const minorWords = /^(?:a|an|and|at|for|in|of|on|or|the|to)$/i;
  const significantWords = words.filter(word => !minorWords.test(word));
  return words.length <= 10 && significantWords.length > 0 &&
    significantWords.every(word => /^[A-Z]/.test(word));
}

function unique(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractSkills(text) {
  return SKILLS.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9+#.])${escaped}(?=$|[^A-Za-z0-9+#.])`, 'i').test(text);
  });
}

function summarize(intro, text) {
  const candidates = intro.length ? intro : text.split(/\n\s*\n/);
  const paragraph = candidates
    .map(cleanLine)
    .find(item => item.length >= 80 && !/^(?:about|company description)/i.test(item));
  if (!paragraph) return null;
  return paragraph.length <= 500 ? paragraph : `${paragraph.slice(0, 497).trimEnd()}...`;
}

function parseJobDescription(rawText) {
  const text = String(rawText || '').replace(/\r/g, '').trim();
  const result = {
    summary: null,
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    skills: [],
    benefits: [],
    applicationInstructions: [],
  };

  if (!text) return result;

  const lines = text.split('\n');
  const intro = [];
  let activeSection = null;

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    const identifiedSection = sectionFor(line);
    if (identifiedSection) {
      activeSection = identifiedSection;
      continue;
    }

    if (looksLikeHeading(line)) {
      activeSection = null;
      continue;
    }

    if (activeSection) result[activeSection].push(line);
    else if (intro.join(' ').length < 1500) intro.push(line);
  }

  for (const key of [
    'responsibilities',
    'requiredQualifications',
    'preferredQualifications',
    'benefits',
    'applicationInstructions',
  ]) {
    result[key] = unique(result[key]);
  }

  result.summary = summarize(intro, text);
  result.skills = extractSkills(text);
  return result;
}

module.exports = { parseJobDescription };
