import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import styles from './index.module.css';

interface PackageCard {
  name: string;
  version: string;
  description: string;
  path: string;
  emoji: string;
  tags: string[];
  status: 'stable' | 'beta' | 'dev';
}

const packages: PackageCard[] = [
  {
    name: '@resultsafe/core-fp-result',
    version: '0.2.1',
    description:
      'Functional Result type for TypeScript with explicit error handling. Rust-style Result with zero dependencies.',
    path: '/docs/introduction/introduction/01-overview',
    emoji: '🎯',
    tags: ['Functional', 'Type-Safe', 'Zero Dependencies'],
    status: 'stable',
  },
  {
    name: '@resultsafe/core-fp-option',
    version: '0.1.0',
    description:
      'Functional Option type for nullable values. Safe handling of optional values.',
    path: '#',
    emoji: '❓',
    tags: ['Functional', 'Optional', 'Type-Safe'],
    status: 'dev',
  },
  {
    name: '@resultsafe/core-fp-either',
    version: '0.1.0',
    description: 'Functional Either type for sum types and union handling.',
    path: '#',
    emoji: '⚖️',
    tags: ['Functional', 'Sum Types', 'Union'],
    status: 'dev',
  },
  {
    name: '@resultsafe/utils',
    version: '0.1.0',
    description:
      'Utility functions and helpers for functional programming patterns.',
    path: '#',
    emoji: '🔧',
    tags: ['Utilities', 'Helpers', 'FP'],
    status: 'beta',
  },
  {
    name: '@resultsafe/eslint-plugin',
    version: '0.1.0',
    description:
      'ESLint plugin with custom rules for ResultSafe patterns and best practices.',
    path: '#',
    emoji: '🔍',
    tags: ['Linting', 'Quality', 'Automation'],
    status: 'beta',
  },
  {
    name: '@resultsafe/cli',
    version: '0.1.0',
    description:
      'Command-line interface for ResultSafe tools, generators, and utilities.',
    path: '#',
    emoji: '💻',
    tags: ['CLI', 'Tools', 'Automation'],
    status: 'dev',
  },
];

function PackageCard({ pkg }: { pkg: PackageCard }) {
  const statusColors = {
    stable: '#2e8555',
    beta: '#ff9800',
    dev: '#f44336',
  };

  return (
    <div className={styles.packageCard}>
      <div className={styles.packageHeader}>
        <div className={styles.packageEmoji}>{pkg.emoji}</div>
        <div className={styles.packageInfo}>
          <h3 className={styles.packageName}>{pkg.name}</h3>
          <span className={styles.packageVersion}>v{pkg.version}</span>
          <span
            className={styles.packageStatus}
            style={{ backgroundColor: statusColors[pkg.status] }}
          >
            {pkg.status}
          </span>
        </div>
      </div>

      <p className={styles.packageDescription}>{pkg.description}</p>

      <div className={styles.packageTags}>
        {pkg.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </div>

      <div className={styles.packageActions}>
        <Link className={styles.actionButton} to={pkg.path}>
          {pkg.path === '#' ? 'Coming Soon' : 'View Docs'} →
        </Link>
        <a
          href="https://github.com/Livooon/resultsafe"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.actionButtonSecondary}
        >
          GitHub
        </a>
      </div>
    </div>
  );
}

function QuickLinks() {
  return (
    <section className={styles.quickLinks}>
      <div className="container">
        <div className="row">
          <div className="col col--3">
            <div className={styles.quickLink}>
              <span className={styles.quickLinkEmoji}>📚</span>
              <h4>Documentation</h4>
              <Link to="/docs/introduction/introduction/01-overview">
                Get Started →
              </Link>
            </div>
          </div>
          <div className="col col--3">
            <div className={styles.quickLink}>
              <span className={styles.quickLinkEmoji}>📦</span>
              <h4>Examples</h4>
              <Link to="/docs/examples/">51 Examples →</Link>
            </div>
          </div>
          <div className="col col--3">
            <div className={styles.quickLink}>
              <span className={styles.quickLinkEmoji}>🔧</span>
              <h4>API Reference</h4>
              <Link to="/docs/introduction/introduction/package-readme">
                View API →
              </Link>
            </div>
          </div>
          <div className="col col--3">
            <div className={styles.quickLink}>
              <span className={styles.quickLinkEmoji}>💻</span>
              <h4>GitHub</h4>
              <a
                href="https://github.com/Livooon/resultsafe"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Source →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  return (
    <section className={styles.stats}>
      <div className="container">
        <div className="row">
          <div className="col col--3">
            <div className={styles.statCard}>
              <div className={styles.statNumber}>6</div>
              <div className={styles.statLabel}>Packages</div>
            </div>
          </div>
          <div className="col col--3">
            <div className={styles.statCard}>
              <div className={styles.statNumber}>51</div>
              <div className={styles.statLabel}>Examples</div>
            </div>
          </div>
          <div className="col col--3">
            <div className={styles.statCard}>
              <div className={styles.statNumber}>0</div>
              <div className={styles.statLabel}>Dependencies</div>
            </div>
          </div>
          <div className="col col--3">
            <div className={styles.statCard}>
              <div className={styles.statNumber}>100%</div>
              <div className={styles.statLabel}>Type-Safe</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="ResultSafe - Functional Programming for TypeScript"
      description="A monorepo of functional programming libraries for TypeScript"
    >
      {/* Hero Section */}
      <header className={styles.heroBanner}>
        <div className="container">
          <h1 className={styles.heroTitle}>
            <span className={styles.heroEmoji}>🚀</span>
            {siteConfig.title}
          </h1>
          <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
          <p className={styles.heroDescription}>
            A comprehensive monorepo of functional programming libraries for
            TypeScript. Type-safe, zero-dependency, production-ready.
          </p>
          <div className={styles.heroButtons}>
            <Link
              className="button button--primary button--lg"
              to="/docs/introduction/introduction/01-overview"
            >
              Get Started 🎯
            </Link>
            <Link
              className="button button--outline button--secondary button--lg"
              to="/docs/examples/"
            >
              Browse Examples 📚
            </Link>
          </div>
        </div>
      </header>

      {/* Quick Links */}
      <QuickLinks />

      {/* Stats */}
      <Stats />

      {/* Packages Grid */}
      <section className={styles.packagesSection}>
        <div className="container">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionEmoji}>📦</span>
            Packages
          </h2>
          <p className={styles.sectionSubtitle}>
            Explore our collection of functional programming libraries
          </p>

          <div className={styles.packagesGrid}>
            {packages.map((pkg) => (
              <PackageCard key={pkg.name} pkg={pkg} />
            ))}
          </div>
        </div>
      </section>

      {/* Install Section */}
      <section className={styles.installSection}>
        <div className="container">
          <h2 className={styles.installTitle}>Quick Install</h2>
          <div className={styles.installTabs}>
            <div className={styles.installTab}>
              <h4>npm</h4>
              <pre>
                <code>npm install @resultsafe/core-fp-result</code>
              </pre>
            </div>
            <div className={styles.installTab}>
              <h4>pnpm</h4>
              <pre>
                <code>pnpm add @resultsafe/core-fp-result</code>
              </pre>
            </div>
            <div className={styles.installTab}>
              <h4>yarn</h4>
              <pre>
                <code>yarn add @resultsafe/core-fp-result</code>
              </pre>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
