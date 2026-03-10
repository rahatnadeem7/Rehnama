export type Verse = {
    chapter: number;
    verse: number;
    text: string;
    translations: Record<string, string>;
};

// ─── In-Memory Verse Cache ─────────────────────────────────────────────────
// Keyed by "chapter:verse" — once fetched, served from cache instantly.
const verseCache = new Map<string, Verse>();

// ─── Arabic Text Normalization ─────────────────────────────────────────────
function cleanForSearch(text: string): string {
    return text
        .replace(/[\u064B-\u0652]/g, "")           // Remove tashkeel
        .replace(/[\u0622\u0623\u0625]/g, "\u0627") // Normalize all Alifs
        .replace(/\u0649/g, "\u064A")               // Alif Maqsura → Ya
        .replace(/\u0629/g, "\u0647")               // Ta Marbuta → Ha
        .trim();
}

// Aggressive phonetic normalization for local similarity comparison
function normalizePhonetic(text: string): string {
    return cleanForSearch(text)
        .replace(/\u0642/g, "\u0643") // Qaf → Kaf
        .replace(/\u0635/g, "\u0633") // Sad → Seen
        .replace(/\u0636/g, "\u062F") // Dad → Dal
        .replace(/\u0637/g, "\u062A") // Tah → Teh
        .replace(/\u0638/g, "\u0630") // Zah → Thal
        .replace(/\u062D/g, "\u0647") // Hah → Heh
        .replace(/\s+/g, "");
}

// ─── Similarity Scoring (Dice's Coefficient) ──────────────────────────────
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = normalizePhonetic(str1);
    const s2 = normalizePhonetic(str2);

    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0;

    const bigrams1 = new Set<string>();
    for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.substring(i, i + 2));
    const bigrams2 = new Set<string>();
    for (let i = 0; i < s2.length - 1; i++) bigrams2.add(s2.substring(i, i + 2));

    let intersection = 0;
    bigrams1.forEach(b => { if (bigrams2.has(b)) intersection++; });
    return (2.0 * intersection) / (bigrams1.size + bigrams2.size);
}

// ─── Core: Fetch Verse by Number (with cache) ─────────────────────────────
export async function fetchVerseByNumber(chapter: number, verse: number): Promise<Verse | null> {
    const cacheKey = `${chapter}:${verse}`;
    if (verseCache.has(cacheKey)) return verseCache.get(cacheKey)!;

    try {
        const url = `https://api.alquran.cloud/v1/ayah/${chapter}:${verse}/editions/quran-simple-clean,quran-uthmani,en.sahih,ur.ahmedali`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.code === 200) {
            const [clean, uthmani, en, ur] = data.data;
            const v: Verse = {
                chapter,
                verse,
                text: uthmani.text,
                translations: { english: en.text, urdu: ur.text },
            };
            verseCache.set(cacheKey, v);
            return v;
        }
        return null;
    } catch {
        return null;
    }
}

// ─── Prefetch: Silently cache the next N verses ────────────────────────────
export function prefetchNextVerses(chapter: number, currentVerse: number, count = 3): void {
    for (let v = currentVerse + 1; v <= currentVerse + count; v++) {
        const key = `${chapter}:${v}`;
        if (!verseCache.has(key)) {
            // Fire-and-forget — don't block the UI
            fetchVerseByNumber(chapter, v).catch(() => { });
        }
    }
}

// ─── Main: Match spoken text to a Quranic verse ───────────────────────────
export async function fetchVerseByText(
    searchText: string,
    lastVerse?: { chapter: number; verse: number }
): Promise<Verse | null> {
    const rawWords = searchText.trim().split(/\s+/);
    if (rawWords.length < 1) return null;

    try {
        // Strategy 1: Contextual prediction (Surah lock-in)
        // Check the next 3 verses in the current Surah first — cache hits will be instant
        if (lastVerse) {
            for (let offset = 1; offset <= 3; offset++) {
                const candidate = await fetchVerseByNumber(lastVerse.chapter, lastVerse.verse + offset);
                if (candidate) {
                    const sim = calculateSimilarity(searchText, candidate.text);
                    if (sim > 0.28) {
                        return candidate;
                    }
                }
            }
        }

        // Strategy 2: Sliding window global search
        // Use last 4-6 words — the most stable, clean part of the transcript
        const windows = [
            rawWords.slice(-6).join(" "),
            rawWords.slice(-4).join(" "),
            rawWords.slice(-8).join(" "),
        ].filter(w => w.split(/\s+/).length >= 2);

        for (const window of windows) {
            const cleanWindow = cleanForSearch(window);
            if (cleanWindow.length < 4) continue;

            const searchUrl = `https://api.alquran.cloud/v1/search/${encodeURIComponent(cleanWindow)}/all/quran-simple-clean`;
            const res = await fetch(searchUrl);
            const data = await res.json();

            if (data.code === 200 && data.data.count > 0) {
                const candidates = data.data.matches.slice(0, 5);
                let best: { verse: Verse; score: number } | null = null;

                for (const c of candidates) {
                    const v = await fetchVerseByNumber(c.surah.number, c.numberInSurah);
                    if (v) {
                        const score = calculateSimilarity(window, v.text);
                        if (!best || score > best.score) {
                            best = { verse: v, score };
                        }
                    }
                }

                // Confidence gate: only accept if above threshold
                if (best && best.score > 0.35) {
                    return best.verse;
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}
