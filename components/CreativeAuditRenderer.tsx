"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import ActionChecklist, { TodoItem } from './ActionChecklist';

interface Props {
    markdown: string;
    language: 'bg' | 'en';
}

interface Section {
    id: string;
    title: string;
    level: 2 | 3;
}

// Stable slug for anchor ids
function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9Ѐ-ӿ]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'section';
}

// Extract H2/H3 outline for the left navigation
function extractOutline(markdown: string): Section[] {
    const lines = markdown.split('\n');
    const out: Section[] = [];
    const seen = new Set<string>();
    let inCodeBlock = false;
    for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) continue;
        const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
        if (!m) continue;
        const level = m[1].length as 2 | 3;
        const title = m[2].replace(/[#*_`]/g, '').trim();
        let id = slugify(title);
        let attempt = 1;
        while (seen.has(id)) {
            id = `${slugify(title)}-${++attempt}`;
        }
        seen.add(id);
        out.push({ id, title, level });
    }
    return out;
}

// Split markdown into: pre-todos body + parsed todos + any trailing text
function splitOffTodos(markdown: string): { body: string; todos: TodoItem[] | null } {
    const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    let lastTodos: TodoItem[] | null = null;
    let lastMatchStart = -1;
    let lastMatchEnd = -1;
    while ((match = jsonBlockRegex.exec(markdown)) !== null) {
        try {
            const parsed = JSON.parse(match[1].trim());
            if (parsed && Array.isArray(parsed.todos)) {
                lastTodos = parsed.todos as TodoItem[];
                lastMatchStart = match.index;
                lastMatchEnd = jsonBlockRegex.lastIndex;
            }
        } catch {
            // ignore — partial/invalid JSON during streaming
        }
    }
    if (lastTodos && lastMatchStart >= 0) {
        const body = (markdown.slice(0, lastMatchStart) + markdown.slice(lastMatchEnd)).trim();
        return { body, todos: lastTodos };
    }
    return { body: markdown, todos: null };
}

export default function CreativeAuditRenderer({ markdown, language }: Props) {
    const isEn = language === 'en';
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);

    const { body, todos } = useMemo(() => splitOffTodos(markdown), [markdown]);
    const outline = useMemo(() => extractOutline(body), [body]);

    // Register an IntersectionObserver to highlight the currently visible section
    useEffect(() => {
        if (!contentRef.current) return;
        const root = contentRef.current;
        const headings = Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id]'));
        if (!headings.length) return;

        const observer = new IntersectionObserver(
            entries => {
                const visible = entries
                    .filter(e => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
                if (visible?.target?.id) {
                    setActiveId(visible.target.id);
                }
            },
            { root, rootMargin: '0px 0px -70% 0px', threshold: [0, 1] }
        );
        headings.forEach(h => observer.observe(h));
        return () => observer.disconnect();
    }, [body]);

    const scrollTo = (id: string) => {
        if (!contentRef.current) return;
        const el = contentRef.current.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveId(id);
        }
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Clipboard write failed', err);
        }
    };

    return (
        <div className="h-full flex">
            {/* Left navigation */}
            <aside className="w-64 border-r border-slate-800 bg-slate-900/40 overflow-y-auto">
                <div className="sticky top-0 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
                    {isEn ? 'Contents' : 'Съдържание'}
                </div>
                <nav className="py-2">
                    {outline.length === 0 ? (
                        <div className="px-4 py-2 text-xs text-slate-500">
                            {isEn ? 'Sections will appear as the audit streams…' : 'Секциите ще се появят при стрийм…'}
                        </div>
                    ) : (
                        <ul className="space-y-0.5">
                            {outline.map(sec => (
                                <li key={sec.id}>
                                    <button
                                        onClick={() => scrollTo(sec.id)}
                                        className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                                            activeId === sec.id
                                                ? 'bg-violet-600/20 text-violet-200 border-l-2 border-violet-500'
                                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-l-2 border-transparent'
                                        } ${sec.level === 3 ? 'pl-6 text-xs' : 'font-medium'}`}
                                    >
                                        {sec.title}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </nav>
            </aside>

            {/* Main content */}
            <div ref={contentRef} className="flex-1 overflow-y-auto">
                <article className="max-w-4xl mx-auto px-8 py-8 prose prose-invert prose-slate max-w-none">
                    <ReactMarkdown
                        components={{
                            h2: ({ node, children, ...props }) => {
                                const text = React.Children.toArray(children).join('');
                                const id = slugify(String(text));
                                return (
                                    <h2 id={id} className="text-2xl font-bold text-white mt-10 mb-4 pb-2 border-b border-slate-800 scroll-mt-4" {...props}>
                                        {children}
                                    </h2>
                                );
                            },
                            h3: ({ node, children, ...props }) => {
                                const text = React.Children.toArray(children).join('');
                                const id = slugify(String(text));
                                return (
                                    <h3 id={id} className="text-lg font-semibold text-slate-100 mt-6 mb-3 scroll-mt-4" {...props}>
                                        {children}
                                    </h3>
                                );
                            },
                            code: ({ node, className, children, ...props }: any) => {
                                const isInline = !className;
                                if (isInline) {
                                    return (
                                        <code className="bg-slate-800 text-violet-300 rounded px-1.5 py-0.5 text-sm" {...props}>
                                            {children}
                                        </code>
                                    );
                                }
                                const content = String(children).replace(/\n$/, '');
                                return (
                                    <div className="relative group">
                                        <button
                                            onClick={() => handleCopy(content)}
                                            className="absolute top-2 right-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            {isEn ? 'Copy' : 'Копирай'}
                                        </button>
                                        <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto">
                                            <code className={className} {...props}>{children}</code>
                                        </pre>
                                    </div>
                                );
                            },
                            table: ({ children, ...props }) => (
                                <div className="overflow-x-auto my-4">
                                    <table className="min-w-full border border-slate-800 rounded-lg text-sm" {...props}>
                                        {children}
                                    </table>
                                </div>
                            ),
                            th: ({ children, ...props }) => (
                                <th className="bg-slate-800 text-slate-200 font-semibold px-3 py-2 text-left border-b border-slate-700" {...props}>
                                    {children}
                                </th>
                            ),
                            td: ({ children, ...props }) => (
                                <td className="px-3 py-2 border-b border-slate-800/60 text-slate-300" {...props}>
                                    {children}
                                </td>
                            ),
                        }}
                    >
                        {body}
                    </ReactMarkdown>

                    {todos && todos.length > 0 && (
                        <div className="mt-10 pt-6 border-t border-slate-800">
                            <h2 className="text-2xl font-bold text-white mb-4">
                                {isEn ? 'Action Items' : 'Действия'}
                            </h2>
                            <ActionChecklist items={todos} language={language} />
                        </div>
                    )}
                </article>
            </div>
        </div>
    );
}
