import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('LitSift Cloud Workspace Layout', () => {
  it('renders the application header and layout panels', () => {
    render(<App />);
    expect(screen.getByText('LitSift Cloud')).toBeInTheDocument();
    expect(screen.getByText('EXPLORER')).toBeInTheDocument();
    expect(screen.getByText('AGENTIC AI COMMAND CENTER')).toBeInTheDocument();
  });
});
