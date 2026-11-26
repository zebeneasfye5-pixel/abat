import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readableMessage = error.message || 'ያልተጠበቀ የስርዓት ስህተት ተከስቷል።';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        readableMessage = parsed.error.includes('Missing or insufficient permissions')
          ? 'የመረጃ ፈቃድ ችግር ተከስቷል። እባክዎ በትክክለኛው Google አካውንት መግባትዎን ያረጋግጡ።'
          : parsed.error;
      }
    } catch {
      // Plain error message
    }
    return {
      hasError: true,
      message: readableMessage,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-stone-900 border-2 border-red-800/60 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-950 border border-red-700/60 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-heading font-bold text-amber-200">
              ይቅርታ፣ የስርዓት ስህተት ተፈጥሯል
            </h2>
            <p className="text-xs text-stone-300 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>እንደገና ሞክር</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
