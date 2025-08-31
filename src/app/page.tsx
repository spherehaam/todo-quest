'use client';

import { useState } from 'react';

function readCookie(name: string) {
    return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
}

export default function Page() {
    const [email, setEmail] = useState('demo@example.com');
    const [password, setPassword] = useState('Passw0rd!123');
    const [msg, setMsg] = useState('');

    async function login(e: React.FormEvent) {
        e.preventDefault();
        setMsg('ログイン中...');
        const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        setMsg(res.ok ? `OK: ${data.email}` : `NG: ${data.error}`);
    }

    async function me() {
        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json();
        setMsg(res.ok ? `ログイン中: ${data.email}` : '未ログイン');
    }

    async function callProtected() {
        setMsg('保護API呼び出し…');
        const csrf = readCookie('csrf_token') ?? '';
        console.log('csrf:', csrf);

        const res = await fetch('/api/protected', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf
        },
        credentials: 'include',
        body: JSON.stringify({})
        });
        const data = await res.json();
        setMsg(res.ok ? `Protected OK: ${data.data}` : `Protected NG: ${data.error}`);
    }

    async function refresh() {
        const csrf = readCookie('csrf_token') ?? '';
        console.log('csrf:', csrf);
        const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf },
        credentials: 'include'
        });
        setMsg(res.ok ? 'アクセストークン更新OK' : '更新失敗');
    }

    async function logout() {
        const csrf = readCookie('csrf_token') ?? '';
        console.log('csrf:', csrf);
        const res = await fetch('/api/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf },
        credentials: 'include'
        });
        setMsg('ログアウトしました');
    }

    return (
        <main className="mx-auto mt-10 max-w-md p-4">
        <h1 className="text-2xl font-semibold mb-4">セキュア版ログイン</h1>

        <form onSubmit={login} className="space-y-3">
            <input className="w-full border p-3 rounded"
                type="email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="w-full border p-3 rounded"
                type="password" value={password} onChange={e=>setPassword(e.target.value)} />
            <button className="w-full bg-black text-white py-3 rounded">ログイン</button>
        </form>

        <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="border rounded p-2" onClick={me}>状態確認</button>
            <button className="border rounded p-2" onClick={callProtected}>保護POST</button>
            <button className="border rounded p-2" onClick={refresh}>リフレッシュ</button>
            <button className="border rounded p-2" onClick={logout}>ログアウト</button>
        </div>

        <p className="mt-3 text-sm">{msg}</p>
        </main>
    );
}
