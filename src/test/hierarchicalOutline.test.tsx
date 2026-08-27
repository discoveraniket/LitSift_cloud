import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ArticleReaderView } from '../components/pdf-viewer/ArticleReaderView';
import { PaperDocumentInfo } from '../types/paper';

describe('ArticleReaderView Hierarchical & Resizable Outline Suite', () => {
  const hierarchicalPaper: PaperDocumentInfo = {
    id: 'paper-hierarchical-1',
    name: 'Pseudomonas Phage Study',
    title: 'Pseudomonas Phage Study',
    sourceType: 'doi_structured',
    status: 'Ready',
    uploadedAt: Date.now(),
    abstractText: 'Abstract content goes here.',
    sections: [
      {
        id: 'sec-res-1',
        title: 'RESULTS > Isolated phage AM.P2 morphology',
        content: 'Morphology observations.',
      },
      {
        id: 'sec-res-2',
        title: 'RESULTS > AM.P2 genome analysis',
        content: 'Genome sequencing results.',
      },
      {
        id: 'sec-meth-1',
        title: 'MATERIALS AND METHODS > Bacterial strains',
        content: 'Strain descriptions.',
      },
      {
        id: 'sec-meth-2',
        title: 'MATERIALS AND METHODS > Phage propagation',
        content: 'Propagation protocol.',
      },
      {
        id: 'sec-disc',
        title: 'DISCUSSION',
        content: 'General discussion.',
      },
    ],
    tables: [
      {
        id: 'tbl-1',
        caption: 'Table 1: Host range',
        headers: ['Strain', 'Lysis'],
        rows: [['P. aeruginosa', 'Positive']],
      },
    ],
    figures: [
      {
        id: 'fig-1',
        caption: 'Figure 1: Plaque morphology',
        url: 'https://example.com/fig1.png',
      },
    ],
  };

  it('renders Document Outline header with total section count', () => {
    render(<ArticleReaderView paper={hierarchicalPaper} />);
    expect(screen.getByText('Document Outline')).toBeInTheDocument();
    expect(screen.getByText('8 sections')).toBeInTheDocument();
  });

  it('groups sections under parent headers and removes redundant parent prefixes from child buttons', () => {
    render(<ArticleReaderView paper={hierarchicalPaper} />);

    // Parent group titles and standalone outline items
    expect(screen.getByText('RESULTS')).toBeInTheDocument();
    expect(screen.getByText('MATERIALS AND METHODS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /DISCUSSION/i })).toBeInTheDocument();

    // Child buttons have clean display titles
    expect(screen.getByRole('button', { name: /Isolated phage AM\.P2 morphology/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AM\.P2 genome analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bacterial strains/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Phage propagation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tables & Datasets \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Figures & Visuals \(1\)/i })).toBeInTheDocument();
  });

  it('filters outline sections dynamically by search query', () => {
    render(<ArticleReaderView paper={hierarchicalPaper} />);

    const filterInput = screen.getByPlaceholderText('Filter outline...');
    fireEvent.change(filterInput, { target: { value: 'morphology' } });

    // Matching section is shown
    expect(screen.getByRole('button', { name: /Isolated phage AM\.P2 morphology/i })).toBeInTheDocument();
    // Non-matching sections are filtered out
    expect(screen.queryByRole('button', { name: /Bacterial strains/i })).not.toBeInTheDocument();
  });

  it('collapses and restores outline navigation with the collapse and floating buttons', () => {
    render(<ArticleReaderView paper={hierarchicalPaper} />);

    // Collapse
    const collapseBtn = screen.getByTitle('Collapse Document Outline');
    fireEvent.click(collapseBtn);

    // Nav is hidden, floating reopen button is visible
    expect(screen.queryByPlaceholderText('Filter outline...')).not.toBeInTheDocument();
    const reopenBtn = screen.getByTitle('Expand Document Outline');
    expect(reopenBtn).toBeInTheDocument();

    // Reopen
    fireEvent.click(reopenBtn);
    expect(screen.getByPlaceholderText('Filter outline...')).toBeInTheDocument();
  });

  it('toggles section group expand/collapse on chevron click', () => {
    render(<ArticleReaderView paper={hierarchicalPaper} />);

    const collapseGroupChevrons = screen.getAllByTitle('Collapse section group');
    expect(collapseGroupChevrons.length).toBeGreaterThan(0);

    // Click collapse on RESULTS group
    fireEvent.click(collapseGroupChevrons[0]);

    // Subsections under RESULTS should be hidden
    expect(screen.queryByRole('button', { name: /Isolated phage AM\.P2 morphology/i })).not.toBeInTheDocument();
  });
});
