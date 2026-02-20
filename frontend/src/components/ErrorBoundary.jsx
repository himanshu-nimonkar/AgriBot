
import React from 'react';
import { Leaf, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

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

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        if (this.props.onRetry) {
            this.props.onRetry();
        }
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="clay-card-static p-6 h-full w-full flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-sunlit-clay/10 flex items-center justify-center">
                        <Leaf size={22} className="text-sunlit-clay" strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="font-bold text-black-forest text-sm mb-1">Something went wrong</h2>
                        <p className="text-xs text-black-forest/50 max-w-[280px]">
                            This component encountered an issue. Try again or refresh the page.
                        </p>
                    </div>
                    <details className="mt-2 text-[10px] text-black-forest/30 w-full max-w-sm">
                        <summary className="cursor-pointer hover:text-black-forest/50 transition-colors font-medium">
                            Technical Details
                        </summary>
                        <pre className="mt-2 p-3 clay-input rounded-lg text-left overflow-auto max-h-32 font-mono text-[9px] leading-relaxed">
                            {this.state.error?.toString()}
                            {this.state.errorInfo?.componentStack}
                        </pre>
                    </details>
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={this.handleRetry}
                            className="clay-button px-4 py-2 rounded-xl text-xs font-semibold text-olive-leaf inline-flex items-center gap-1.5"
                            aria-label="Try again"
                        >
                            <RefreshCw size={12} /> Try Again
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="clay-primary px-4 py-2 rounded-xl text-xs font-semibold"
                            aria-label="Reload page"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
