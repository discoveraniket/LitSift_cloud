import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout';
import { usePdfStore } from '../store/usePdfStore';

describe('Workspace Layout Panel Persistence UX', () => {
  beforeEach(() => {
    localStorage.clear();
    usePdfStore.setState({
      pdfs: [],
      activePdfId: '',
    });
  });

  it('defaults left and right panels to collapsed (false) on first-time landing', () => {
    render(<WorkspaceLayout />);

    // Left and right panels should not be present initially
    expect(screen.getByTitle(/Explorer \(Research Papers & Views\)/i)).toBeInTheDocument(); // Activity bar icon exists
    expect(localStorage.getItem('litsift_layout_show_left')).toBe('false');
    expect(localStorage.getItem('litsift_layout_show_right')).toBe('false');
  });

  it('restores open state from localStorage when previously toggled', () => {
    localStorage.setItem('litsift_layout_show_left', 'true');
    localStorage.setItem('litsift_layout_show_right', 'true');

    render(<WorkspaceLayout />);

    expect(localStorage.getItem('litsift_layout_show_left')).toBe('true');
    expect(localStorage.getItem('litsift_layout_show_right')).toBe('true');
  });
});
