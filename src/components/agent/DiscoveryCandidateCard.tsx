import React, { useState } from 'react';
import {
  ExternalLink,
  Check,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import type { DiscoveredPaperCandidate } from '../../services/academicSearchService';
import { stagePaperByDoi } from '../../services/academicSearchService';
import { usePdfStore } from '../../store/usePdfStore';
import { useAgentStore } from '../../store/useAgentStore';
import { normalizeDoi } from '../../services/doiService';

interface DiscoveryCandidateCardProps {
  candidate: DiscoveredPaperCandidate;
  onPaperStaged?: (paperId: string) => void;
}

export const DiscoveryCandidateCard: React.FC<DiscoveryCandidateCardProps> = ({
  candidate,
  onPaperStaged,
}) => {
  const [isStaging, setIsStaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);

  const pdfs = usePdfStore((state) => state.pdfs);
  const setActivePdf = usePdfStore((state) => state.setActivePdf);
  const sendMessage = useAgentStore((state) => state.sendMessage);
  const isThinking = useAgentStore((state) => state.isThinking);

  const cleanCandidateDoi = normalizeDoi(candidate.doi || '');
  const matchingPaper = pdfs.find((p) => {
    if (cleanCandidateDoi && p.doi) {
      return normalizeDoi(p.doi).toLowerCase() === cleanCandidateDoi.toLowerCase();
    }
    return Boolean(candidate.title && p.title && p.title.toLowerCase().trim() === candidate.title.toLowerCase().trim());
  });

  const isInWorkspace = Boolean(candidate.isAlreadyInWorkspace || matchingPaper);

  const handleStage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInWorkspace || isStaging) return;
    if (!cleanCandidateDoi) {
      setError('Paper does not have a registered DOI to auto-import.');
      return;
    }

    setIsStaging(true);
    setError(null);
    try {
      const stagedPaper = await stagePaperByDoi(cleanCandidateDoi);
      if (onPaperStaged) {
        onPaperStaged(stagedPaper.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to stage paper into workspace.');
    } finally {
      setIsStaging(false);
    }
  };

  const handleOpenInViewer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (matchingPaper) {
      setActivePdf(matchingPaper.id);
    }
  };

  const handleAskAgentToExtract = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isThinking) return;
    const targetTitle = matchingPaper?.title || candidate.title;
    sendMessage(
      `Please extract all relevant findings for our schema columns from the paper "${targetTitle}".`,
      targetTitle
    );
  };

  // Author string formatting
  const authorsStr = candidate.authors && candidate.authors.length > 0
    ? candidate.authors.length > 3
      ? `${candidate.authors.slice(0, 3).join(', ')} et al.`
      : candidate.authors.join(', ')
    : 'Authors not specified';

  const doiUrl = cleanCandidateDoi ? `https://doi.org/${encodeURIComponent(cleanCandidateDoi)}` : candidate.landingPageUrl;
  const hasExpandableAbstract = Boolean(
    candidate.fullAbstract &&
    candidate.fullAbstract !== candidate.abstractSnippet &&
    candidate.abstractSnippet !== 'Abstract not indexed in registry.'
  );

  // OA Badge Styling
  const getOaBadgeStyle = () => {
    if (!candidate.isOa) {
      return {
        bg: 'rgba(108, 112, 134, 0.15)',
        color: '#a6adc8',
        border: 'rgba(108, 112, 134, 0.3)',
        label: 'CLOSED',
        icon: ShieldAlert,
      };
    }
    switch (candidate.oaStatus) {
      case 'gold':
        return {
          bg: 'rgba(249, 226, 175, 0.15)',
          color: '#f9e2af',
          border: 'rgba(249, 226, 175, 0.3)',
          label: 'GOLD OA',
          icon: ShieldCheck,
        };
      case 'green':
        return {
          bg: 'rgba(166, 227, 161, 0.15)',
          color: '#a6e3a1',
          border: 'rgba(166, 227, 161, 0.3)',
          label: 'GREEN OA',
          icon: ShieldCheck,
        };
      case 'hybrid':
      case 'bronze':
        return {
          bg: 'rgba(137, 180, 250, 0.15)',
          color: '#89b4fa',
          border: 'rgba(137, 180, 250, 0.3)',
          label: `${candidate.oaStatus.toUpperCase()} OA`,
          icon: ShieldCheck,
        };
      default:
        return {
          bg: 'rgba(166, 227, 161, 0.15)',
          color: '#a6e3a1',
          border: 'rgba(166, 227, 161, 0.3)',
          label: 'OPEN ACCESS',
          icon: ShieldCheck,
        };
    }
  };

  const oaBadge = getOaBadgeStyle();
  const OaIcon = oaBadge.icon;

  return (
    <div
      className="discovery-candidate-card"
      style={{
        borderRadius: '6px',
        border: '1px solid var(--border-subtle, #313244)',
        background: 'var(--bg-secondary, #181825)',
        padding: '9px 11px',
        fontSize: '11px',
        lineHeight: 1.4,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transition: 'border-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary, #89b4fa)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle, #313244)';
      }}
    >
      {/* Top Header: Badges & Year/Citations */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              background: oaBadge.bg,
              color: oaBadge.color,
              border: `1px solid ${oaBadge.border}`,
              padding: '1px 5px',
              borderRadius: '4px',
              fontSize: '9.5px',
              fontWeight: 700,
            }}
          >
            <OaIcon size={10} />
            {oaBadge.label}
          </span>

          {candidate.year && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #a6adc8)' }}>
              {candidate.year}
            </span>
          )}

          {candidate.journal && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted, #a6adc8)',
                maxWidth: '140px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={candidate.journal}
            >
              • {candidate.journal}
            </span>
          )}
        </div>

        {candidate.citationCount !== undefined && (
          <span
            style={{
              fontSize: '9.5px',
              color: 'var(--text-muted, #a6adc8)',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '1px 5px',
              borderRadius: '4px',
            }}
          >
            {candidate.citationCount} cited
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontWeight: 600, color: 'var(--text-primary, #cdd6f4)', fontSize: '11.5px', lineHeight: 1.35 }}>
        {doiUrl ? (
          <a
            href={doiUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'inherit',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: '4px',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--accent-primary, #89b4fa)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'inherit')}
            title="Open DOI resolver / publisher landing page"
          >
            <span>{candidate.title}</span>
            <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
          </a>
        ) : (
          candidate.title
        )}
      </div>

      {/* Authors */}
      <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #a6adc8)', fontStyle: 'italic' }}>
        {authorsStr}
      </div>

      {/* Abstract preview with optional toggle */}
      <div style={{ fontSize: '10.5px', color: 'var(--text-secondary, #bac2de)', lineHeight: 1.4 }}>
        <p style={{ margin: 0 }}>
          {isAbstractExpanded ? candidate.fullAbstract || candidate.abstractSnippet : candidate.abstractSnippet}
        </p>

        {hasExpandableAbstract && (
          <button
            onClick={() => setIsAbstractExpanded(!isAbstractExpanded)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '2px 0 0 0',
              color: 'var(--accent-primary, #89b4fa)',
              fontSize: '10px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              marginTop: '2px',
            }}
          >
            {isAbstractExpanded ? (
              <>Show less <ChevronUp size={10} /></>
            ) : (
              <>Show more <ChevronDown size={10} /></>
            )}
          </button>
        )}
      </div>

      {/* Error state if staging failed */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '10px',
            color: 'var(--accent-danger, #f38ba8)',
            background: 'rgba(243, 139, 168, 0.1)',
            padding: '3px 6px',
            borderRadius: '4px',
          }}
        >
          <AlertCircle size={11} />
          <span>{error}</span>
        </div>
      )}

      {/* Bottom Action Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '4px',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          marginTop: '2px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isInWorkspace ? (
            <button
              onClick={handleOpenInViewer}
              title="Already in workspace. Click to open in central viewer."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(166, 227, 161, 0.15)',
                color: 'var(--accent-success, #a6e3a1)',
                border: '1px solid rgba(166, 227, 161, 0.3)',
                borderRadius: '4px',
                padding: '3px 7px',
                fontSize: '10.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(166, 227, 161, 0.25)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(166, 227, 161, 0.15)';
              }}
            >
              <Check size={11} /> In Workspace
            </button>
          ) : (
            <button
              onClick={handleStage}
              disabled={isStaging || !cleanCandidateDoi}
              title={cleanCandidateDoi ? 'Import this paper into your workspace with 1 click' : 'No DOI available'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'var(--accent-primary, #89b4fa)',
                color: '#11111b',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10.5px',
                fontWeight: 600,
                cursor: isStaging || !cleanCandidateDoi ? 'not-allowed' : 'pointer',
                opacity: isStaging || !cleanCandidateDoi ? 0.7 : 1,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isStaging && cleanCandidateDoi) {
                  (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.filter = 'none';
              }}
            >
              {isStaging ? (
                <>
                  <Loader2 size={11} className="animate-spin" /> Staging...
                </>
              ) : (
                <>
                  <Plus size={11} /> Add to Workspace
                </>
              )}
            </button>
          )}

          {/* Quick Extract Action if in workspace */}
          {isInWorkspace && (
            <button
              onClick={handleAskAgentToExtract}
              disabled={isThinking}
              title="Instruct agent to extract schema variables from this paper"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(203, 166, 247, 0.15)',
                color: 'var(--accent-secondary, #cba6f7)',
                border: '1px solid rgba(203, 166, 247, 0.3)',
                borderRadius: '4px',
                padding: '3px 7px',
                fontSize: '10.5px',
                fontWeight: 500,
                cursor: isThinking ? 'not-allowed' : 'pointer',
                opacity: isThinking ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isThinking) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(203, 166, 247, 0.25)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(203, 166, 247, 0.15)';
              }}
            >
              <Sparkles size={10} /> Extract Findings
            </button>
          )}
        </div>

        {/* PDF Link if open access URL available */}
        {candidate.pdfUrl && (
          <a
            href={candidate.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Download / View Open Access PDF"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '10px',
              color: 'var(--accent-primary, #89b4fa)',
              textDecoration: 'none',
              padding: '2px 5px',
              borderRadius: '3px',
              background: 'rgba(137, 180, 250, 0.08)',
            }}
          >
            <FileText size={10} /> PDF <ExternalLink size={9} />
          </a>
        )}
      </div>
    </div>
  );
};
