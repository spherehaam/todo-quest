'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Task = {
    id: string;
    title: string;
    done: boolean;
    created_at: string;
};

function readCookie(name: string) {
    return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
}

export default function HomePage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTitle, setNewTitle] = useState('');
    const [msg, setMsg] = useState('');
    const router = useRouter();

    useEffect(() => {
        async function bootstrap() {
            // 1) 認証確認
            const meRes = await fetch('/api/me', { credentials: 'include' });
            if (!meRes.ok) {
                router.push('/');
                return;
            }
            const me = await meRes.json();
            setEmail(me.email);

            // 2) タスク一覧取得
            await fetchTasks();
            setLoading(false);
        }

        async function fetchTasks() {
            const res = await fetch('/api/tasks', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks ?? []);
            } else {
                setTasks([]);
            }
        }

        bootstrap();
    }, [router]);

    async function addTask() {
        const title = newTitle.trim();
        if (!title) {
            setMsg('タイトルを入力してください');
            return;
        }
        const csrf = readCookie('csrf_token') ?? '';
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            credentials: 'include',
            body: JSON.stringify({ title })
        });
        const data = await res.json();
        if (res.ok) {
            // 先頭に追加して即時反映
            setTasks((prev) => [data.task, ...prev]);
            setNewTitle('');
            setMsg('追加しました');
        } else {
            setMsg(`追加に失敗: ${data.error}`);
        }
    }

    async function logout() {
        const csrf = readCookie('csrf_token') ?? '';
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
            credentials: 'include'
        });
        router.push('/');
    }

    if (loading) {
        return (
            <main className="mx-auto mt-10 max-w-md p-4">
                <p>読み込み中...</p>
            </main>
        );
    }

    return (
        <main className="mx-auto mt-10 max-w-2xl p-4">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Home</h1>
                <button
                    className="bg-gray-800 text-white py-2 px-4 rounded"
                    onClick={logout}
                >
                    ログアウト
                </button>
            </div>

            <p className="mb-4">{email ? `ようこそ、${email} さん！` : 'ログインしていません。'}</p>

            {/* 追加フォーム */}
            <div className="mb-4 flex gap-2">
                <input
                    className="flex-1 border rounded p-3"
                    placeholder="新しいタスクのタイトル"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                />
                <button
                    className="bg-black text-white px-4 rounded"
                    onClick={addTask}
                >
                    追加
                </button>
            </div>
            {msg && <p className="text-sm mb-4">{msg}</p>}

            {/* 一覧テーブル */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border p-2 text-left">タイトル</th>
                            <th className="border p-2 text-left">完了</th>
                            <th className="border p-2 text-left">作成日時</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.length === 0 && (
                            <tr>
                                <td className="border p-2" colSpan={3}>
                                    タスクはまだありません
                                </td>
                            </tr>
                        )}
                        {tasks.map((t) => (
                            <tr key={t.id}>
                                <td className="border p-2">{t.title}</td>
                                <td className="border p-2">{t.done ? '✔︎' : '-'}</td>
                                <td className="border p-2">
                                    {new Date(t.created_at).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </main>
    );
}
