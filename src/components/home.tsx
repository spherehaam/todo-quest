'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        async function fetchMe() {
            const res = await fetch('/api/me', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setEmail(data.email);
            } else {
                // 未ログインならログインページへリダイレクト
                router.push('/');
            }
            setLoading(false);
        }
        fetchMe();
    }, [router]);

    if (loading) {
        return (
            <main className="mx-auto mt-10 max-w-md p-4">
                <p>読み込み中...</p>
            </main>
        );
    }

    return (
        <main className="mx-auto mt-10 max-w-md p-4">
            <h1 className="text-2xl font-semibold mb-4">Home</h1>
            {email ? (
                <p className="mb-4">ようこそ、{email} さん！</p>
            ) : (
                <p className="mb-4">ログインしていません。</p>
            )}
            <button
                className="bg-gray-800 text-white py-2 px-4 rounded"
                onClick={async () => {
                    const csrf = document.cookie
                        .split('; ')
                        .find((row) => row.startsWith('csrf_token='))
                        ?.split('=')[1] ?? '';
                    await fetch('/api/logout', {
                        method: 'POST',
                        headers: { 'X-CSRF-Token': csrf },
                        credentials: 'include',
                    });
                    router.push('/');
                }}
            >
                ログアウト
            </button>
        </main>
    );
}
