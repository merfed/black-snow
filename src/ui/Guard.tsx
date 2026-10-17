import { Component, type ReactNode } from 'react';

/** Keeps one broken box from blanking the whole station: it shows a quiet note and tries again a little later. */
export class Guard extends Component<{ children: ReactNode; name?: string }, { failed: boolean }> {
  state = { failed: false };
  private retry?: ReturnType<typeof setTimeout>;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) {
    console.error(`[${this.props.name ?? 'panel'}]`, err);
    this.retry = setTimeout(() => this.setState({ failed: false }), 5000);
  }
  componentWillUnmount() { clearTimeout(this.retry); }
  render() {
    if (this.state.failed) return <section className="panel"><p className="small-note dim">THE SIGNAL BREAKS UP HERE. IT WILL COME BACK.</p></section>;
    return this.props.children;
  }
}
