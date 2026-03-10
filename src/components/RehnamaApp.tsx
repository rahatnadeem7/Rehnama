"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Search, BookOpen, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpeechService } from '@/lib/speech-service';
import { fetchVerseByText, fetchVerseByNumber, prefetchNextVerses, Verse } from "@/lib/quran-api";

export default function RehnamaApp() {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [verses, setVerses] = useState<Verse[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const speechServiceRef = useRef<SpeechService | null>(null);

    // ── Anti-Flicker Refs ─────────────────────────────────────────────────
    // Prevents concurrent API calls — one search at a time
    const isSearchingRef = useRef(false);
    // Debounce timer for interim speech results
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Always-fresh reference to the current verse stack (avoids stale closure)
    const versesRef = useRef<Verse[]>([]);
    versesRef.current = verses;

    // ── Core Search Logic (stable, memoized) ─────────────────────────────
    const runSearch = useCallback(async (text: string) => {
        // Search lock: reject if already searching
        if (isSearchingRef.current || !text.trim()) return;
        isSearchingRef.current = true;
        setIsSearching(true);

        const currentVerses = versesRef.current;
        const lastVerseHint = currentVerses.length > 0
            ? { chapter: currentVerses[0].chapter, verse: currentVerses[0].verse }
            : undefined;

        try {
            const verse = await fetchVerseByText(text, lastVerseHint);
            if (verse) {
                // Gap filling using versesRef (not stale `verses`)
                let versesToAdd: Verse[] = [verse];
                const lastV = versesRef.current[0];

                if (lastV && verse.chapter === lastV.chapter && verse.verse > lastV.verse + 1 && verse.verse < lastV.verse + 10) {
                    // Fill the gap (e.g., verse 1→3 detected → fetch verse 2)
                    for (let vNum = verse.verse - 1; vNum > lastV.verse; vNum--) {
                        const skipped = await fetchVerseByNumber(verse.chapter, vNum);
                        if (skipped) versesToAdd.push(skipped);
                    }
                } else if (!lastV && verse.verse > 1 && verse.verse <= 5) {
                    // Auto-backfill if first match skipped early verses
                    for (let vNum = verse.verse - 1; vNum >= 1; vNum--) {
                        const skipped = await fetchVerseByNumber(verse.chapter, vNum);
                        if (skipped) versesToAdd.push(skipped);
                    }
                }

                // Atomic deduplicated state update
                setVerses(prev => {
                    const newItems = versesToAdd.filter(nv =>
                        !prev.some(pv => pv.chapter === nv.chapter && pv.verse === nv.verse)
                    );
                    if (newItems.length === 0) return prev; // no change = no re-render
                    return [...newItems, ...prev];
                });

                // Prefetch next verses into cache (fire-and-forget)
                prefetchNextVerses(verse.chapter, verse.verse);
            }
        } finally {
            isSearchingRef.current = false;
            setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        speechServiceRef.current = new SpeechService((text, isFinal) => {
            // Always update the transcript display (no debounce needed here)
            setTranscript(text);

            if (isFinal) {
                // Final result: search immediately, cancel any pending interim debounce
                if (debounceRef.current) clearTimeout(debounceRef.current);
                runSearch(text);
            } else {
                // Interim result: debounce to avoid search avalanche
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => {
                    runSearch(text);
                }, 700);
            }
        });

        return () => {
            speechServiceRef.current?.stop();
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [runSearch]);

    const toggleListening = () => {
        if (isListening) {
            speechServiceRef.current?.stop();
            if (debounceRef.current) clearTimeout(debounceRef.current);
        } else {
            speechServiceRef.current?.start();
        }
        setIsListening(l => !l);
    };

    return (
        <div className="h-screen w-full flex flex-row bg-[#080c10] text-slate-100 overflow-hidden">

            {/* LEFT: Command Center Sidebar */}
            <aside className="w-[360px] shrink-0 h-full flex flex-col p-6 border-r border-white/10 bg-black/50 backdrop-blur-xl">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                        <BookOpen className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter text-emerald-400">REHNAMA</h1>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/70 font-semibold">Understanding Engine</p>
                    </div>
                </div>

                {/* Mic Control */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 mb-6">
                    <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-emerald-400/80 mb-6 block">
                        {isListening
                            ? isSearching ? "⟳ Matching..." : "● Listening Live"
                            : "○ System Standby"}
                    </span>
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            {isListening && (
                                <motion.div
                                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.08, 0.3] }}
                                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                                    className="absolute inset-0 bg-emerald-500/25 rounded-full blur-xl"
                                />
                            )}
                            <Button
                                size="icon"
                                variant={isListening ? "destructive" : "default"}
                                className="w-24 h-24 rounded-full shadow-2xl relative z-10"
                                onClick={toggleListening}
                            >
                                {isListening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Live Transcript */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 flex-1 overflow-hidden">
                    <p className="text-[11px] uppercase tracking-widest font-semibold mb-4 text-white/80">Live Transcript</p>
                    <p className="text-lg arabic-text leading-relaxed text-white overflow-auto max-h-full">
                        {transcript || (isListening ? "Waiting for recitation..." : "Ready to receive...")}
                    </p>
                </div>

                <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-white/40 font-medium">
                    &copy; 2026 Rehnama Live
                </p>
            </aside>

            {/* RIGHT: Translation Feed */}
            <main className="flex-1 h-full overflow-y-auto bg-[#0a0f14]" style={{ padding: '48px 64px' }}>
                <AnimatePresence mode="popLayout">
                    {verses.map((verse, index) => (
                        <motion.div
                            key={`${verse.chapter}:${verse.verse}`}
                            layout
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="mb-20"
                        >
                            {/* Verse number divider */}
                            <div className="flex items-center gap-4 mb-10">
                                <div className="h-px flex-1 bg-white/15" />
                                <Badge className={`font-mono tracking-widest text-xs px-5 py-1.5 rounded-full border ${index === 0
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : 'bg-white/10 text-white/80 border-white/20'
                                    }`}>
                                    SURAH {verse.chapter} : AYAH {verse.verse}
                                </Badge>
                                <div className="h-px flex-1 bg-white/15" />
                            </div>

                            <div className="space-y-8">
                                {/* Arabic */}
                                <div className={`p-10 rounded-3xl border-2 ${index === 0
                                        ? 'border-emerald-500/40 bg-emerald-500/5'
                                        : 'border-white/10 bg-white/[0.02]'
                                    }`}>
                                    <p className="text-[11px] uppercase tracking-widest font-semibold text-white/70 mb-6">Scripture</p>
                                    <p
                                        className="text-right arabic-text leading-loose"
                                        style={{
                                            color: index === 0 ? '#6ee7b7' : '#e2e8f0',
                                            fontSize: index === 0 ? '2.75rem' : '1.875rem',
                                            lineHeight: '1.8',
                                        }}
                                    >
                                        {verse.text}
                                    </p>
                                </div>

                                {/* English */}
                                <div className="p-10 rounded-3xl border-2 border-white/10 bg-white/[0.02]">
                                    <p className="text-[11px] uppercase tracking-widest mb-6 font-semibold text-white/70">English</p>
                                    <p
                                        className="font-medium text-white leading-normal"
                                        style={{ fontSize: index === 0 ? '1.625rem' : '1.125rem' }}
                                    >
                                        {verse.translations.english}
                                    </p>
                                </div>

                                {/* Urdu */}
                                <div className="p-10 rounded-3xl border-2 border-white/10 bg-white/[0.02]">
                                    <p className="text-[11px] uppercase tracking-widest mb-6 font-semibold text-right text-white/70">اردو</p>
                                    <p
                                        className="font-urdu text-right text-white leading-loose"
                                        dir="rtl"
                                        style={{ fontSize: index === 0 ? '2rem' : '1.375rem', lineHeight: '2' }}
                                    >
                                        {verse.translations.urdu}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {verses.length === 0 && !isSearching && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="h-full flex flex-col items-center justify-center text-center"
                    >
                        <BookOpen className="w-16 h-16 text-emerald-500/60 mb-6" />
                        <p className="text-xl text-white/80 italic">Recognized verses will appear here</p>
                        <p className="text-sm text-white/60 mt-2">Press the mic and start reciting</p>
                    </motion.div>
                )}
            </main>
        </div>
    );
}
