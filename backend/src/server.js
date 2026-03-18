import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';

const requiredEnv = ['OPENAI_PROJECT_API_KEY', 'JWT_SECRET', 'DATABASE_URL'];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const app = express();

const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// In production, lock CORS to the configured client origin.
// In development, allow any origin so Vite can choose ports freely.
if (process.env.NODE_ENV === 'production') {
  app.use(
    cors({
      origin: clientOrigin,
      credentials: true,
    }),
  );
} else {
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
}

app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Multer configuration: in-memory storage, single PDF up to 5MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

// Prefer the project-specific key from .env to avoid conflicts with any
// globally-set OPENAI_API_KEY in your shell environment.
const rawApiKey = process.env.OPENAI_PROJECT_API_KEY
  ? String(process.env.OPENAI_PROJECT_API_KEY)
  : '';
const trimmedApiKey = rawApiKey.trim();

if (!trimmedApiKey) {
  console.error('OPENAI_PROJECT_API_KEY is missing or empty.');
}

const openai = new OpenAI({
  apiKey: trimmedApiKey,
});

app.set('openai', openai);

// Supported roles for validation and prompt context.
const SUPPORTED_ROLES = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Data Scientist',
  'Machine Learning Engineer',
  'AI Engineer',
  'Cloud Engineer',
  'DevOps Engineer',
  'Cybersecurity Analyst',
  'Cloud Security Engineer',
  'Mobile App Developer',
  'Game Developer',
  'Database Engineer',
  'Site Reliability Engineer',
];

// Role-specific keyword dictionary used for deterministic keyword matching
// and match percentage calculation.
const ROLE_KEYWORDS = {
  'Software Engineer': [
    'data structures',
    'algorithms',
    'object oriented programming',
    'oop',
    'system design',
    'api',
    'rest',
    'graphql',
    'unit testing',
  ],
  'Frontend Developer': [
    'javascript',
    'typescript',
    'react',
    'vue',
    'angular',
    'html',
    'css',
    'tailwind',
    'responsive design',
  ],
  'Backend Developer': [
    'node.js',
    'node',
    'express',
    'rest api',
    'database',
    'sql',
    'postgresql',
    'mongodb',
    'authentication',
  ],
  'Full Stack Developer': [
    'react',
    'node.js',
    'express',
    'rest api',
    'database',
    'sql',
    'authentication',
    'deployment',
  ],
  'Data Scientist': [
    'python',
    'pandas',
    'numpy',
    'statistics',
    'machine learning',
    'scikit-learn',
    'data visualization',
  ],
  'Machine Learning Engineer': [
    'python',
    'pandas',
    'numpy',
    'machine learning',
    'deep learning',
    'tensorflow',
    'pytorch',
    'mlops',
  ],
  'AI Engineer': [
    'python',
    'machine learning',
    'deep learning',
    'llm',
    'prompt engineering',
    'vector database',
  ],
  'Cloud Engineer': [
    'aws',
    'azure',
    'gcp',
    'iac',
    'terraform',
    'cloudformation',
    'vpc',
    'iam',
    'load balancer',
  ],
  'DevOps Engineer': [
    'ci/cd',
    'jenkins',
    'github actions',
    'docker',
    'kubernetes',
    'monitoring',
    'logging',
    'terraform',
  ],
  'Cybersecurity Analyst': [
    'vulnerability assessment',
    'siem',
    'incident response',
    'threat detection',
    'network security',
    'risk assessment',
  ],
  'Cloud Security Engineer': [
    'aws',
    'azure',
    'iam',
    'security group',
    'network security',
    'vpc',
    'encryption',
    'compliance',
  ],
  'Mobile App Developer': [
    'android',
    'ios',
    'react native',
    'flutter',
    'swift',
    'kotlin',
    'play store',
  ],
  'Game Developer': [
    'unity',
    'unreal',
    'c#',
    'c++',
    'game engine',
    'graphics',
  ],
  'Database Engineer': [
    'sql',
    'postgresql',
    'mysql',
    'database design',
    'normalization',
    'performance tuning',
    'indexes',
  ],
  'Site Reliability Engineer': [
    'sre',
    'monitoring',
    'observability',
    'prometheus',
    'grafana',
    'incident response',
    'on-call',
    'reliability',
  ],
};

