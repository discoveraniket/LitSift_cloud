import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('LitSift Cloud Workspace Layout', () => {
  it('renders the application header, toggle controls, and layout panels', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('LitSift Cloud')).toBeInTheDocument();
    });

    expect(screen.getByText('EXPLORER')).toBeInTheDocument();
    expect(screen.getByText('AGENTIC AI COMMAND CENTER')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle Left Explorer (Ctrl+B)')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle Bottom Data Grid')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle Right AI Agent')).toBeInTheDocument();
    expect(screen.getByTitle('Zen Reader Mode (Hide All Panels)')).toBeInTheDocument();
  });
});
