import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="h-screen w-screen bg-black text-red-500 font-mono p-8 overflow-auto flex flex-col items-center justify-center"
                    role="alert"
                >
                    <h1 className="text-3xl md:text-4xl mb-2 text-center font-bold">
                        Something went wrong
                    </h1>
                    <p className="text-sm text-red-400/70 mb-6 text-center max-w-md">
                        The dashboard encountered an unexpected error. This is usually
                        temporary — try reloading.
                    </p>
                    <div className="bg-red-900/10 border border-red-500/30 p-4 rounded-xl max-w-3xl w-full mb-6">
                        <p className="font-bold mb-2 break-words">
                            {this.state.error && this.state.error.toString()}
                        </p>
                        {this.state.errorInfo?.componentStack && (
                            <details className="mt-2">
                                <summary className="text-xs text-red-400/60 cursor-pointer hover:text-red-400/80 transition-colors">
                                    Show stack trace
                                </summary>
                                <pre className="text-xs opacity-70 whitespace-pre-wrap mt-2">
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </details>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-colors font-semibold"
                        >
                            Reload Dashboard
                        </button>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-lg transition-colors"
                        >
                            Try to Recover
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
