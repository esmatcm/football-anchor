import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import api from "../lib/api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("加载中...");
  const { user, login } = useAuthStore();
  const navigate = useNavigate();

  const loadCaptcha = async () => {
    try {
      const res = await api.get("/auth/captcha");
      setCaptchaId(res.data.captcha_id);
      setCaptchaQuestion(res.data.question);
      setCaptchaInput("");
    } catch (err) {
      console.error(err);
      setCaptchaQuestion("验证码加载失败");
    }
  };

  useEffect(() => {
    if (user) {
      navigate(user.role === "anchor" ? "/anchor" : "/admin", { replace: true });
      return;
    }
    loadCaptcha();
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await api.post("/auth/login", {
        username,
        password,
        captcha_id: captchaId,
        captcha_value: captchaInput,
      });
      login(res.data.user, res.data.token);
      if (res.data.user.role === "anchor") {
        navigate("/anchor");
      } else {
        navigate("/admin");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "登录失败");
      await loadCaptcha();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-bg)] p-4">
      <div className="app-card p-6 md:p-8 w-full max-w-md">
        <h2 className="app-title text-center mb-2">金银伯直播管理系统</h2>
        <p className="app-subtitle text-center mb-4">欢迎回来，请先完成验证后登录</p>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-stone-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-stone-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">数字验证：{captchaQuestion}</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                className="w-full border border-stone-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="button"
                onClick={loadCaptcha}
                className="px-3 py-2 text-sm rounded-md border border-stone-300 text-stone-700 hover:bg-stone-50"
              >
                刷新
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full btn-primary"
          >
            登录
          </button>
        </form>
      </div>
    </div>
  );
}
