
import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200 text-sm font-mono overflow-auto h-full w-full">
                    <h2 className="font-bold mb-2">Component Error</h2>
                    <p>{this.state.error?.toString()}</p>
                    <details className="mt-2 text-xs opacity-75">
                        <summary>Stack Trace</summary>
                        {this.state.errorInfo?.componentStack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
