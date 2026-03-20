import type { ChangeEvent, FC } from 'react';
import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';

type RoleOption = {
  id: string;
  label: string;
};

const ROLE_OPTIONS: RoleOption[] = [
  { id: 'software-engineer', label: 'Software Engineer' },
  { id: 'frontend-developer', label: 'Frontend Developer' },
  { id: 'backend-developer', label: 'Backend Developer' },
  { id: 'full-stack-developer', label: 'Full Stack Developer' },
  { id: 'data-scientist', label: 'Data Scientist' },
  { id: 'ml-engineer', label: 'Machine Learning Engineer' },
  { id: 'ai-engineer', label: 'AI Engineer' },
  { id: 'cloud-engineer', label: 'Cloud Engineer' },
  { id: 'devops-engineer', label: 'DevOps Engineer' },
  { id: 'cybersecurity-analyst', label: 'Cybersecurity Analyst' },
  { id: 'cloud-security-engineer', label: 'Cloud Security Engineer' },
  { id: 'mobile-app-developer', label: 'Mobile App Developer' },
  { id: 'game-developer', label: 'Game Developer' },
  { id: 'database-engineer', label: 'Database Engineer' },
  { id: 'site-reliability-engineer', label: 'Site Reliability Engineer' },
];

type AtsAnalysis = {
  score: number;
  match_percentage: number;
  breakdown?: {
    skills: number;
    experience: number;
    projects: number;
    keywords: number;
  };
  strengths: string[];
  improvements: string[];
  missing_keywords: string[];
  suggestions: string[];
  explanation?: string;
};

type ResourceLink = {
  label: string;
  url: string;
  platform: 'YouTube' | 'Udemy' | 'Coursera';
};

const ROLE_RESOURCES: Record<string, ResourceLink[]> = {
  'Software Engineer': [
    {
      label: 'CS50x – Introduction to Computer Science',
      url: 'https://www.youtube.com/watch?v=8mAITcNt710&list=PLhQjrBD2T381popQpl-YKy5BXm-E4k5tT',
      platform: 'YouTube',
    },
    {
      label: 'Algorithms Specialization',
      url: 'https://www.coursera.org/specializations/algorithms',
      platform: 'Coursera',
    },
    {
      label: 'Java Programming Masterclass',
      url: 'https://www.udemy.com/course/java-the-complete-java-developer-course/',
      platform: 'Udemy',
    },
  ],
  'Frontend Developer': [
    {
      label: 'React Official Tutorial – Beta Docs',
      url: 'https://react.dev/learn',
      platform: 'YouTube',
    },
    {
      label: 'Tailwind CSS From Scratch',
      url: 'https://www.youtube.com/watch?v=dFgzHOX84xQ',
      platform: 'YouTube',
    },
    {
      label: 'Meta Front-End Developer Professional Certificate',
      url: 'https://www.coursera.org/professional-certificates/meta-front-end-developer',
      platform: 'Coursera',
    },
  ],
  'Backend Developer': [
    {
      label: 'Node.js Crash Course',
      url: 'https://www.youtube.com/watch?v=fBNz5xF-Kx4',
      platform: 'YouTube',
    },
    {
      label: 'PostgreSQL for Everybody',
      url: 'https://www.coursera.org/specializations/postgresql-for-everybody',
      platform: 'Coursera',
    },
    {
      label: 'NodeJS – The Complete Guide',
      url: 'https://www.udemy.com/course/nodejs-the-complete-guide/',
      platform: 'Udemy',
    },
  ],
  'Cloud Security Engineer': [
    {
      label: 'AWS Security Best Practices (re:Invent talk)',
      url: 'https://www.youtube.com/watch?v=ULJ9E2pAb-g',
      platform: 'YouTube',
    },
    {
      label: 'AWS Certified Security – Specialty (Exam Prep)',
      url: 'https://www.udemy.com/course/aws-certified-security-specialty/',
      platform: 'Udemy',
    },
    {
      label: 'Google Cloud Security Fundamentals',
      url: 'https://www.coursera.org/learn/security-google-cloud-platform-fundamentals',
      platform: 'Coursera',
    },
  ],
};

