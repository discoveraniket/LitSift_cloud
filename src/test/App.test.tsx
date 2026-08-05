import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('App Component', () => {
  it('renders the LitSift Cloud title', () => {
    render(<App />);
    expect(screen.getByText('LitSift Cloud Workspace')).toBeInTheDocument();
  });
});