app.post('/api/resume/parse', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const { originalname, mimetype, buffer, size } = req.file;

  const isPdfType = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
  if (!isPdfType) {
    return res.status(400).json({ error: 'Only PDF files are supported.' });
  }

  if (!buffer || size === 0) {
    return res.status(400).json({ error: 'Uploaded file is empty or unreadable.' });
  }

  try {
    const parsedPdf = await pdfParse(buffer);
    let text = parsedPdf.text || '';
    text = text.replace(/\r/g, '\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{2,}/g, '\n\n');
    text = text.trim();

    if (!text) {
      return res.status(422).json({ error: 'Unable to extract text from this PDF. Try a different resume format.' });
    }

    return res.status(200).json({
      text,
      meta: {
        fileName: originalname,
        pages: parsedPdf.numpages ?? null,
        info: parsedPdf.info ?? null,
      },
    });
  } catch (error) {
    console.error('Error parsing PDF resume:', error);
    return res.status(500).json({ error: 'Failed to parse resume PDF.' });
  }
});

// ATS-style resume scan endpoint: extracts text from PDF and asks OpenAI
// to evaluate strengths and improvements for the selected role.
app.post('/api/ats/scan', upload.single('file'), async (req, res) => {
  const { role } = req.body;

  if (!role || typeof role !== 'string') {
    return res.status(400).json({ error: 'Target role is required.' });
  }

  if (!SUPPORTED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Unsupported role selected.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No resume file uploaded.' });
  }

  const { originalname, mimetype, buffer, size } = req.file;

  const isPdfType = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
  if (!isPdfType) {
    return res.status(400).json({ error: 'Only PDF files are supported.' });
  }

  if (!buffer || size === 0) {
    return res.status(400).json({ error: 'Uploaded file is empty or unreadable.' });
  }

  try {
    // Extract raw text from the PDF.
    const parsed = await pdfParse(buffer);
    let text = parsed.text || '';
    text = text.replace(/\r/g, '\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{2,}/g, '\n\n');
    text = text.trim();

    if (!text) {
      return res.status(422).json({ error: 'Unable to extract text from this PDF.' });
    }
    // Role-based keyword matching
    const roleKeywords = ROLE_KEYWORDS[role] || [];
    const resumeTextLower = text.toLowerCase();

    const matchedKeywords = [];
    const missingKeywords = [];

    for (const keyword of roleKeywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (resumeTextLower.includes(normalizedKeyword)) {
        matchedKeywords.push(keyword);
      } else {
        missingKeywords.push(keyword);
      }
    }

    const matchPercentage = roleKeywords.length
      ? Math.round((matchedKeywords.length / roleKeywords.length) * 100)
      : 0;

    // AI prompt: ask for strictly JSON response with extended schema,
    // including score breakdown and a short explanation.
    const systemPrompt =
      'You are an advanced ATS resume scanner.\n\n' +
      `The candidate is applying for: ${role}.\n\n` +
      'Analyze the resume and return ONLY valid JSON with the following keys:\n' +
      '- "score": overall ATS score from 0 to 100 (number).\n' +
      '- "match_percentage": how well the resume matches the role, 0 to 100 (number).\n' +
      '- "breakdown": an object with numeric fields { "skills", "experience", "projects", "keywords" } that roughly sum to the score.\n' +
      '- "strengths": array of specific strength bullet points.\n' +
      '- "improvements": array of specific improvement bullet points.\n' +
      '- "missing_keywords": array of important, role-relevant skills or keywords the resume is missing.\n' +
      '- "suggestions": array of improved resume bullet points, aligned index-wise with "improvements".\n' +
      '- "explanation": a short paragraph explaining why this score and breakdown were assigned.\n\n' +
      'Rules:\n' +
      '- Be specific and role-tailored.\n' +
      '- No generic advice.\n' +
      '- Respond with JSON only, no extra text before or after.\n' +
      '- Ensure all keys are present even if some arrays are empty.\n' +
      '- "score" and "match_percentage" must be numbers (not strings).';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content:
            `Here is the full resume text to analyze for the role "${role}":\n\n${text}\n\n` +
            'Keyword analysis for this role (computed by the system):\n' +
            `Total keywords configured: ${roleKeywords.length}\n` +
            `Matched keywords: ${matchedKeywords.join(', ') || 'None'}\n` +
            `Missing keywords: ${missingKeywords.join(', ') || 'None'}\n` +
            `Keyword match percentage (pre-computed): ${matchPercentage}.\n\n` +
            'Use this information to populate the JSON fields. Remember: respond with JSON only.',
        },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const content = completion.choices[0]?.message?.content?.trim();

    if (!content) {
      return res.status(500).json({ error: 'AI did not return any analysis.' });
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(content);
    } catch (parseError) {
      // Try to salvage a JSON object from within code fences or extra text.
      const jsonMatch = content.match(/{[\s\S]*}/);
      if (!jsonMatch) {
        console.error('Failed to parse AI JSON response (no JSON object found):', parseError, content);
        return res.status(500).json({ error: 'AI returned invalid JSON.' });
      }

      try {
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch (innerError) {
        console.error('Failed to parse AI JSON response (inner JSON error):', innerError, jsonMatch[0]);
        return res.status(500).json({ error: 'AI returned invalid JSON.' });
      }
    }

    const score = typeof parsedJson.score === 'number' ? parsedJson.score : 0;
    const strengths = Array.isArray(parsedJson.strengths) ? parsedJson.strengths : [];
    const improvements = Array.isArray(parsedJson.improvements) ? parsedJson.improvements : [];
    const suggestions = Array.isArray(parsedJson.suggestions) ? parsedJson.suggestions : [];

    const rawBreakdown =
      parsedJson.breakdown && typeof parsedJson.breakdown === 'object' ? parsedJson.breakdown : {};
    const breakdown = {
      skills:
        typeof rawBreakdown.skills === 'number'
          ? Math.min(100, Math.max(0, Math.round(rawBreakdown.skills)))
          : 0,
      experience:
        typeof rawBreakdown.experience === 'number'
          ? Math.min(100, Math.max(0, Math.round(rawBreakdown.experience)))
          : 0,
      projects:
        typeof rawBreakdown.projects === 'number'
          ? Math.min(100, Math.max(0, Math.round(rawBreakdown.projects)))
          : 0,
      keywords:
        typeof rawBreakdown.keywords === 'number'
          ? Math.min(100, Math.max(0, Math.round(rawBreakdown.keywords)))
          : 0,
    };

    const explanation =
      parsedJson.explanation && typeof parsedJson.explanation === 'string'
        ? parsedJson.explanation.trim()
        : '';

    // Ensure score and match percentage are within 0-100.
    const normalizedScore = Math.min(100, Math.max(0, Math.round(score)));
    const normalizedMatch = Math.min(100, Math.max(0, Math.round(matchPercentage)));

    return res.status(200).json({
      score: normalizedScore,
      match_percentage: normalizedMatch,
      breakdown,
      strengths,
      improvements,
      missing_keywords: missingKeywords,
      suggestions,
      explanation,
    });
  } catch (error) {
    // Log verbose error server-side and return a more descriptive
    // message to the client while still avoiding sensitive details.
    console.error('Error during ATS scan:', error);

    const message =
      (error && typeof error === 'object' && 'message' in error && String(error.message)) ||
      'Unknown error';

    return res.status(500).json({
      error: 'Failed to complete ATS scan.',
      reason: message,
    });
  }
});

// Endpoint: improve a single resume bullet in the context of a role.
// Expects JSON body: { role: string, original_bullet: string }
// Returns: { improved_bullet: string }
app.post('/api/ats/fix-bullet', async (req, res) => {
  const { role, original_bullet: originalBullet } = req.body || {};

  if (!role || typeof role !== 'string') {
    return res.status(400).json({ error: 'Target role is required.' });
  }

  if (!SUPPORTED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Unsupported role selected.' });
  }

  if (!originalBullet || typeof originalBullet !== 'string' || !originalBullet.trim()) {
    return res.status(400).json({ error: 'Original bullet text is required.' });
  }

  try {
    const systemPrompt =
      'You are a senior resume writer and ATS optimization expert.\n' +
      'Given a resume bullet and a target role, you rewrite the bullet to be:\n' +
      '- More concise and impactful.\n' +
      '- Rich in concrete outcomes and metrics when possible.\n' +
      '- Tailored to the target role and its typical responsibilities.\n' +
      '- Optimized for ATS keyword scanning.\n\n' +
      'Respond ONLY with valid JSON of the shape { "improved_bullet": string } and no other text.';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `Target role: ${role}.\n` +
            'Rewrite the following resume bullet to be stronger and more role-aligned:\n\n' +
            originalBullet,
        },
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return res.status(500).json({ error: 'AI did not return any improved bullet.' });
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(content);
    } catch (parseError) {
      const jsonMatch = content.match(/{[\s\S]*}/);
      if (!jsonMatch) {
        console.error('Failed to parse AI fix-bullet response (no JSON found):', parseError, content);
        return res.status(500).json({ error: 'AI returned invalid JSON for improved bullet.' });
      }

      try {
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch (innerError) {
        console.error('Failed to parse AI fix-bullet response (inner JSON error):', innerError, jsonMatch[0]);
        return res.status(500).json({ error: 'AI returned invalid JSON for improved bullet.' });
      }
    }

    const improvedBullet =
      parsedJson && typeof parsedJson.improved_bullet === 'string'
        ? parsedJson.improved_bullet.trim()
        : '';

    if (!improvedBullet) {
      return res.status(500).json({ error: 'AI did not return a usable improved bullet.' });
    }

    return res.status(200).json({ improved_bullet: improvedBullet });
  } catch (error) {
    console.error('Error during fix-bullet:', error);
    const message =
      (error && typeof error === 'object' && 'message' in error && String(error.message)) ||
      'Unknown error';
    return res.status(500).json({ error: 'Failed to improve bullet.', reason: message });
  }
});

