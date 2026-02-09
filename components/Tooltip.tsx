"use client";
import { useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
    children: React.ReactNode;
    text: string;
}

export default function Tooltip({ children, text }: TooltipProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, below: false });

    const show = useCallback(() => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            const below = spaceAbove < 120; // not enough space above, show below
            setCoords({
                top: below ? rect.bottom + 8 : rect.top - 8,
                left: Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130),
                below,
            });
            setVisible(true);
        }
    }, []);

    return (
        <span
            ref={ref}
            onMouseEnter={show}
            onMouseLeave={() => setVisible(false)}
            className="inline-flex cursor-help"
        >
            {children}
            {visible && typeof document !== 'undefined' && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        transform: coords.below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
                        zIndex: 9999,
                    }}
                    className="px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-600 text-[11px] text-slate-200 leading-relaxed w-64 shadow-2xl font-normal normal-case tracking-normal pointer-events-none animate-in fade-in duration-150"
                >
                    {text}
                </div>,
                document.body
            )}
        </span>
    );
}
