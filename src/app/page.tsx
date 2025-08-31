'use client';
import { useState } from 'react';

export default function Page() {
    const [email, setEmail] = useState('demo@example.com');
    const [password, setPassword] = useState('Passw0rd!123');
    const [message, setMessage] = useState<string>('');

    async function onLogin(e: React.FormEvent) {
        e.preventDefault();
        setMessage('送信中...');
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setMessage(`ログイン完了：${data.email}`);
            } else {
                setMessage(`ログイン失敗：${data.error || res.status}`);
            }
        } catch {
            setMessage('通信エラー');
        }
    }

    async function onCheck() {
        setMessage('確認中...');
        const res = await fetch('/api/me', { method: 'GET', credentials: 'include' });
        const data = await res.json();
        if (res.ok && data.ok) {
            setMessage(`ログイン中：${data.email}`);
        } else {
            setMessage('未ログイン');
        }
    }

    async function onLogout() {
        await fetch('/api/logout', { method: 'GET', credentials: 'include' });
        setMessage('ログアウトしました');
    }

    return (
        <main className="mx-auto mt-10 max-w-md font-sans p-4">
            <h1 className="text-2xl font-semibold mb-4">ログイン（簡易版）</h1>

            <form onSubmit={onLogin} className="space-y-4">
                <label className="block space-y-1">
                    <span className="text-sm text-gray-700">メールアドレス</span>
                    <input
                        className="w-full rounded-xl border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-gray-900"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        required
                        placeholder="you@example.com"
                    />
                </label>

                <label className="block space-y-1">
                    <span className="text-sm text-gray-700">パスワード</span>
                    <input
                        className="w-full rounded-xl border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-gray-900"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type="password"
                        required
                        placeholder="••••••••"
                    />
                </label>

                <button
                    type="submit"
                    className="w-full rounded-xl bg-black px-4 py-3 text-white hover:opacity-90"
                >
                    送信（ログイン）
                </button>
            </form>

            <div className="mt-4 flex gap-2">
                <button onClick={onCheck} className="rounded-xl border px-3 py-2">
                    ログイン状態を取得（GET）
                </button>
                <button onClick={onLogout} className="rounded-xl border px-3 py-2">
                    ログアウト（GET）
                </button>
            </div>

            <p className="mt-3 text-sm text-gray-700">{message}</p>
        </main>
    );
}