// Endpoint: generate a fully rewritten resume text from the uploaded PDF
// while preserving high-level structure but improving clarity, impact, and
// keyword optimization for the selected role.
// Expects multipart/form-data with fields: file (PDF), role (string)
// Returns: { improved_resume: string }
app.post('/api/ats/rewrite-resume', upload.single('file'), async (req, res) => {
  const { role } = req.body || {};

  if (!role || typeof role !== 'string') {
    return res.status(400).json({ error: 'Target role is required.' });
  }

  if (!SUPPORTED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Unsupported role selected.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No resume file uploaded.' });
  }

  const { originalname, mimetype, buffer, size } = req.file;

  const isPdfType = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
  if (!isPdfType) {
    return res.status(400).json({ error: 'Only PDF files are supported.' });
  }

  if (!buffer || size === 0) {
    return res.status(400).json({ error: 'Uploaded file is empty or unreadable.' });
  }

  try {
    const parsedPdf = await pdfParse(buffer);
    let text = parsedPdf.text || '';
    text = text.replace(/\r/g, '\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{2,}/g, '\n\n');
    text = text.trim();

    if (!text) {
      return res.status(422).json({ error: 'Unable to extract text from this PDF.' });
    }

    const systemPrompt =
      'You are an expert resume writer and ATS optimization specialist.\n' +
      'Given the full text of a resume and a target role, you will rewrite:\n' +
      '- Experience bullet points.\n' +
      '- Project descriptions.\n' +
      '- Skills section.\n' +
      'Goals:\n' +
      '- Preserve the original structure, section order, and overall chronology.\n' +
      '- Improve clarity, specificity, and impact.\n' +
      '- Add or emphasize role-relevant keywords where appropriate.\n' +
      '- Keep the final output ready to paste into a resume (plain text).\n\n' +
      'Respond with the fully rewritten resume as clean formatted text only. Do NOT return JSON.';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `Target role: ${role}.\n\n` +
            'Here is the current resume text to rewrite and optimize:\n\n' +
            text,
        },
      ],
      temperature: 0.5,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return res.status(500).json({ error: 'AI did not return a rewritten resume.' });
    }

    return res.status(200).json({ improved_resume: content });
  } catch (error) {
    console.error('Error during rewrite-resume:', error);
    const message =
      (error && typeof error === 'object' && 'message' in error && String(error.message)) ||
      'Unknown error';
    return res.status(500).json({ error: 'Failed to rewrite resume.', reason: message });
  }
});

