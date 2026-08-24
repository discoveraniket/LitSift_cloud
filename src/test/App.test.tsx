import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('LitSift Cloud Workspace Layout', () => {
  it('renders the application header, toggle controls, and layout panels', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/LitSift Cloud/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/WORKSPACE/i).length).toBeGreaterThan(0);
    expect(screen.getByTitle('Toggle Left Explorer (Ctrl+B)')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle Bottom Data Grid Panel')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle Right AI Copilot')).toBeInTheDocument();

    // Toggle Left Explorer open to verify explorer tree views
    const toggleLeftBtn = screen.getByTitle('Toggle Left Explorer (Ctrl+B)');
    fireEvent.click(toggleLeftBtn);

    expect(screen.getByText(/VIEWS/i)).toBeInTheDocument();
    expect(screen.getByText(/RESEARCH PAPERS/i)).toBeInTheDocument();
  });
});


