import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorTitle: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorTitle: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorTitle: error?.message || '界面渲染出现意外异常',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary 捕获渲染错误]:', error, errorInfo);
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-[#F1F5F9] text-[#0F172A] flex items-center justify-center p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-md w-full bg-white border border-slate-300 rounded-md p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-2">
                <h1 className="text-base font-semibold text-[#0F172A]">
                  工作台遇到意外错误
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  当前页面组件未能正常完成渲染。您的近期公式草稿已保存在本地存储中，重新加载页面即可恢复工作。
                </p>
                {import.meta.env.DEV && this.state.errorTitle ? (
                  <p className="text-xs font-mono text-[#B91C1C] bg-red-50 border border-red-200 rounded px-2.5 py-2 break-words">
                    开发环境诊断：{this.state.errorTitle}
                  </p>
                ) : null}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={this.handleReload}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>重新加载页面</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
