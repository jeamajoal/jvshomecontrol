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
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen bg-black text-red-500 font-mono p-8 overflow-auto flex flex-col items-center justify-center">
                    <h1 className="text-4xl mb-4 text-center">Something went wrong.</h1>
                    <div className="bg-red-900/10 border border-red-500/30 p-4 rounded max-w-3xl w-full">
                        <p className="font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
                        <pre className="text-xs opacity-70 whitespace-pre-wrap">
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-8 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                    >
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
