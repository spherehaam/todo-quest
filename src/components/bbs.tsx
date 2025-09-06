'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Task = {
    id: string;
    title: string;
    description: string;
    reward?: number;
    dueDate?: string;
    status: 'open' | 'assigned' | 'done';
    requester: string;
    assignee?: string | null;
    createdAt: string;
};

/** クッキーから値を取得 */
function readCookie(name: string) {
    return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
}

export default function BbsPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [filter, setFilter] = useState<'all' | 'open' | 'assigned' | 'done'>('all');
    const [email, setEmail] = useState<string | null>(null);

    // 依頼フォームの状態
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [reward, setReward] = useState<number | ''>('');
    const [dueDate, setDueDate] = useState('');
    const [requester, setRequester] = useState('');
    const router = useRouter();

    const filtered = useMemo(() => {
        if (filter === 'all') return tasks;
        return tasks.filter((t) => t.status === filter);
    }, [tasks, filter]);

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
        }

        bootstrap();
    }, [router]);

    function addTask() {
        const trimmedTitle = title.trim();
        const trimmedRequester = requester.trim();
        if (!trimmedTitle || !trimmedRequester) {
            alert('タイトルと依頼者は必須です');
            return;
        }
        const newTask: Task = {
            id: String(Date.now()),
            title: trimmedTitle,
            description: description.trim(),
            reward: reward === '' ? undefined : Number(reward),
            dueDate: dueDate || undefined,
            status: 'open',
            requester: trimmedRequester,
            assignee: null,
            createdAt: new Date().toISOString(),
        };
        setTasks((prev) => [newTask, ...prev]);
        setTitle('');
        setDescription('');
        setReward('');
        setDueDate('');
    }

    function acceptTask(id: string, name: string) {
        setTasks((prev) =>
            prev.map((t) =>
                t.id === id ? { ...t, status: 'assigned', assignee: name || '匿名' } : t
            )
        );
    }

    function completeTask(id: string) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'done' } : t)));
    }

    function cancelAssign(id: string) {
        setTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, status: 'open', assignee: null } : t))
        );
    }

    /** ログアウト */
    async function logout() {
        const csrf = readCookie('csrf_token') ?? '';
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
            credentials: 'include'
        });
        router.push('/');
    }

    return (

        <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
            {/* ===== ヘッダー ===== */}
            <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/70">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                    {/* ロゴ / ブランド */}
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600" />
                        <span className="text-sm font-semibold tracking-wide">
                            TodoQuest
                        </span>
                    </div>

                    {/* ユーザー */}
                    {/* <div className="flex items-center gap-2">
                        レベル
                        {users.map((u, idx) => (
                            <p key={u.id}>{u.level}　　経験値 {u.exp} / {u.exp}</p>
                            // <div key={u.id}>{u.id} : {u.username} : {u.level} : {u.exp} : {idx}</div>
                        ))}
                    </div> */}

                    {/* ログアウト */}
                    <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline">
                            {email ?? 'Guest'}
                        </span>
                        <button onClick={logout} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
                            ログアウト
                        </button>
                    </div>
                </div>
            </header>

            {/* ===== シェル（サイドバー + メイン） ===== */}
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                {/* ===== サイドバー ===== */}
                <aside className="sticky top-16 hidden h[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
                    <nav className="space-y-1">
                        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                            メニュー
                        </div>
                        <a href="/home"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                            <span>📋</span> <span>ホーム</span>
                        </a>
                        <a href="/bbs"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                            <span>📋</span> <span>タスク掲示板</span>
                        </a>
                        {/* <a href="/terms"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                            <span>📄</span> <span>利用規約</span>
                        </a> */}
                        {/* <a href="/privacy"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                            <span>🔒</span> <span>プライバシー</span>
                        </a> */}

                        <div className="my-3 border-t border-dashed border-gray-200 dark:border-gray-800" />
                    </nav>
                </aside>

                {/* ===== メインコンテンツ ===== */}
                <main className="space-y-4">
                    <div style={styles.page}>
                        <div style={styles.header}>
                            <h1 style={styles.h1}>タスク掲示板</h1>
                            <p style={styles.muted}>依頼の投稿と、受注ができるシンプルなページ</p>
                        </div>

                        <div style={styles.grid}>
                            {/* 左：依頼フォーム */}
                            <section style={styles.card}>
                                <h2 style={styles.h2}>タスクを依頼する</h2>
                                <div style={styles.formRow}>
                                    <label style={styles.label}>依頼者（あなたの名前）</label>
                                    <input
                                        style={styles.input}
                                        value={requester}
                                        onChange={(e) => setRequester(e.target.value)}
                                        placeholder="例: 安藤"
                                    />
                                </div>
                                <div style={styles.formRow}>
                                    <label style={styles.label}>タイトル *</label>
                                    <input
                                        style={styles.input}
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="例: 仕様書のレビュー"
                                    />
                                </div>
                                <div style={styles.formRow}>
                                    <label style={styles.label}>詳細</label>
                                    <textarea
                                        style={styles.textarea}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="依頼内容の詳細を記入してください"
                                        rows={5}
                                    />
                                </div>
                                <div style={styles.row2}>
                                    <div style={styles.formRow}>
                                        <label style={styles.label}>報酬（任意）</label>
                                        <input
                                            style={styles.input}
                                            type="number"
                                            min={0}
                                            value={reward}
                                            onChange={(e) =>
                                                setReward(e.target.value === '' ? '' : Number(e.target.value))
                                            }
                                            placeholder="0"
                                        />
                                    </div>
                                    <div style={styles.formRow}>
                                        <label style={styles.label}>期日（任意）</label>
                                        <input
                                            style={styles.input}
                                            type="date"
                                            value={dueDate}
                                            onChange={(e) => setDueDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <button style={styles.primaryBtn} onClick={addTask}>
                                    依頼を投稿
                                </button>
                                <p style={styles.help}>* は必須項目です。投稿後は右の掲示板に表示されます。</p>
                            </section>

                            {/* 右：掲示板 */}
                            <section style={styles.card}>
                                <div style={styles.listHeader}>
                                    <h2 style={styles.h2}>タスク掲示板</h2>
                                    <div>
                                        <select
                                            style={styles.select}
                                            value={filter}
                                            onChange={(e) => setFilter(e.target.value as typeof filter)}
                                        >
                                            <option value="all">すべて</option>
                                            <option value="open">募集中</option>
                                            <option value="assigned">対応中</option>
                                            <option value="done">完了</option>
                                        </select>
                                    </div>
                                </div>

                                {filtered.length === 0 ? (
                                    <p style={styles.muted}>まだタスクがありません。</p>
                                ) : (
                                    <ul style={styles.list}>
                                        {filtered.map((t) => (
                                            <li key={t.id} style={styles.listItem}>
                                                <div style={styles.itemMain}>
                                                    <div style={styles.itemTitleRow}>
                                                        <span style={styles.badge[t.status]}>{labelOf(t.status)}</span>
                                                        <h3 style={styles.itemTitle}>{t.title}</h3>
                                                    </div>
                                                    {t.description && (
                                                        <p style={styles.itemDesc}>{t.description}</p>
                                                    )}
                                                    <div style={styles.metaRow}>
                                                        <span style={styles.meta}>
                                                            依頼者: <strong>{t.requester}</strong>
                                                        </span>
                                                        {t.assignee && (
                                                            <span style={styles.meta}>
                                                                担当: <strong>{t.assignee}</strong>
                                                            </span>
                                                        )}
                                                        {t.reward !== undefined && (
                                                            <span style={styles.meta}>報酬: {t.reward}</span>
                                                        )}
                                                        {t.dueDate && (
                                                            <span style={styles.meta}>期日: {t.dueDate}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={styles.itemActions}>
                                                    {t.status === 'open' && (
                                                        <AcceptControls onAccept={(name) => acceptTask(t.id, name)} />
                                                    )}
                                                    {t.status === 'assigned' && (
                                                        <div style={styles.actionRow}>
                                                            <button style={styles.secondaryBtn} onClick={() => cancelAssign(t.id)}>
                                                                取り消し
                                                            </button>
                                                            <button style={styles.primaryBtn} onClick={() => completeTask(t.id)}>
                                                                完了
                                                            </button>
                                                        </div>
                                                    )}
                                                    {t.status === 'done' && (
                                                        <span style={styles.mutedSmall}>完了しました</span>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </div>

                        <style jsx global>{`
                            html, body {
                                background: #0b0c10;
                                color: #e5e7eb;
                                font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';
                            }
                        `}</style>
                    </div>
                </main>
            </div>
        </div>
    );
}

function AcceptControls(props: { onAccept: (name: string) => void }) {
    const [name, setName] = useState('');
    return (
        <div style={{ display: 'flex', gap: 8 }}>
            <input
                style={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="あなたの名前"
            />
            <button style={styles.primaryBtn} onClick={() => props.onAccept(name.trim())}>
                受ける
            </button>
        </div>
    );
}

/** 表示用ラベル */
function labelOf(s: Task['status']): string {
    switch (s) {
        case 'open':
            return '募集中';
        case 'assigned':
            return '対応中';
        case 'done':
            return '完了';
        default:
            return s;
    }
}

/** 最低限のインラインスタイル */
const styles: { [k: string]: any } = {
    page: {
        maxWidth: 1100,
        margin: '0 auto',
        padding: '24px 16px',
    },
    header: {
        marginBottom: 16,
    },
    h1: {
        fontSize: 28,
        margin: 0,
    },
    h2: {
        fontSize: 20,
        margin: '0 0 12px',
    },
    muted: {
        opacity: 0.75,
        fontSize: 14,
        marginTop: 4,
    },
    mutedSmall: {
        opacity: 0.7,
        fontSize: 12,
    },
    help: {
        opacity: 0.7,
        fontSize: 12,
        marginTop: 8,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 16,
    },
    card: {
        background: '#111217',
        border: '1px solid #1f2937',
        borderRadius: 12,
        padding: 16,
    },
    formRow: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 6,
        marginBottom: 12,
    },
    row2: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginBottom: 12,
    },
    label: {
        fontSize: 12,
        opacity: 0.9,
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        background: '#0b0c10',
        border: '1px solid #2a3342',
        borderRadius: 8,
        color: '#e5e7eb',
        outline: 'none',
    },
    textarea: {
        width: '100%',
        padding: '10px 12px',
        background: '#0b0c10',
        border: '1px solid #2a3342',
        borderRadius: 8,
        color: '#e5e7eb',
        resize: 'vertical' as const,
    },
    primaryBtn: {
        padding: '10px 14px',
        borderRadius: 10,
        background: '#2563eb',
        border: '1px solid #2563eb',
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
    },
    secondaryBtn: {
        padding: '10px 14px',
        borderRadius: 10,
        background: '#0b0c10',
        border: '1px solid #2a3342',
        color: '#e5e7eb',
        fontWeight: 600,
        cursor: 'pointer',
    },
    select: {
        padding: '8px 10px',
        background: '#0b0c10',
        border: '1px solid #2a3342',
        borderRadius: 8,
        color: '#e5e7eb',
    },
    listHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    list: {
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
    },
    listItem: {
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        border: '1px solid #1f2937',
        borderRadius: 12,
        padding: 12,
        background: '#0e1014',
    },
    itemMain: {
        flex: 1,
        minWidth: 0,
    },
    itemTitleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    itemTitle: {
        fontSize: 16,
        margin: 0,
        wordBreak: 'break-word' as const,
    },
    itemDesc: {
        margin: '6px 0 10px',
        opacity: 0.95,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap' as const,
    },
    metaRow: {
        display: 'flex',
        flexWrap: 'wrap' as const,
        gap: 12,
        fontSize: 12,
        opacity: 0.85,
    },
    meta: {
        border: '1px solid #1f2937',
        padding: '2px 8px',
        borderRadius: 999,
        background: '#0b0c10',
    },
    itemActions: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
        minWidth: 220,
    },
    actionRow: {
        display: 'flex',
        gap: 8,
    },
    badge: {
        open: {
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 999,
            background: '#0b3a1a',
            border: '1px solid #14532d',
            color: '#c6f6d5',
        },
        assigned: {
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 999,
            background: '#2b1a00',
            border: '1px solid #7c5200',
            color: '#fde68a',
        },
        done: {
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 999,
            background: '#0a223d',
            border: '1px solid #1e40af',
            color: '#bfdbfe',
        },
    },
};

/* 画面幅が広い場合のみ2カラムに */
if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(min-width: 920px)');
    if (mq.matches) {
        styles.grid.gridTemplateColumns = '1fr 1fr';
    }
}