// Endpoint: compare resume text (from uploaded PDF) against a pasted job
// description and highlight alignment and gaps.
// Expects multipart/form-data with fields: file (PDF), role (string, optional), job_description (string)
// Returns: { match_percentage: number, missing_keywords: string[], improvements: string[] }
app.post('/api/ats/job-match', upload.single('file'), async (req, res) => {
  const { role, job_description: jobDescription } = req.body || {};

  if (!jobDescription || typeof jobDescription !== 'string' || !jobDescription.trim()) {
    return res.status(400).json({ error: 'Job description text is required.' });
  }

  if (role && typeof role !== 'string') {
    return res.status(400).json({ error: 'If provided, role must be a string.' });
  }

  if (role && !SUPPORTED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Unsupported role selected.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No resume file uploaded.' });
  }

  const { originalname, mimetype, buffer, size } = req.file;

  const isPdfType = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
  if (!isPdfType) {
    return res.status(400).json({ error: 'Only PDF files are supported.' });
  }

  if (!buffer || size === 0) {
    return res.status(400).json({ error: 'Uploaded file is empty or unreadable.' });
  }

  try {
    const parsed = await pdfParse(buffer);
    let text = parsed.text || '';
    text = text.replace(/\r/g, '\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{2,}/g, '\n\n');
    text = text.trim();

    if (!text) {
      return res.status(422).json({ error: 'Unable to extract text from this PDF.' });
    }

    const resumeLower = text.toLowerCase();
    const jobLower = jobDescription.toLowerCase();

    const tokenize = (value) =>
      value
        .split(/[^a-z0-9+#.]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length > 3);

    const jobTokens = Array.from(new Set(tokenize(jobLower)));
    const resumeTokensSet = new Set(tokenize(resumeLower));

    let sharedCount = 0;
    const missingKeywordsFromJob = [];
    for (const token of jobTokens) {
      if (resumeTokensSet.has(token)) {
        sharedCount += 1;
      } else {
        missingKeywordsFromJob.push(token);
      }
    }

    const jobMatchPercentage = jobTokens.length
      ? Math.round((sharedCount / jobTokens.length) * 100)
      : 0;

    const systemPrompt =
      'You are a job match analyzer and ATS expert.\n' +
      'You will compare a candidate resume against a job description and explain:\n' +
      '- Where the resume aligns strongly.\n' +
      '- What is missing or weak for this specific job.\n' +
      '- Concrete, role-aware improvements the candidate could make.\n\n' +
      'Respond ONLY with valid JSON of the shape { "improvements": string[] }.';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            (role ? `Target role: ${role}.\n\n` : '') +
            'Here is the job description:\n\n' +
            jobDescription +
            '\n\nHere is the candidate resume text:\n\n' +
            text +
            '\n\nPre-computed stats (do not contradict, but you may elaborate):\n' +
            `Job keyword match percentage: ${jobMatchPercentage}\n` +
            `Missing job keywords: ${missingKeywordsFromJob.join(', ') || 'None'}.`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return res.status(500).json({ error: 'AI did not return job match feedback.' });
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(content);
    } catch (parseError) {
      const jsonMatch = content.match(/{[\s\S]*}/);
      if (!jsonMatch) {
        console.error('Failed to parse AI job-match response (no JSON found):', parseError, content);
        return res.status(500).json({ error: 'AI returned invalid JSON for job match.' });
      }

      try {
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch (innerError) {
        console.error('Failed to parse AI job-match response (inner JSON error):', innerError, jsonMatch[0]);
        return res.status(500).json({ error: 'AI returned invalid JSON for job match.' });
      }
    }

    const improvements = Array.isArray(parsedJson.improvements) ? parsedJson.improvements : [];
    const normalizedJobMatch = Math.min(100, Math.max(0, Math.round(jobMatchPercentage)));

    return res.status(200).json({
      match_percentage: normalizedJobMatch,
      missing_keywords: missingKeywordsFromJob,
      improvements,
    });
  } catch (error) {
    console.error('Error during job-match:', error);
    const message =
      (error && typeof error === 'object' && 'message' in error && String(error.message)) ||
      'Unknown error';
    return res.status(500).json({ error: 'Failed to compare resume and job description.', reason: message });
  }
});

// Endpoint: generate an improved resume and job match details from raw text.
// Expects JSON body:
// {
//   "resume_text": string,
//   "selected_role": string,
//   "job_description"?: string
// }
// Returns JSON:
// {
//   "improved_resume": string,
//   "job_match": {
//      "score": number,
//      "missing_keywords": string[],
//      "strengths": string[],
//      "improvements": string[]
//   }
// }
app.post('/generate-improved-resume', async (req, res) => {
  const { resume_text: resumeTextRaw, selected_role: selectedRoleRaw, job_description: jobDescriptionRaw } =
    req.body || {};

  const resumeText = typeof resumeTextRaw === 'string' ? resumeTextRaw.trim() : '';
  const selectedRole = typeof selectedRoleRaw === 'string' ? selectedRoleRaw.trim() : '';
  const jobDescription = typeof jobDescriptionRaw === 'string' ? jobDescriptionRaw.trim() : '';

  if (!resumeText) {
    return res.status(400).json({ error: 'Resume text is required.' });
  }

  if (!selectedRole) {
    return res.status(400).json({ error: 'Selected role is required.' });
  }

  if (!SUPPORTED_ROLES.includes(selectedRole)) {
    return res.status(400).json({ error: 'Unsupported role selected.' });
  }

  try {
    const roleKeywords = ROLE_KEYWORDS[selectedRole] || [];
    const resumeLower = resumeText.toLowerCase();

    const matchedKeywords = [];
    const missingKeywords = [];
    for (const keyword of roleKeywords) {
      const normalized = keyword.toLowerCase();
      if (resumeLower.includes(normalized)) {
        matchedKeywords.push(keyword);
      } else {
        missingKeywords.push(keyword);
      }
    }

    const keywordMatchPercentage = roleKeywords.length
      ? Math.round((matchedKeywords.length / roleKeywords.length) * 100)
      : 0;

    let jobMatchPercentage = keywordMatchPercentage;
    if (jobDescription) {
      const resumeTokens = new Set(
        resumeLower
          .split(/[^a-z0-9+#.]+/i)
          .map((t) => t.trim())
          .filter((t) => t.length > 3),
      );
      const jobTokens = Array.from(
        new Set(
          jobDescription
            .toLowerCase()
            .split(/[^a-z0-9+#.]+/i)
            .map((t) => t.trim())
            .filter((t) => t.length > 3),
        ),
      );

      let shared = 0;
      for (const token of jobTokens) {
        if (resumeTokens.has(token)) {
          shared += 1;
        }
      }
      jobMatchPercentage = jobTokens.length ? Math.round((shared / jobTokens.length) * 100) : keywordMatchPercentage;
    }

    const systemPrompt =
      'You are a senior resume expert for technical roles (software, cloud, security, data).\n\n' +
      'Your job is to transform the resume into a high-impact, ATS-optimized version WITHOUT losing technical depth.\n\n' +
      'INSTRUCTIONS FOR THE IMPROVED RESUME TEXT:\n' +
      '- KEEP all important technical details, tools, and technologies.\n' +
      '- DO NOT remove depth or complexity; do NOT oversimplify.\n' +
      '- UPGRADE each bullet point with stronger action verbs and clearer wording.\n' +
      '- Add measurable impact and metrics where possible.\n' +
      '- Remove ONLY redundant or weak phrasing.\n' +
      '- Keep the resume professional, recruiter-level, and detailed.\n\n' +
      'STRUCTURE (TEXT-ONLY):\n' +
      'Name (top line: candidate name)\n' +
      'Location | Email | LinkedIn\n\n' +
      'EDUCATION\n' +
      '• Degree, University, Year\n\n' +
      'EXPERIENCE\n' +
      'Company Name — Role (Dates)\n' +
      '• Bullet point with action + impact\n' +
      '• Bullet point with metrics\n\n' +
      'PROJECTS\n' +
      'Project Name\n' +
      '• Bullet point\n' +
      '• Bullet point\n\n' +
      'SKILLS\n' +
      '• Languages: ...\n' +
      '• Tools: ...\n' +
      '• Technologies: ...\n\n' +
      'RULES:\n' +
      '- Use bullet points ("•") for lists; NO long essay paragraphs.\n' +
      '- Keep it concise enough to roughly fit on a single page, but do NOT drop critical technical content.\n' +
      '- Do NOT simplify into generic bullets.\n' +
      '- Do NOT copy original sentences verbatim.\n\n' +
      'You must ALSO analyze how well the resume matches the target role (and, if provided, the job description).\n\n' +
      'Return ONLY valid JSON with this shape:\n' +
      '{\n' +
      '  "improved_resume": string,\n' +
      '  "job_match": {\n' +
      '    "score": number,\n' +
      '    "missing_keywords": string[],\n' +
      '    "strengths": string[],\n' +
      '    "improvements": string[]\n' +
      '  }\n' +
      '}\n\n' +
      'Rules for the JSON response:\n' +
      '- "score" must be a number from 0 to 100.\n' +
      '- "missing_keywords" should list important skills/phrases that are absent or under-emphasized.\n' +
      '- "strengths" and "improvements" should be concrete, resume-specific bullet points.\n' +
      '- The improved resume MUST NOT be identical to, or a trivial rephrasing of, the original text.\n' +
      '- Respond with JSON only, no extra commentary.';

    const evaluateImprovementQuality = (original, improved) => {
      const originalWords = original.split(/\s+/).filter(Boolean);
      const improvedWords = improved.split(/\s+/).filter(Boolean);
      const lengthRatio = improvedWords.length / Math.max(originalWords.length, 1);

      const originalLower = original.toLowerCase();
      const improvedLower = improved.toLowerCase();

      const techLikeTokens = Array.from(
        new Set(
          originalLower
            .split(/[^a-z0-9+#.]+/i)
            .map((t) => t.trim())
            .filter((t) => t.length > 3 && /[0-9+.#_]/.test(t)),
        ),
      );

      const importantKeywords = Array.from(new Set([...roleKeywords, ...techLikeTokens]));

      const missingImportant = importantKeywords.filter((kw) => !improvedLower.includes(kw.toLowerCase()));

      const tooShort = lengthRatio < 0.5;
      const lostTech =
        importantKeywords.length > 0 && missingImportant.length >= Math.ceil(importantKeywords.length * 0.5);

      return { tooShort, lostTech, missingImportant, lengthRatio };
    };

    let improvedResume = '';
    let jobMatch = {
      score: jobMatchPercentage,
      missing_keywords: missingKeywords,
      strengths: [],
      improvements: [],
    };

    let lastQuality;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const extraGuardrailInstruction =
        attempt === 1 && lastQuality
          ?
            '\n\nIMPORTANT: The previous draft removed or weakened important technical content. ' +
            'You MUST preserve the following technical terms and concepts (unless they are clearly irrelevant):\n' +
            (lastQuality.missingImportant || []).join(', ') +
            '\nDo NOT shorten the resume further; focus on clarity and impact while keeping depth.'
          : '';

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `Target role: ${selectedRole}.` +
            (jobDescription ? `\n\nJob description (if provided):\n${jobDescription}` : '') +
            '\n\nFull resume text:\n' +
            resumeText +
            '\n\nPre-computed analysis (do not contradict, but you may refine):\n' +
            `Role keyword match percentage: ${keywordMatchPercentage}\n` +
            `Matched role keywords: ${matchedKeywords.join(', ') || 'None'}\n` +
            `Missing role keywords: ${missingKeywords.join(', ') || 'None'}\n` +
            (jobDescription ? `Job description match percentage (tokens): ${jobMatchPercentage}\n` : '') +
            extraGuardrailInstruction,
        },
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) {
        if (attempt === 1) {
          return res.status(500).json({ error: 'AI did not return any improved resume data.' });
        }
        // retry once
        continue;
      }

      let parsedJson;
      try {
        parsedJson = JSON.parse(content);
      } catch (parseError) {
        const jsonMatch = content.match(/{[\s\S]*}/);
        if (!jsonMatch) {
          console.error(
            'Failed to parse AI generate-improved-resume response (no JSON found):',
            parseError,
            content,
          );
          if (attempt === 1) {
            return res.status(500).json({ error: 'AI returned invalid JSON for improved resume.' });
          }
          continue;
        }

        try {
          parsedJson = JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.error(
            'Failed to parse AI generate-improved-resume response (inner JSON error):',
            innerError,
            jsonMatch[0],
          );
          if (attempt === 1) {
            return res.status(500).json({ error: 'AI returned invalid JSON for improved resume.' });
          }
          continue;
        }
      }

      const candidateImproved =
        parsedJson && typeof parsedJson.improved_resume === 'string'
          ? parsedJson.improved_resume.trim()
          : '';

      const jobMatchRaw = parsedJson && typeof parsedJson.job_match === 'object' ? parsedJson.job_match : {};
      const rawScore = typeof jobMatchRaw.score === 'number' ? jobMatchRaw.score : jobMatchPercentage;
      const normalizedScore = Math.min(100, Math.max(0, Math.round(rawScore)));

      const candidateJobMatch = {
        score: normalizedScore,
        missing_keywords: Array.isArray(jobMatchRaw.missing_keywords)
          ? jobMatchRaw.missing_keywords
          : missingKeywords,
        strengths: Array.isArray(jobMatchRaw.strengths) ? jobMatchRaw.strengths : [],
        improvements: Array.isArray(jobMatchRaw.improvements) ? jobMatchRaw.improvements : [],
      };

      if (!candidateImproved) {
        if (attempt === 1) {
          return res
            .status(500)
            .json({ error: 'AI did not return a usable improved resume.', job_match: candidateJobMatch });
        }
        continue;
      }

      const quality = evaluateImprovementQuality(resumeText, candidateImproved);
      lastQuality = { ...quality, missingImportant: quality.missingImportant };

      // If it is not noticeably shorter or losing many technical terms, accept.
      if (!quality.tooShort && !quality.lostTech) {
        improvedResume = candidateImproved;
        jobMatch = candidateJobMatch;
        break;
      }

      // On final attempt, accept best-effort even if quality flags remain, but log.
      if (attempt === 1) {
        console.warn('Improved resume quality checks not fully satisfied, returning last candidate.');
        improvedResume = candidateImproved;
        jobMatch = candidateJobMatch;
      }
    }

    if (!improvedResume) {
      return res.status(500).json({ error: 'Failed to generate improved resume after multiple attempts.' });
    }

    return res.status(200).json({ improved_resume: improvedResume, job_match: jobMatch });
  } catch (error) {
    console.error('Error during generate-improved-resume:', error);
    const message =
      (error && typeof error === 'object' && 'message' in error && String(error.message)) ||
      'Unknown error';
    return res.status(500).json({ error: 'Failed to generate improved resume.', reason: message });
  }
});

app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    service: 'ai-career-copilot-backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`AI Career Copilot backend listening on port ${PORT}`);
});

export { app, openai };
