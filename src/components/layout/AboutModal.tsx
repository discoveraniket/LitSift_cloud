import React, { useState } from 'react';
import {
  X,
  Cpu,
  ShieldCheck,
  Heart,
  ExternalLink,
  Github,
  Package,
  Target,
  Key,
  Users,
  Code2,
  Terminal,
  Keyboard,
  Sparkles,
} from 'lucide-react';
import { getAppVersionInfo } from '../../config/version';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'authors' | 'overview' | 'tech'>('authors');
  const info = getAppVersionInfo();

  if (!isOpen) return null;

  const formattedDate = new Date(info.buildTime).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const getPhilosophyIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShieldCheck':
        return <ShieldCheck size={16} color="var(--accent-warning, #f9e2af)" style={{ flexShrink: 0 }} />;
      case 'Key':
        return <Key size={16} color="var(--accent-success, #a6e3a1)" style={{ flexShrink: 0 }} />;
      case 'Package':
        return <Package size={16} color="var(--accent-primary, #89b4fa)" style={{ flexShrink: 0 }} />;
      case 'Target':
        return <Target size={16} color="var(--accent-secondary, #b4befe)" style={{ flexShrink: 0 }} />;
      default:
        return <Cpu size={16} color="var(--accent-primary, #89b4fa)" style={{ flexShrink: 0 }} />;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary, #181825)',
          border: '1px solid var(--border-subtle, #313244)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-tertiary, #11111b)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontSize: '22px',
                background: 'rgba(137, 180, 250, 0.15)',
                border: '1px solid rgba(137, 180, 250, 0.3)',
                padding: '6px 10px',
                borderRadius: '8px',
                lineHeight: 1,
              }}
            >
              🔬
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #cdd6f4)' }}>
                  {info.name}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--accent-primary, #89b4fa)',
                    background: 'rgba(137, 180, 250, 0.15)',
                    border: '1px solid rgba(137, 180, 250, 0.3)',
                    padding: '1px 7px',
                    borderRadius: '12px',
                  }}
                >
                  v{info.version}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #6c7086)', marginTop: '2px' }}>
                Agentic Literature Synthesis Workbench • Built {formattedDate}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #6c7086)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary, #cdd6f4)';
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover, #313244)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted, #6c7086)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            background: 'var(--bg-tertiary, #11111b)',
            padding: '0 16px',
            gap: '4px',
          }}
        >
          <button
            onClick={() => setActiveTab('authors')}
            style={{
              padding: '10px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: activeTab === 'authors' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-muted, #6c7086)',
              borderBottom: activeTab === 'authors' ? '2px solid var(--accent-primary, #89b4fa)' : '2px solid transparent',
              background: 'transparent',
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Users size={14} /> Authors & Credits
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '10px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: activeTab === 'overview' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-muted, #6c7086)',
              borderBottom: activeTab === 'overview' ? '2px solid var(--accent-primary, #89b4fa)' : '2px solid transparent',
              background: 'transparent',
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={14} /> Overview & Philosophy
          </button>
          <button
            onClick={() => setActiveTab('tech')}
            style={{
              padding: '10px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: activeTab === 'tech' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-muted, #6c7086)',
              borderBottom: activeTab === 'tech' ? '2px solid var(--accent-primary, #89b4fa)' : '2px solid transparent',
              background: 'transparent',
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Code2 size={14} /> Tech Stack & Sources
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'overview' && (
            <>
              <div>
                <p style={{ fontSize: '12.5px', color: 'var(--text-primary, #cdd6f4)', fontWeight: 600, marginBottom: '4px' }}>
                  {info.tagline}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary, #a6adc8)', lineHeight: 1.6 }}>
                  {info.description}
                </p>
              </div>

              {/* Feature Highlights Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {info.philosophy.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-surface, #252538)',
                      border: '1px solid var(--border-subtle, #313244)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <div style={{ marginTop: '2px' }}>{getPhilosophyIcon(item.icon)}</div>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #6c7086)', marginTop: '2px', lineHeight: 1.4 }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Shortcuts Box */}
              <div
                style={{
                  background: 'var(--bg-tertiary, #11111b)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '11px',
                  color: 'var(--text-secondary, #a6adc8)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary, #cdd6f4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Keyboard size={13} /> Quick Keyboard Shortcuts:
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Toggle Explorer Sidebar</span>
                  <kbd style={{ background: 'var(--bg-surface, #252538)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle, #313244)', fontFamily: 'monospace' }}>Ctrl + B</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Search in Active Paper</span>
                  <kbd style={{ background: 'var(--bg-surface, #252538)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle, #313244)', fontFamily: 'monospace' }}>Ctrl + F</kbd>
                </div>
              </div>
            </>
          )}

          {activeTab === 'authors' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
                  Core Project Authors
                </div>
                {info.authors.map((author, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-surface, #252538)',
                      border: '1px solid var(--border-subtle, #313244)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #cdd6f4)' }}>
                        {author.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--accent-primary, #89b4fa)', marginTop: '2px' }}>
                        {author.role}
                      </div>
                    </div>
                    {author.github && (
                      <a
                        href={author.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: 'var(--text-secondary, #a6adc8)',
                          textDecoration: 'none',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle, #313244)',
                          background: 'var(--bg-tertiary, #11111b)',
                        }}
                      >
                        <Github size={12} /> Profile
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {/* Ecosystem Box */}
              <div
                style={{
                  background: 'var(--bg-tertiary, #11111b)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Terminal size={14} color="var(--accent-success, #a6e3a1)" /> Systemic Research Ecosystem
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #a6adc8)', lineHeight: 1.5 }}>
                  Developed as part of the <strong style={{ color: 'var(--text-primary, #cdd6f4)' }}>{info.ecosystem.name}</strong> systematic literature review ecosystem.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                  <code style={{ background: 'var(--bg-surface, #252538)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', color: 'var(--accent-success, #a6e3a1)', border: '1px solid var(--border-subtle, #313244)' }}>
                    {info.ecosystem.packageName}
                  </code>
                  <a
                    href={info.ecosystem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '11px',
                      color: 'var(--accent-primary, #89b4fa)',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Repository <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </>
          )}

          {activeTab === 'tech' && (
            <>
              {/* External Ingestion Sources */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)', marginBottom: '8px' }}>
                  Multi-Source Ingestion Integrations
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {info.ingestionSources.map((source, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: 'var(--bg-surface, #252538)',
                        border: '1px solid var(--border-subtle, #313244)',
                        color: 'var(--text-secondary, #a6adc8)',
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: 500,
                      }}
                    >
                      {source}
                    </span>
                  ))}
                </div>
              </div>

              {/* Technology Stack Grid */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)', marginBottom: '8px' }}>
                  Core Technology Stack
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {info.techStack.map((tech, idx) => (
                    <a
                      key={idx}
                      href={tech.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'var(--bg-surface, #252538)',
                        border: '1px solid var(--border-subtle, #313244)',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        textDecoration: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        transition: 'border-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary, #89b4fa)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle, #313244)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
                          {tech.name}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--accent-primary, #89b4fa)', background: 'rgba(137, 180, 250, 0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                          v{tech.version}
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted, #6c7086)' }}>
                        {tech.role}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: 'var(--bg-tertiary, #11111b)',
            borderTop: '1px solid var(--border-subtle, #313244)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-muted, #6c7086)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              Crafted with <Heart size={12} color="var(--accent-danger, #f38ba8)" fill="var(--accent-danger, #f38ba8)" /> for open science
            </span>
            <a
              href={info.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--text-muted, #6c7086)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--text-primary, #cdd6f4)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--text-muted, #6c7086)';
              }}
            >
              <Github size={12} /> GitHub
            </a>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--accent-primary, #89b4fa)',
              color: 'var(--bg-primary, #1e1e2e)',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 16px',
              fontWeight: 700,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
