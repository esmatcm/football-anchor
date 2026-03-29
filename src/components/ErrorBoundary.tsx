import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "页面渲染异常" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white border border-red-100 rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-bold text-red-600 mb-2">页面发生错误</h2>
            <p className="text-sm text-stone-600 mb-4">已进入安全模式，你可以返回首页继续使用。</p>
            <p className="text-xs text-stone-500 mb-4 break-all">错误信息：{this.state.message}</p>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                onClick={() => (window.location.href = "/admin")}
              >
                返回后台首页
              </button>
              <button
                className="px-4 py-2 border border-stone-300 rounded-md"
                onClick={() => window.location.reload()}
              >
                重新加载
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