export const App: FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AtsAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'strengths' | 'improvements' | 'suggestions'>('summary');
  const [openSuggestionIndex, setOpenSuggestionIndex] = useState<number | null>(null);
  const [isFixingIndex, setIsFixingIndex] = useState<number | null>(null);
  const [improvedResume, setImprovedResume] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [jobMatch, setJobMatch] = useState<
    | {
        score: number;
        match_percentage: number;
        missing_keywords: string[];
        strengths: string[];
        improvements: string[];
      }
    | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [resumeView, setResumeView] = useState<'original' | 'improved'>('improved');
  const [showWhyScore, setShowWhyScore] = useState(false);
  const [scanHistory, setScanHistory] = useState<
    { timestamp: string; role: string | null; score: number; match_percentage: number }[]
  >([]);

  const apiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

  const selectedRoleLabel = useMemo(() => {
    if (!selectedRoleId) return null;
    return ROLE_OPTIONS.find((role) => role.id === selectedRoleId)?.label ?? null;
  }, [selectedRoleId]);

  const learningResources: ResourceLink[] | null = useMemo(() => {
    if (!selectedRoleLabel) return null;
    return ROLE_RESOURCES[selectedRoleLabel] ?? null;
  }, [selectedRoleLabel]);

  const handleRoleSelect = (roleId: string) => {
    setSelectedRoleId(roleId);
    setAnalysis(null);
    setAnalysisError(null);
    setActiveTab('summary');
    setOpenSuggestionIndex(null);
    setImprovedResume(null);
    setJobMatch(null);
    setResumeText(null);
    setLoading(false);
    setShowWhyScore(false);
    setResumeView('improved');
  };

  const handleUploadClick = () => {
    setUploadError(null);
    setAnalysisError(null);
    setAnalysis(null);
    setActiveTab('summary');
    setOpenSuggestionIndex(null);
    setImprovedResume(null);
    setJobMatch(null);
    setResumeText(null);
    setLoading(false);
    setShowWhyScore(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Please upload a PDF file.');
      setPdfFile(null);
      setPdfPreviewUrl(null);
      event.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPdfFile(file);
    setPdfPreviewUrl(objectUrl);
    setUploadError(null);
    setAnalysis(null);
    setAnalysisError(null);
    setActiveTab('summary');
    setOpenSuggestionIndex(null);
    setImprovedResume(null);
    setJobMatch(null);
    setResumeText(null);
    setLoading(false);
    setShowWhyScore(false);
    setResumeView('improved');
  };

  const handleScan = async () => {
    if (!selectedRoleLabel || !pdfFile) return;

    setIsScanning(true);
    setAnalysisError(null);
    setAnalysis(null);
    setActiveTab('summary');
    setOpenSuggestionIndex(null);
    setImprovedResume(null);
    setJobMatch(null);
    setResumeText(null);
    setLoading(false);
    setShowWhyScore(false);
    setResumeView('improved');

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('role', selectedRoleLabel);

      const response = await fetch(`${apiBaseUrl}/api/ats/scan`, {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        const reason = payload?.reason ? ` (${String(payload.reason)})` : '';
        setAnalysisError((payload?.error ?? 'Failed to scan resume.') + reason);
        return;
      }

      const safeScore = typeof payload.score === 'number' ? payload.score : 0;
      const safeMatch = typeof payload.match_percentage === 'number' ? payload.match_percentage : 0;

      const nextAnalysis: AtsAnalysis = {
        score: Math.min(100, Math.max(0, Math.round(safeScore))),
        match_percentage: Math.min(100, Math.max(0, Math.round(safeMatch))),
        breakdown:
          payload.breakdown && typeof payload.breakdown === 'object'
            ? {
                skills: Number.isFinite(payload.breakdown.skills) ? Math.round(payload.breakdown.skills) : 0,
                experience: Number.isFinite(payload.breakdown.experience)
                  ? Math.round(payload.breakdown.experience)
                  : 0,
                projects: Number.isFinite(payload.breakdown.projects) ? Math.round(payload.breakdown.projects) : 0,
                keywords: Number.isFinite(payload.breakdown.keywords) ? Math.round(payload.breakdown.keywords) : 0,
              }
            : undefined,
        strengths: Array.isArray(payload.strengths) ? payload.strengths : [],
        improvements: Array.isArray(payload.improvements) ? payload.improvements : [],
        missing_keywords: Array.isArray(payload.missing_keywords) ? payload.missing_keywords : [],
        suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
        explanation: typeof payload.explanation === 'string' ? payload.explanation : undefined,
      };

      setAnalysis(nextAnalysis);

      // Update in-memory history (keep last 3 scans).
      setScanHistory((prev) => {
        const entry = {
          timestamp: new Date().toISOString(),
          role: selectedRoleLabel,
          score: nextAnalysis.score,
          match_percentage: nextAnalysis.match_percentage,
        };
        const updated = [entry, ...prev];
        return updated.slice(0, 3);
      });
    } catch (error) {
      setAnalysisError('Network error while scanning resume.');
    } finally {
      setIsScanning(false);
    }
  };

  // Call backend to improve a single bullet via /api/ats/fix-bullet
  const handleFixBullet = async (index: number) => {
    if (!analysis || !selectedRoleLabel) return;

    const originalBullet = analysis.improvements[index];
    if (!originalBullet) return;

    setIsFixingIndex(index);
    try {
      const response = await fetch(`${apiBaseUrl}/api/ats/fix-bullet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: selectedRoleLabel,
          original_bullet: originalBullet,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const reason = payload?.reason ? ` (${String(payload.reason)})` : '';
        setAnalysisError((payload?.error ?? 'Failed to improve bullet.') + reason);
        return;
      }

      const improvedBullet = typeof payload.improved_bullet === 'string' ? payload.improved_bullet : '';
      if (!improvedBullet) return;

      setAnalysis((prev) => {
        if (!prev) return prev;
        const updatedSuggestions = [...prev.suggestions];
        updatedSuggestions[index] = improvedBullet;
        return { ...prev, suggestions: updatedSuggestions };
      });

      setOpenSuggestionIndex(index);
    } catch (error) {
      setAnalysisError('Network error while improving bullet.');
    } finally {
      setIsFixingIndex(null);
    }
  };

  // Generate improved resume + job match via /generate-improved-resume
  const generateImprovedResume = async () => {
    if (!pdfFile || !selectedRoleLabel) return;

    setLoading(true);
    setImprovedResume(null);
    setJobMatch(null);

    try {
      // Step 1: ensure we have plain resume text by calling /api/resume/parse
      let text = resumeText;
      if (!text) {
        const formData = new FormData();
        formData.append('file', pdfFile);

        const parseResponse = await fetch(`${apiBaseUrl}/api/resume/parse`, {
          method: 'POST',
          body: formData,
        });

        const parsePayload = await parseResponse.json();
        if (!parseResponse.ok) {
          const reason = parsePayload?.reason ? ` (${String(parsePayload.reason)})` : '';
          setAnalysisError((parsePayload?.error ?? 'Failed to read resume text.') + reason);
          return;
        }

        text = typeof parsePayload.text === 'string' ? parsePayload.text : '';
        setResumeText(text || null);
      }

      if (!text) {
        setAnalysisError('Could not extract text from resume.');
        return;
      }

      // Step 2: call JSON endpoint to generate improved resume + job match
      const response = await fetch(`${apiBaseUrl}/generate-improved-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: text,
          selected_role: selectedRoleLabel,
          job_description: jobDescription || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const reason = data?.reason ? ` (${String(data.reason)})` : '';
        setAnalysisError((data?.error ?? 'Failed to generate improved resume.') + reason);
        return;
      }

      setImprovedResume(typeof data.improved_resume === 'string' ? data.improved_resume : null);

      if (data.job_match && typeof data.job_match === 'object') {
        const jm = data.job_match;
        setJobMatch({
          score:
            typeof jm.score === 'number' ? Math.min(100, Math.max(0, Math.round(jm.score))) : 0,
          match_percentage:
            typeof jm.score === 'number' ? Math.min(100, Math.max(0, Math.round(jm.score))) : 0,
          missing_keywords: Array.isArray(jm.missing_keywords) ? jm.missing_keywords : [],
          strengths: Array.isArray(jm.strengths) ? jm.strengths : [],
          improvements: Array.isArray(jm.improvements) ? jm.improvements : [],
        });
      }
    } catch (error) {
      setAnalysisError('Network error while generating improved resume.');
    } finally {
      setLoading(false);
    }
  };

  // Download a simple PDF report using jsPDF
  const handleDownloadReport = () => {
    if (!analysis) return;

    const doc = new jsPDF();
    let y = 10;

    const addLine = (text: string, options?: { bold?: boolean }) => {
      doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
      doc.text(text, 10, y);
      y += 6;
    };

    addLine('AI Career Copilot – ATS Report', { bold: true });
    addLine('');

    addLine(`Role: ${selectedRoleLabel ?? 'N/A'}`);
    addLine(`ATS Score: ${analysis.score}/100`);
    addLine(`Match Percentage: ${analysis.match_percentage}%`);

    if (analysis.breakdown) {
      addLine('');
      addLine('Score Breakdown:', { bold: true });
      addLine(`Skills: ${analysis.breakdown.skills}`);
      addLine(`Experience: ${analysis.breakdown.experience}`);
      addLine(`Projects: ${analysis.breakdown.projects}`);
      addLine(`Keywords: ${analysis.breakdown.keywords}`);
    }

    if (analysis.strengths.length) {
      addLine('');
      addLine('Strengths:', { bold: true });
      analysis.strengths.forEach((item) => {
        addLine(`• ${item}`);
      });
    }

    if (analysis.improvements.length) {
      addLine('');
      addLine('Improvements:', { bold: true });
      analysis.improvements.forEach((item) => {
        addLine(`• ${item}`);
      });
    }

    if (analysis.suggestions.length) {
      addLine('');
      addLine('Suggestions:', { bold: true });
      analysis.suggestions.forEach((item) => {
        addLine(`• ${item}`);
      });
    }

    if (analysis.missing_keywords.length) {
      addLine('');
      addLine('Missing Keywords:', { bold: true });
      addLine(analysis.missing_keywords.join(', '));
    }

    doc.save('ats-report.pdf');
  };

  // Download the improved resume as a formatted PDF using jsPDF
  const handleDownloadImprovedResume = () => {
    if (!improvedResume) return;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const margin = 40;
    const maxWidth = 520;
    let y = margin;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);

    const lines = improvedResume.split('\n');

    lines.forEach((rawLine: string) => {
      if (y > 750) return; // hard stop: single page only

      const line = rawLine.trim();
      if (!line) {
        y += 8;
        return;
      }

      const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
      const isBullet = line.startsWith('•');

      let text = line;
      let x = margin;

      if (isBullet) {
        text = line.slice(1).trimStart();
        x = margin + 16;
      }

      if (isAllCaps) {
        doc.setFont('Helvetica', 'bold');
      } else {
        doc.setFont('Helvetica', 'normal');
      }

      const availableWidth = maxWidth - (x - margin);
      const wrapped = doc.splitTextToSize(text, availableWidth);

      wrapped.forEach((wrappedLine: string) => {
        if (y > 750) return; // do not overflow beyond one page

        if (isBullet) {
          // draw the bullet symbol to the left
          doc.setFont('Helvetica', 'normal');
          doc.text('•', margin, y);
          // restore heading weight if needed for the line text
          if (isAllCaps) {
            doc.setFont('Helvetica', 'bold');
          } else {
            doc.setFont('Helvetica', 'normal');
          }
        }

        doc.text(wrappedLine, x, y);
        y += 12; // tight line spacing for 1-page fit
      });
    });

    doc.save('improved_resume.pdf');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1f] to-[#050814] text-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          <motion.section
            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 h-full flex flex-col shadow-[0_18px_50px_rgba(15,23,42,0.85)]"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI Career Copilot · Private, on your terms</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
            Design your next role
            <span className="block bg-gradient-to-r from-brand-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              with an AI career partner.
            </span>
          </h1>

          <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-6 max-w-xl">
            Pick a target role, upload your resume as a PDF, and let an
            ATS-style scanner highlight what&apos;s working and what to improve.
          </p>

          <div className="mb-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 mb-2">
              1 · Choose your target role
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((role) => {
                const isSelected = selectedRoleId === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => handleRoleSelect(role.id)}
                    className={
                      'rounded-2xl border px-3 py-2 text-left text-xs md:text-[11px] transition ' +
                      (isSelected
                        ? 'border-brand-400/80 bg-brand-500/10 text-brand-50 shadow-[0_0_0_1px_rgba(96,165,250,0.4)]'
                        : 'border-slate-700/80 bg-slate-900/60 text-slate-200 hover:border-slate-500/90')
                    }
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-4">
            <button
              type="button"
              onClick={handleUploadClick}
              className="inline-flex items-center justify-center rounded-full bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Upload resume (PDF)
            </button>
            <button
              type="button"
              onClick={handleScan}
              disabled={!selectedRoleId || !pdfFile || isScanning}
              className="inline-flex items-center justify-center rounded-full border border-slate-700/90 bg-slate-900/60 px-4 py-2.5 text-xs md:text-sm font-medium text-slate-200 hover:border-slate-500/90 hover:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isScanning ? 'Scanning…' : 'Scan Resume'}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />

          {uploadError && (
            <p className="mt-1 text-xs text-red-400 max-w-md">{uploadError}</p>
          )}

          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 mb-2">
              2 · Resume preview
            </p>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3 h-52 md:h-64 flex items-center justify-center overflow-hidden">
              {pdfPreviewUrl ? (
                <iframe
                  title="Resume preview"
                  src={pdfPreviewUrl}
                  className="h-full w-full rounded-xl border border-slate-800/80 bg-slate-950"
                />
              ) : (
                <p className="text-[11px] text-slate-500">
                  Upload a PDF resume to see a live preview here.
                </p>
              )}
            </div>
          </div>

          {/* Job description input for job matching */}
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 mb-2">
              3 · Paste job description (optional)
            </p>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the target job description here to see how well your resume aligns."
              className="w-full rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-400/80 h-24 resize-none"
            />
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <button
                type="button"
                onClick={generateImprovedResume}
                disabled={!pdfFile || !selectedRoleLabel || loading}
                className="inline-flex items-center justify-center rounded-full border border-brand-500/80 bg-brand-500/10 px-3 py-1.5 font-medium text-brand-100 hover:bg-brand-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Generating…' : 'Generate improved resume'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-[11px] text-slate-400 mt-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Uses GPT-4o for tailored plans</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              <span>No generic templates · everything contextualized</span>
            </div>
          </div>
          </motion.section>

          <motion.aside
            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 md:p-6 h-full flex flex-col gap-4 shadow-[0_18px_50px_rgba(15,23,42,0.9)]"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: 'easeOut', delay: 0.08 }}
          >
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            3 · ATS scan results
          </p>

          <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-4 flex flex-col gap-4">
            {analysisError && (
              <p className="text-[11px] text-red-400">{analysisError}</p>
            )}

            {!analysis && !analysisError && !isScanning && (
              <div className="space-y-3 text-[11px] text-slate-400">
                <p>
                  Select a role, upload your PDF resume, and run a scan to see
                  strengths and improvements tailored to your target role.
                </p>
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-3">
                  <p className="text-[11px] font-semibold text-slate-200 mb-1">
                    🚀 Make the most of this scan
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-400">
                    <li>Highlight outcomes and metrics in each bullet.</li>
                    <li>Mirror key skills from the job description.</li>
                    <li>Keep bullets focused: one impact per line.</li>
                  </ul>
                </div>
              </div>
            )}

            {isScanning && (
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className="h-3 w-3 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" />
                <span>Analyzing resume…</span>
              </div>
            )}

            {analysis && (
              <>
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-200">
                    <span className="font-semibold">ATS Score</span>
                    <span className="font-mono text-emerald-300">
                      {analysis.score}/100
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all"
                      style={{ width: `${analysis.score}%` }}
                    />
                  </div>
                  {selectedRoleLabel && (
                    <div className="flex items-center justify-between text-[11px] text-slate-200 mt-1">
                      <span className="text-slate-400">Match with {selectedRoleLabel}</span>
                      <span className="font-mono text-sky-300">
                        {analysis.match_percentage}%
                      </span>
                    </div>
                  )}
                  {analysis.breakdown && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] font-semibold text-slate-300">Score breakdown</p>
                      {(() => {
                        const breakdown = analysis.breakdown!;
                        return (['skills', 'experience', 'projects', 'keywords'] as const).map((key) => (
                          <div key={key} className="flex items-center gap-2 text-[10px] text-slate-300">
                            <span className="w-16 capitalize text-slate-400">{key}</span>
                            <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-slate-100"
                                style={{ width: `${breakdown[key] ?? 0}%` }}
                              />
                            </div>
                            <span className="w-8 text-right font-mono text-slate-200">
                              {breakdown[key]}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300 mb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>
                    Role:
                    {' '}
                    <span className="font-medium text-emerald-300">
                      {selectedRoleLabel ?? 'Not selected'}
                    </span>
                  </span>
                </div>

                {analysis.missing_keywords.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[11px] font-semibold text-rose-300 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      Missing keywords
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.missing_keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="inline-flex items-center rounded-full border border-rose-500/70 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-100"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-1 mb-2 flex items-center gap-1 rounded-full bg-slate-900/80 p-0.5 text-[10px]">
                  {['summary', 'strengths', 'improvements', 'suggestions'].map((tab) => {
                    const labelMap: Record<string, string> = {
                      summary: 'Summary',
                      strengths: 'Strengths',
                      improvements: 'Improvements',
                      suggestions: 'Suggestions',
                    };
                    const isActive = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab as typeof activeTab)}
                        className={
                          'flex-1 rounded-full px-2 py-1 text-center transition ' +
                          (isActive
                            ? 'bg-slate-100 text-slate-900 text-[10px] font-semibold'
                            : 'text-slate-400 hover:text-slate-100')
                        }
                      >
                        {labelMap[tab]}
                      </button>
                    );
                  })}
                </div>

                {activeTab === 'summary' && (
                  <div className="space-y-1 text-[11px] text-slate-200">
                    <p>
                      <span className="text-slate-400">Overall assessment:</span>{' '}
                      Your resume scores
                      {' '}
                      <span className="font-semibold text-emerald-300">{analysis.score}/100</span>
                      {' '}
                      with a
                      {' '}
                      <span className="font-semibold text-sky-300">
                        {analysis.match_percentage}%
                      </span>
                      {' '}
                      match for this role.
                    </p>
                    <p className="text-slate-400">
                      Use the tabs above to explore detailed strengths, improvement
                      areas, and suggested bullet rewrites.
                    </p>
                    {analysis.explanation && (
                      <div className="mt-2 border border-slate-800/80 rounded-xl bg-slate-950/70">
                        <button
                          type="button"
                          onClick={() => setShowWhyScore((prev) => !prev)}
                          className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-slate-300"
                        >
                          <span>Why this score?</span>
                          <span className="text-slate-500">{showWhyScore ? 'Hide' : 'Show'}</span>
                        </button>
                        {showWhyScore && (
                          <div className="px-3 pb-2 text-[10px] text-slate-300 border-t border-slate-800/80">
                            {analysis.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'strengths' && (
                  <div>
                    <p className="text-[11px] font-semibold text-emerald-300 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      ✅ Strengths
                    </p>
                    {analysis.strengths.length > 0 ? (
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-100">
                        {analysis.strengths.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-500">No strengths detected.</p>
                    )}
                  </div>
                )}

                {activeTab === 'improvements' && (
                  <div>
                    <p className="text-[11px] font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      ⚠️ Improvements
                    </p>
                    {analysis.improvements.length > 0 ? (
                      <ul className="space-y-2 text-[11px] text-amber-100">
                        {analysis.improvements.map((item, index) => {
                          const suggestion = analysis.suggestions[index];
                          const isOpen = openSuggestionIndex === index;
                          return (
                            <li key={item} className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-2">
                              <div className="flex items-start justify-between gap-2">
                                <span className="flex-1">{item}</span>
                                {suggestion && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      isOpen
                                        ? setOpenSuggestionIndex(null)
                                        : handleFixBullet(index)
                                    }
                                    className="ml-2 inline-flex items-center rounded-full border border-amber-400/70 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-500/20"
                                  >
                                    {isFixingIndex === index
                                      ? 'Fixing…'
                                      : isOpen
                                      ? 'Hide fix'
                                      : 'Fix this'}
                                  </button>
                                )}
                              </div>
                              {suggestion && isOpen && (
                                <div className="mt-1 rounded-lg bg-slate-950/80 px-2 py-1 text-[10px] text-emerald-100 border border-emerald-500/40">
                                  <span className="font-semibold text-emerald-300 mr-1">
                                    Improved bullet:
                                  </span>
                                  {suggestion}{' '}
                                  <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(suggestion)}
                                    className="ml-1 inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-100 hover:bg-emerald-500/20"
                                  >
                                    Copy
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-500">No improvements detected.</p>
                    )}
                  </div>
                )}

                {activeTab === 'suggestions' && (
                  <div>
                    <p className="text-[11px] font-semibold text-sky-300 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                      💡 Suggested bullets
                    </p>
                    {analysis.suggestions.length > 0 ? (
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-sky-100">
                        {analysis.suggestions.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-500">No suggestions available.</p>
                    )}
                  </div>
                )}

                {learningResources && learningResources.length > 0 && (
                  <div className="mt-3 border-t border-slate-800/80 pt-3">
                    <p className="text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                      Suggested learning resources
                    </p>
                    <ul className="space-y-1 text-[11px]">
                      {learningResources.map((resource) => (
                        <li key={resource.url} className="flex items-center gap-1.5">
                          <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {resource.platform}
                          </span>
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-300 hover:text-sky-200 underline decoration-sky-500/60 decoration-dotted"
                          >
                            {resource.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Scan history (last 3 scans in this session) */}
                {scanHistory.length > 0 && (
                  <div className="mt-3 border-t border-slate-800/80 pt-3">
                    <p className="text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      History (last 3 scans)
                    </p>
                    <ul className="space-y-1 text-[10px] text-slate-400">
                      {scanHistory.map((entry) => (
                        <li key={entry.timestamp} className="flex items-center justify-between gap-2">
                          <span className="truncate max-w-[55%]">
                            {new Date(entry.timestamp).toLocaleTimeString()} ·{' '}
                            {entry.role ?? 'Unknown role'}
                          </span>
                          <span className="font-mono text-slate-300">
                            {entry.score}/100 · {entry.match_percentage}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Download report button */}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleDownloadReport}
                    className="inline-flex items-center rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-medium text-slate-200 hover:border-slate-500/90 hover:bg-slate-900"
                  >
                    Download report (PDF)
                  </button>
                </div>
              </>
            )}
          </div>
          </motion.aside>

          {/* Right column: improved resume + job match / helpful tips */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 md:p-6 h-full flex flex-col gap-4 text-[11px]">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Resume preview & job match
                </p>
                {loading && (
                  <span className="block text-[10px] text-slate-300 mt-0.5">Generating improved resume…</span>
                )}
              </div>
              {resumeText && improvedResume && (
                <div className="inline-flex items-center rounded-full bg-slate-900/80 border border-slate-600/80 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setResumeView('original')}
                    className={`px-2 py-0.5 rounded-full transition-colors ${
                      resumeView === 'original'
                        ? 'bg-white text-slate-900'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setResumeView('improved')}
                    className={`px-2 py-0.5 rounded-full transition-colors ${
                      resumeView === 'improved'
                        ? 'bg-white text-slate-900'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Improved
                  </button>
                </div>
              )}
            </div>

            {!improvedResume && !loading && (
              <div className="space-y-3 text-[11px] text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/5/10 bg-slate-950/40 p-3">
                  <p className="text-[11px] font-semibold mb-1">🚀 Improve your resume</p>
                  <p className="text-slate-400 mb-1">
                    Click <span className="font-semibold">"Generate improved resume"</span> to get a role-tailored, ATS-optimized version of your resume.
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>Stronger bullets with impact and metrics.</li>
                    <li>Better alignment with your target role.</li>
                    <li>More relevant keywords for ATS systems.</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  <p className="text-[11px] font-semibold mb-1">🔍 What recruiters look for</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>Clear narrative of growth and ownership.</li>
                    <li>Evidence of impact: shipped features, reduced costs, improved reliability.</li>
                    <li>Skills matching the job description, not a generic list.</li>
                  </ul>
                </div>
              </div>
            )}

            {improvedResume && (
              <>
                {/* Improved resume panel */}
                <div className="flex-1 flex flex-col gap-2 min-h-[220px]">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    {resumeView === 'original' ? 'Original resume (parsed preview)' : 'Improved resume (preview)'}
                  </p>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 flex-1 max-h-[700px] overflow-y-auto pr-2">
                    {resumeView === 'original' && resumeText ? (
                      <div className="bg-white text-black p-5 rounded-lg shadow-lg font-sans text-xs sm:text-sm leading-6 whitespace-pre-wrap">
                        {resumeText}
                      </div>
                    ) : (
                      <div className="bg-white text-black p-5 rounded-lg shadow-lg font-sans text-xs sm:text-sm leading-6">
                        {improvedResume
                          .split('\n')
                          .map((rawLine, index) => {
                          const line = rawLine.trim();

                          if (!line) {
                            return <div key={index} className="h-2" />;
                          }

                          const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
                          const isBullet = line.startsWith('•');

                          // First line: likely the candidate name
                          if (index === 0) {
                            return (
                              <h2
                                key={index}
                                className="text-base sm:text-lg font-bold tracking-tight text-slate-900 mb-1"
                              >
                                {line}
                              </h2>
                            );
                          }

                          // Second line: contact line
                          if (index === 1) {
                            return (
                              <p key={index} className="text-[11px] sm:text-xs text-slate-600 mb-2">
                                {line}
                              </p>
                            );
                          }

                          if (isBullet) {
                            return (
                              <div key={index} className="flex text-[11px] sm:text-xs text-slate-800 ml-1">
                                <span className="mr-2">•</span>
                                <span>{line.slice(1).trimStart()}</span>
                              </div>
                            );
                          }

                          if (isAllCaps) {
                            return (
                              <h3
                                key={index}
                                className="mt-4 mb-1 text-[11px] sm:text-xs font-semibold tracking-[0.16em] text-slate-700"
                              >
                                {line}
                              </h3>
                            );
                          }

                          return (
                            <p key={index} className="text-[11px] sm:text-xs text-slate-800">
                              {line}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={handleDownloadImprovedResume}
                      className="inline-flex items-center rounded-full border border-slate-500/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-medium text-slate-200 hover:border-slate-300/90 hover:bg-slate-900"
                    >
                      Download improved resume (PDF)
                    </button>
                    <button
                      type="button"
                      onClick={() => improvedResume && navigator.clipboard.writeText(improvedResume)}
                      className="inline-flex items-center rounded-full border border-slate-500/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-medium text-slate-200 hover:border-slate-300/90 hover:bg-slate-900"
                    >
                      Copy all
                    </button>
                  </div>
                </div>

                {/* Job match details panel */}
                <div className="flex-1 flex flex-col gap-2 min-h-[160px]">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    Job match details
                  </p>
                  {jobMatch ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-200">
                        <span className="text-slate-400">Job match</span>
                        <span className="font-mono text-sky-300">{jobMatch.match_percentage}%</span>
                      </div>
                      {jobMatch.missing_keywords.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-rose-300 mb-1 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            Missing job keywords
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {jobMatch.missing_keywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="inline-flex items-center rounded-full border border-rose-500/70 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-100"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {jobMatch.strengths.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-emerald-300 mb-1 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Strengths
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-100">
                            {jobMatch.strengths.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {jobMatch.improvements.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Tailored improvements
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-100">
                            {jobMatch.improvements.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!jobMatch.missing_keywords.length && !jobMatch.strengths.length && !jobMatch.improvements.length && (
                        <p className="text-[11px] text-slate-400">
                          Your resume already aligns strongly with this role. Consider adding more specific metrics for an extra edge.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Job match insights will appear here after generating an improved resume.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
