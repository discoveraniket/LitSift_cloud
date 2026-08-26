export interface AppAuthor {
  name: string;
  role: string;
  github?: string;
}

export interface AppTechItem {
  name: string;
  version: string;
  role: string;
  url: string;
}

export interface AppVersionInfo {
  name: string;
  version: string;
  buildTime: string;
  tagline: string;
  description: string;
  liveUrl: string;
  githubUrl: string;
  license: string;
  authors: AppAuthor[];
  ecosystem: {
    name: string;
    packageName: string;
    url: string;
  };
  philosophy: {
    title: string;
    desc: string;
    icon: string;
  }[];
  ingestionSources: string[];
  techStack: AppTechItem[];
}

export const getAppVersionInfo = (): AppVersionInfo => {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

  return {
    name: 'LitSift Cloud',
    version,
    buildTime,
    tagline: 'The Transparent, Human-in-the-Loop Research Extraction Workspace',
    description:
      'Transform hundreds of scientific papers into auditable, structured datasets in days — not months. Built for researchers who require full auditability, zero server data retention, and paywall-free local operation.',
    liveUrl: 'https://litsift.onrender.com',
    githubUrl: 'https://github.com/discoveraniket/LitSift_cloud',
    license: 'MIT License',
    authors: [
      {
        name: 'Dr. Adhip Mukhopadhyay',
        role: 'Virology Domain Specialist',
      },
      {
        name: 'Aniket Sarkar',
        role: 'Software Architect & Developer',
        github: 'https://github.com/discoveraniket',
      },

    ],
    ecosystem: {
      name: 'asma',
      packageName: 'pip install asma',
      url: 'https://github.com/discoveraniket/asma',
    },
    philosophy: [
      {
        title: '100% Local-First & Private',
        desc: 'Workspace state stored securely in browser IndexedDB (Dexie.js). Zero vendor lock-in or third-party data tracking.',
        icon: 'ShieldCheck',
      },
      {
        title: '100% Free & BYOK',
        desc: 'Bring your Google Gemini API key. Pay pennies directly for LLM calls with zero subscription paywalls.',
        icon: 'Key',
      },
      {
        title: 'Portable Workspace Bundles',
        desc: 'Export & share complete .litsift bundles (PDFs + grid + chat + citation bounding boxes) in a single file.',
        icon: 'Package',
      },
      {
        title: 'Bi-Directional Citation Jump',
        desc: '1-click from any AG-Grid cell directly to the exact page, sentence, and visual highlight in the PDF reader.',
        icon: 'Target',
      },
    ],
    ingestionSources: ['Local PDFs', 'PubMed Central (PMC)', 'OpenAlex', 'Crossref', 'DOIs', 'Unpaywall'],
    techStack: [
      { name: 'React', version: '19.0', role: 'UI Framework', url: 'https://react.dev/' },
      { name: 'TypeScript', version: '5.7', role: 'Type Safety', url: 'https://www.typescriptlang.org/' },
      { name: 'Vite', version: '6.1', role: 'Build Tooling', url: 'https://vitejs.dev/' },
      { name: 'Google Gemini', version: '3.x SDK', role: 'Agent Intelligence', url: 'https://aistudio.google.com/' },
      { name: 'AG-Grid', version: '36.1', role: 'Data Workbench', url: 'https://www.ag-grid.com/' },
      { name: 'Dexie.js', version: '4.4', role: 'IndexedDB Persistence', url: 'https://dexie.org/' },
    ],
  };
};
