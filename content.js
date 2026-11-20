// ======================================================================
// WhatsApp Numara Kopyalama (+90 Hariç) - numara.js buraya entegre edildi
// +90 ile başlayan numaraları butona çevirir, tıklayınca +90 olmadan kopyalar.
// Ayrı blok + try/catch: burada bir hata olsa bile PDF Roket kodu etkilenmez.
// Not: kod sayfa daha yüklenmeden (document_start) çalıştırılır; bu yüzden body hazır olunca başlar.
// ======================================================================
(function () {
    'use strict';
    try {
        if (!/(^|\.)whatsapp\.com$/.test(location.hostname)) return;   // sadece WhatsApp penceresi
        if (window.__prNumaraLoaded) return;                            // çift yükleme olmasın
        window.__prNumaraLoaded = true;

        const PHONE_SPLIT = /(\+90[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]*\d[\d\s\-\u200e\u200f\u202a-\u202e\u2066-\u2069]{8,})/g;
        const PHONE_TEST  = /\+90[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]*\d[\d\s\-\u200e\u200f\u202a-\u202e\u2066-\u2069]{8,}/;
        const INVISIBLE   = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

        // Dokunulmaması gereken alanlar
        const SKIP_SELECTOR = [
            '.tm-numara-btn',
            'script',
            'style',
            'textarea',
            'input',
            '[contenteditable="true"]', // mesaj yazma kutusu
            '#pane-side'                // sol sohbet listesi (tıklayınca sohbet açılsın diye)
        ].join(',');

        function addStyle() {
            if (document.getElementById('tm-numara-style')) return;
            const style = document.createElement('style');
            style.id = 'tm-numara-style';
            style.textContent = `
                .tm-numara-btn {
                    display:inline-block;
                    background:#e7f1ff;
                    border:1px solid #bcd3ff;
                    padding:3px 6px;
                    border-radius:6px;
                    cursor:pointer;
                    margin:1px 2px;
                    font-weight:500;
                    color:#075E54;
                    user-select:none;
                }
                .tm-numara-btn:hover {
                    background:#d0e6ff;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        }

        function processNode(root) {
            if (!root || root.nodeType !== 1) return;

            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(n) {
                        if (!n.nodeValue || n.nodeValue.indexOf('+90') === -1) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        if (!PHONE_TEST.test(n.nodeValue)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        const parent = n.parentElement;
                        if (!parent || parent.closest(SKIP_SELECTOR)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            const textNodes = [];
            let node;
            while ((node = walker.nextNode())) {
                textNodes.push(node);
            }

            textNodes.forEach(textNode => {
                if (!textNode.parentNode) return;

                const fragment = document.createDocumentFragment();
                const parts = textNode.nodeValue.split(PHONE_SPLIT);

                parts.forEach(part => {
                    if (!part) return;

                    if (PHONE_TEST.test(part)) {
                        const btn = document.createElement('span');
                        btn.className = 'tm-numara-btn';

                        // +90 kaldırılır, boşluklar korunur
                        const copyNumber = part
                            .replace(INVISIBLE, '')
                            .replace(/^\+90\s*/, '')
                            .trim();

                        btn.dataset.copy = copyNumber;
                        btn.dataset.original = part;
                        btn.textContent = part;

                        fragment.appendChild(btn);
                    } else {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });

                textNode.parentNode.replaceChild(fragment, textNode);
            });
        }

        // Çok sık tetiklenmesin diye toplu işleme
        const pending = new Set();
        let scheduled = false;

        function schedule(node) {
            pending.add(node);
            if (scheduled) return;
            scheduled = true;
            setTimeout(() => {
                scheduled = false;
                const nodes = Array.from(pending);
                pending.clear();
                nodes.forEach(n => {
                    try { if (n.isConnected) processNode(n); } catch (e) {}
                });
            }, 150);
        }

        function start() {
            if (window.__prNumaraStarted) return;
            if (!document.body) return;
            window.__prNumaraStarted = true;

            addStyle();

            // İlk tarama
            processNode(document.body);

            // Yeni içerikleri izle (mesaj, başlık, kişi paneli vb.)
            const observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {

                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.classList && node.classList.contains('tm-numara-btn')) return;
                            schedule(node);
                        } else if (node.nodeType === 3 && node.parentElement) {
                            schedule(node.parentElement);
                        }
                    });

                    // Mevcut metin değişirse (ör. başlık güncellenirse)
                    if (mutation.type === 'characterData' && mutation.target.parentElement) {
                        schedule(mutation.target.parentElement);
                    }
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });

            console.log('[PDF-ROKET] numara kopyalama aktif');

            // GEÇİCİ TEŞHİS: kodun çalıştığını ekranda göster (sorun çözülünce kaldırılacak)
            function diagToast(text) {
                try {
                    const t = document.createElement('div');
                    t.textContent = text;
                    t.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#075E54;color:#fff;padding:8px 12px;border-radius:8px;font:13px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none';
                    document.body.appendChild(t);
                    setTimeout(() => { try { t.remove(); } catch (e) {} }, 6000);
                } catch (e) {}
            }
            diagToast('Numara kopyalama yüklendi ✓');
            setTimeout(() => diagToast('Ekranda ' + document.querySelectorAll('.tm-numara-btn').length + ' numara düğmesi var'), 9000);
        }

        // Tıklayınca kopyala (document'e bağlı, body'yi beklemeye gerek yok)
        document.addEventListener('click', async e => {

            const btn = e.target && e.target.closest && e.target.closest('.tm-numara-btn');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            const copyText = btn.dataset.copy;

            try {

                await navigator.clipboard.writeText(copyText);

                const originalText = btn.dataset.original;

                btn.textContent = `✓ ${copyText}`;
                btn.style.background = '#c8f7c5';

                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '#e7f1ff';
                }, 1500);

            } catch (err) {
                alert('Kopyalama başarısız!');
            }
        }, true);

        // Başlatma: body hazırsa hemen, değilse sayfa yüklenince; ayrıca kısa aralıklarla yokla
        if (document.body) {
            start();
        } else {
            document.addEventListener('DOMContentLoaded', start, { once: true });
            let tries = 0;
            const iv = setInterval(() => {
                if (window.__prNumaraStarted || ++tries > 120) { clearInterval(iv); return; }
                start();
            }, 500);
        }

    } catch (err) {
        console.log('[PDF-ROKET] numara kopyalama başlatılamadı:', err);
    }
})();

// PDF Roket - ana script (MAIN world'de çalışır; sayfanın kendi click çağrılarını yakalayabilmek için)
(function () {
    'use strict';

    function isPdfDownload(anchor) {
        try {
            if (!anchor || !anchor.href) return false;
            if (!anchor.href.startsWith('blob:')) return false;
            const name = anchor.download || '';
            return /\.pdf$/i.test(name);
        } catch (e) {
            return false;
        }
    }

    // PDF.js kurulumu (Worker CSP'ye takılmasın diye ana iş parçacığında çalışır)
    function getPdfjs() {
        return window.pdfjsLib || window['pdfjs-dist/build/pdf'] || null;
    }
    try {
        const w = window['pdfjs-dist/build/pdf.worker'];
        if (w && !window.pdfjsWorker) window.pdfjsWorker = w;
        const lib = getPdfjs();
        if (lib && lib.GlobalWorkerOptions) {
            lib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
        }
    } catch (e) {
        console.log('[PDF-ROKET] PDF.js kurulum hatası:', e);
    }

    // ============================================================
    // KENDİ PDF ÖNİZLEMEMİZ
    // ============================================================
    let viewerEl = null;
    let viewerPages = null;
    let viewerTitle = null;
    let viewerMsg = null;
    let currentUrl = null;
    let currentOrigHref = null;
    let currentName = 'dosya.pdf';
    let renderToken = 0;
    let pdfReady = false;
    const STANDALONE = !!window.__prStandalone;   // "Yeni sekmede aç" ile açılan ayrı PDF penceresi

    // Arama durumu
    let searchInput = null;
    let searchCount = null;
    let searchQuery = '';
    let searchTimer = null;
    let pageInfo = [];
    let matches = [];
    let curMatch = -1;
    let scanning = false;
    let searchGroup = null;

    const origClick = HTMLAnchorElement.prototype.click;

    function makeBtn(label, bg, onClick) {
        const b = document.createElement('button');
        b.textContent = label;
        Object.assign(b.style, {
            padding: '8px 16px',
            background: bg,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginLeft: '8px',
            whiteSpace: 'nowrap'
        });
        b.addEventListener('click', onClick);
        return b;
    }

    function buildViewer() {
        if (viewerEl && document.body && document.body.contains(viewerEl)) return;

        if (!document.getElementById('pr-pdf-print-style')) {
            const st = document.createElement('style');
            st.id = 'pr-pdf-print-style';
            st.textContent = `
                @page { margin: 0; }
                @media print {
                    html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
                    body > *:not(#pr-pdf-viewer) { display: none !important; }
                    #pr-pdf-viewer { position: static !important; display: block !important; background: #fff !important; }
                    #pr-pdf-bar { display: none !important; }
                    #pr-pdf-body { position: static !important; padding: 0 !important; overflow: visible !important; }
                    #pr-pdf-pages { position: static !important; overflow: visible !important; height: auto !important; padding: 0 !important; background: #fff !important; }
                    #pr-pdf-pages .pr-page { width: 100% !important; height: auto !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; break-after: page; page-break-after: always; }
                    #pr-pdf-pages canvas { display: block !important; width: 100% !important; height: auto !important; margin: 0 !important; }
                    .pr-hl { display: none !important; }
                    #pr-pdf-pages img { display: block !important; width: auto !important; height: auto !important; max-width: 100% !important; max-height: 250mm !important; object-fit: contain !important; margin: 0 auto !important; box-shadow: none !important; border-radius: 0 !important; cursor: default !important; break-inside: avoid; page-break-inside: avoid; }
                }
            `;
            (document.head || document.documentElement).appendChild(st);
        }

        viewerEl = document.createElement('div');
        viewerEl.id = 'pr-pdf-viewer';
        Object.assign(viewerEl.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            zIndex: 1000000,
            background: 'rgba(20,20,20,0.95)',
            display: 'none',
            flexDirection: 'column'
        });

        const bar = document.createElement('div');
        bar.id = 'pr-pdf-bar';
        Object.assign(bar.style, {
            display: 'flex',
            alignItems: 'center',
            padding: '10px 16px',
            background: '#202c33',
            boxShadow: '0 2px 10px rgba(0,0,0,0.4)'
        });

        viewerTitle = document.createElement('div');
        Object.assign(viewerTitle.style, {
            flex: '1',
            color: '#e9edef',
            fontSize: '14px',
            fontWeight: 'bold',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'sans-serif'
        });
        viewerTitle.style.minWidth = '0';
        bar.appendChild(viewerTitle);

        // Arama kutusu
        const sg = document.createElement('div');
        Object.assign(sg.style, {
            display: 'flex', alignItems: 'center', marginLeft: '8px',
            background: '#2a3942', borderRadius: '8px', padding: '2px 4px'
        });
        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'pr-pdf-search';
        searchInput.placeholder = 'Ara (Ctrl+F)';
        searchInput.setAttribute('autocomplete', 'off');
        searchInput.spellcheck = false;
        Object.assign(searchInput.style, {
            width: '190px', background: 'transparent', color: '#e9edef', border: 'none',
            outline: 'none', padding: '6px 8px', fontSize: '13px', fontFamily: 'sans-serif'
        });
        searchCount = document.createElement('span');
        Object.assign(searchCount.style, {
            color: '#8696a0', fontSize: '12px', minWidth: '56px', textAlign: 'right',
            padding: '0 6px', whiteSpace: 'nowrap', fontFamily: 'sans-serif'
        });
        const navBtn = (label, title, delta) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                background: 'transparent', color: '#e9edef', border: 'none', cursor: 'pointer',
                padding: '4px 8px', fontSize: '12px'
            });
            b.addEventListener('click', () => { gotoMatch(delta); searchInput.focus(); });
            return b;
        };
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                searchQuery = searchInput.value.replace(/\s+/g, ' ').trim();
                curMatch = -1;
                refreshSearch(true);
            }, 150);
        });
        // WhatsApp Web'in kendi kısayolları yazmayı bozmasın
        ['keydown', 'keyup', 'keypress', 'paste', 'cut', 'copy'].forEach((ev) => {
            searchInput.addEventListener(ev, (e) => {
                if (ev === 'keydown' && e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(searchTimer);
                    const q = searchInput.value.replace(/\s+/g, ' ').trim();
                    if (q !== searchQuery) { searchQuery = q; curMatch = -1; refreshSearch(true); }
                    else gotoMatch(e.shiftKey ? -1 : 1);
                }
                e.stopPropagation();
            });
        });
        sg.appendChild(searchInput);
        sg.appendChild(searchCount);
        sg.appendChild(navBtn('▲', 'Önceki (Shift+Enter)', -1));
        sg.appendChild(navBtn('▼', 'Sonraki (Enter)', 1));
        searchGroup = sg;
        bar.appendChild(sg);

        bar.appendChild(makeBtn('🖨️ Yazdır', '#25D366', printPdf));
        bar.appendChild(makeBtn('💾 İndir', '#128C7E', downloadPdf));
        if (!STANDALONE) bar.appendChild(makeBtn('↗ Yeni Sekmede Aç', '#34657b', openInTab));
        bar.appendChild(makeBtn('✕ Kapat', '#c0392b', hideViewer));

        const body = document.createElement('div');
        body.id = 'pr-pdf-body';
        Object.assign(body.style, {
            flex: '1',
            position: 'relative',
            minHeight: '0'
        });

        viewerPages = document.createElement('div');
        viewerPages.id = 'pr-pdf-pages';
        Object.assign(viewerPages.style, {
            position: 'absolute',
            top: '0', left: '0', right: '0', bottom: '0',
            overflowY: 'auto',
            padding: '16px',
            boxSizing: 'border-box',
            background: '#3b4a54'
        });

        viewerMsg = document.createElement('div');
        Object.assign(viewerMsg.style, {
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#e9edef',
            fontSize: '16px',
            fontFamily: 'sans-serif',
            pointerEvents: 'none',
            textAlign: 'center'
        });
        viewerMsg.textContent = 'PDF yükleniyor...';

        body.appendChild(viewerPages);
        body.appendChild(viewerMsg);
        viewerEl.appendChild(bar);
        viewerEl.appendChild(body);
        document.body.appendChild(viewerEl);
    }

    function showLoading(kind) {
        if (!document.body) return;
        buildViewer();
        const isImg = kind === 'image';
        if (searchGroup) searchGroup.style.display = isImg ? 'none' : 'flex';   // resimde arama yok
        viewerTitle.textContent = isImg ? 'Resim yükleniyor...' : 'PDF yükleniyor...';
        viewerMsg.textContent = isImg ? 'Resim yükleniyor...' : 'PDF yükleniyor...';
        viewerMsg.style.display = 'block';
        viewerPages.textContent = '';
        pdfReady = false;
        resetSearch(true);
        viewerEl.style.display = 'flex';
    }

    function revokeCurrent() {
        if (currentUrl) {
            try { URL.revokeObjectURL(currentUrl); } catch (e) {}
        }
        currentUrl = null;
    }

    function hideViewer() {
        if (!viewerEl) return;
        renderToken++;
        viewerEl.style.display = 'none';
        if (viewerPages) viewerPages.textContent = '';
        pdfReady = false;
        resetSearch(true);
        revokeCurrent();
        currentOrigHref = null;
        if (STANDALONE) { try { window.close(); } catch (e) {} }
    }

    function isViewerOpen() {
        return viewerEl && viewerEl.style.display !== 'none';
    }

    // ============================================================
    // ARAMA (metin / sayı) - sayfa üstüne sarı vurgu çizer
    // ============================================================
    // Büyük/küçük harf ve Türkçe i/İ/ı/I farkı gözetmez. Her karakter 1 karaktere döner (uzunluk korunur).
    function fold(str) {
        let o = '';
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            if (c === '\u0130' || c === 'I' || c === '\u0131') { o += 'i'; continue; }
            const l = c.toLowerCase();
            o += (l.length === 1 ? l : c);
        }
        return o;
    }

    function resetSearch(clearInput) {
        clearTimeout(searchTimer);
        pageInfo = [];
        matches = [];
        curMatch = -1;
        scanning = false;
        if (clearInput) {
            searchQuery = '';
            if (searchInput) searchInput.value = '';
        }
        if (viewerPages) viewerPages.querySelectorAll('.pr-hl').forEach((n) => n.remove());
        updateCount();
    }

    function buildPageText(tc, vp, wrap) {
        let text = '';
        const parts = [];
        let prev = null;
        for (const it of tc.items) {
            if (typeof it.str !== 'string') continue;
            if (!it.str) {
                if (it.hasEOL && text && !/\s$/.test(text)) text += ' ';
                continue;
            }
            const t = it.transform;
            const h = Math.hypot(t[2], t[3]) || it.height || 10;
            if (prev && text && !/\s$/.test(text) && !/^\s/.test(it.str)) {
                const sameLine = Math.abs(t[5] - prev.y) < prev.h * 0.5;
                const gap = t[4] - (prev.x + prev.w);
                if (!sameLine || gap > prev.h * 0.15) text += ' ';
            }
            const start = text.length;
            text += it.str;
            parts.push({ start, end: text.length, t, w: it.width, h, len: it.str.length });
            prev = { x: t[4], y: t[5], w: it.width, h };
            if (it.hasEOL && !/\s$/.test(text)) text += ' ';
        }
        return { wrap, vp, text, folded: fold(text), parts };
    }

    function matchRects(m) {
        const info = pageInfo[m.pi];
        if (!info) return [];
        const out = [];
        for (const p of info.parts) {
            if (p.end <= m.s || p.start >= m.e) continue;
            const a = Math.max(m.s, p.start) - p.start;
            const b = Math.min(m.e, p.end) - p.start;
            let ux = p.t[0], uy = p.t[1];
            const ul = Math.hypot(ux, uy);
            if (ul) { ux /= ul; uy /= ul; } else { ux = 1; uy = 0; }
            const nx = -uy, ny = ux;
            const d0 = p.w * a / p.len, d1 = p.w * b / p.len;
            const x = p.t[4], y = p.t[5];
            const pts = [
                [x + ux * d0 - nx * p.h * 0.2, y + uy * d0 - ny * p.h * 0.2],
                [x + ux * d1 - nx * p.h * 0.2, y + uy * d1 - ny * p.h * 0.2],
                [x + ux * d1 + nx * p.h * 0.85, y + uy * d1 + ny * p.h * 0.85],
                [x + ux * d0 + nx * p.h * 0.85, y + uy * d0 + ny * p.h * 0.85]
            ].map((q) => info.vp.convertToViewportPoint(q[0], q[1]));
            const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
            const left = Math.min.apply(null, xs), top = Math.min.apply(null, ys);
            out.push({ left, top, width: Math.max.apply(null, xs) - left, height: Math.max.apply(null, ys) - top });
        }
        return out;
    }

    function drawHighlights() {
        if (!viewerPages) return;
        viewerPages.querySelectorAll('.pr-hl').forEach((n) => n.remove());
        matches.forEach((m, mi) => {
            const info = pageInfo[m.pi];
            if (!info) return;
            const cur = mi === curMatch;
            matchRects(m).forEach((r) => {
                const d = document.createElement('div');
                d.className = 'pr-hl';
                Object.assign(d.style, {
                    position: 'absolute',
                    left: r.left + 'px', top: r.top + 'px',
                    width: r.width + 'px', height: r.height + 'px',
                    background: cur ? 'rgba(255,120,0,0.55)' : 'rgba(255,213,0,0.45)',
                    outline: cur ? '2px solid rgba(255,90,0,0.9)' : 'none',
                    mixBlendMode: 'multiply',
                    pointerEvents: 'none',
                    borderRadius: '2px'
                });
                info.wrap.appendChild(d);
            });
        });
    }

    function updateCount() {
        if (!searchCount) return;
        if (!searchQuery) { searchCount.textContent = ''; return; }
        if (!matches.length) { searchCount.textContent = scanning ? 'taranıyor…' : 'Sonuç yok'; return; }
        searchCount.textContent = (curMatch + 1) + '/' + matches.length + (scanning ? '…' : '');
    }

    function scrollToCurrent() {
        const m = matches[curMatch];
        if (!m || !viewerPages) return;
        const info = pageInfo[m.pi];
        const rects = matchRects(m);
        if (!info || !rects.length) return;
        const top = info.wrap.offsetTop + rects[0].top;
        viewerPages.scrollTo({ top: Math.max(0, top - viewerPages.clientHeight / 3), behavior: 'smooth' });
    }

    function refreshSearch(jump) {
        const q = fold(searchQuery);
        matches = [];
        if (q) {
            outer:
            for (let pi = 0; pi < pageInfo.length; pi++) {
                const info = pageInfo[pi];
                if (!info) continue;
                let from = 0;
                while (true) {
                    const idx = info.folded.indexOf(q, from);
                    if (idx < 0) break;
                    matches.push({ pi, s: idx, e: idx + q.length });
                    from = idx + Math.max(1, q.length);
                    if (matches.length >= 2000) break outer;
                }
            }
        }
        let first = false;
        if (!matches.length) curMatch = -1;
        else if (curMatch < 0) { curMatch = 0; first = true; }
        else if (curMatch >= matches.length) curMatch = matches.length - 1;
        drawHighlights();
        updateCount();
        if (jump || first) scrollToCurrent();
    }

    function gotoMatch(delta) {
        if (!matches.length) return;
        curMatch = (curMatch + delta + matches.length) % matches.length;
        drawHighlights();
        updateCount();
        scrollToCurrent();
    }

    function focusSearch() {
        if (!searchInput) return;
        searchInput.focus();
        searchInput.select();
    }

    async function renderPdf(arrayBuffer, token) {
        const lib = getPdfjs();
        if (!lib) throw new Error('PDF.js yüklenemedi');

        const loadingTask = lib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (token !== renderToken) return;

        scanning = true;
        const cssWidth = Math.max(300, Math.min(1000, viewerPages.clientWidth - 32));
        const outputScale = Math.max(window.devicePixelRatio || 1, 1.5);

        for (let i = 1; i <= pdf.numPages; i++) {
            if (token !== renderToken) return;
            const page = await pdf.getPage(i);
            const base = page.getViewport({ scale: 1 });
            const scale = cssWidth / base.width;
            const cssVp = page.getViewport({ scale });
            const viewport = page.getViewport({ scale: scale * outputScale });

            const wrap = document.createElement('div');
            wrap.className = 'pr-page';
            Object.assign(wrap.style, {
                position: 'relative',
                width: cssWidth + 'px',
                height: cssVp.height + 'px',
                margin: '0 auto 16px auto',
                background: '#fff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                borderRadius: '2px'
            });

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
            wrap.appendChild(canvas);

            if (token !== renderToken) return;
            viewerPages.appendChild(wrap);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            if (i === 1) {
                pdfReady = true;
                viewerMsg.style.display = 'none';
            }

            // Arama için sayfa metnini çıkar
            try {
                const tc = await page.getTextContent();
                if (token !== renderToken) return;
                pageInfo[i - 1] = buildPageText(tc, cssVp, wrap);
                if (searchQuery) refreshSearch(false);
            } catch (e) {
                console.log('[PDF-ROKET] Metin çıkarılamadı (sayfa ' + i + '):', e);
            }
        }
        if (token === renderToken) {
            scanning = false;
            updateCount();
        }
    }

    function showOpenError(token, err) {
        console.log('[PDF-ROKET] Önizleme hatası:', err);
        if (token === renderToken) {
            viewerMsg.style.display = 'block';
            viewerMsg.textContent = STANDALONE
                ? 'PDF gösterilemedi.'
                : 'PDF gösterilemedi. "Yeni Sekmede Aç" ile deneyin.';
        }
    }

    function openInViewer(href, name) {
        showLoading();
        const token = ++renderToken;
        currentOrigHref = href;
        currentName = name || 'dosya.pdf';
        viewerTitle.textContent = '📄 ' + currentName;

        fetch(href)
            .then(r => r.blob())
            .then(b => {
                const pdfBlob = new Blob([b], { type: 'application/pdf' });
                revokeCurrent();
                currentUrl = URL.createObjectURL(pdfBlob);
                return pdfBlob.arrayBuffer();
            })
            .then(buf => renderPdf(buf, token))
            .catch(err => showOpenError(token, err));
    }

    // Ayrı pencerede (Yeni Sekmede Aç) bayt dizisinden aç
    function openBytesInViewer(bytes, name) {
        if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(String(name || ''))) {
            showLoading('image');
            const itoken = ++renderToken;
            currentOrigHref = null;
            try { document.title = name; } catch (e) {}
            const mimes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
            const ext = String(name).split('.').pop().toLowerCase();
            showImageBlob(new Blob([bytes], { type: mimes[ext] || 'image/jpeg' }), itoken, name, false);
            return;
        }
        showLoading();
        const token = ++renderToken;
        currentOrigHref = null;
        currentName = name || 'dosya.pdf';
        viewerTitle.textContent = '📄 ' + currentName;
        try { document.title = currentName; } catch (e) {}

        const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        revokeCurrent();
        currentUrl = URL.createObjectURL(pdfBlob);
        pdfBlob.arrayBuffer()
            .then(buf => renderPdf(buf, token))
            .catch(err => showOpenError(token, err));
    }

    function printPdf() {
        if (pdfReady) {
            window.print();
        } else if (currentUrl) {
            window.open(currentUrl, '_blank');
        }
    }

    function downloadPdf() {
        const url = currentUrl || currentOrigHref;
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = currentName;
        a.style.display = 'none';
        document.body.appendChild(a);
        origClick.call(a);
        setTimeout(() => a.remove(), 1000);
    }

    async function openInTab() {
        const url = currentUrl || currentOrigHref;
        if (!url) return;
        // Yeni sürüm: PDF'i uygulamanın kendi penceresinde (arama / yazdır dahil) açar
        if (window.__prPdf && typeof window.__prPdf.open === 'function') {
            try {
                const buf = await (await fetch(url)).arrayBuffer();
                window.__prPdf.open(new Uint8Array(buf), currentName);
                return;
            } catch (e) {
                console.log('[PDF-ROKET] Yeni pencere açılamadı, eski yönteme dönülüyor:', e);
            }
        }
        window.open(url, '_blank');
    }

    document.addEventListener('keydown', function (e) {
        if (!e.isTrusted) return;
        if (!isViewerOpen()) return;
        if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            // Arama kutusunda yazı varsa önce aramayı temizle, yoksa önizlemeyi kapat
            if (e.target === searchInput && searchInput.value) {
                searchInput.value = '';
                searchQuery = '';
                curMatch = -1;
                refreshSearch(false);
                return;
            }
            hideViewer();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
            e.stopPropagation();
            e.preventDefault();
            focusSearch();
            return;
        }
        if (e.key === 'F3') {
            e.stopPropagation();
            e.preventDefault();
            gotoMatch(e.shiftKey ? -1 : 1);
        }
    }, true);

    // ============================================================
    // İNDİRME YAKALAMA
    // ============================================================
    HTMLAnchorElement.prototype.click = function () {
        if (isPdfDownload(this)) {
            openInViewer(this.href, this.download);
            if (typeof window.__prClosePreview === 'function') {
                setTimeout(window.__prClosePreview, 150);
            }
            return;
        }
        return origClick.apply(this, arguments);
    };

    const origDispatch = HTMLAnchorElement.prototype.dispatchEvent;
    HTMLAnchorElement.prototype.dispatchEvent = function (event) {
        if (event && event.type === 'click' && isPdfDownload(this)) {
            openInViewer(this.href, this.download);
            if (typeof window.__prClosePreview === 'function') {
                setTimeout(window.__prClosePreview, 150);
            }
            return true;
        }
        return origDispatch.apply(this, arguments);
    };

    console.log('[PDF-ROKET] Aktif 🚀');

    // ============================================================
    // İndir butonunu bulma
    // ============================================================
    function findDownloadButton() {
        return document.querySelector('button[aria-label="İndir"]')
            || document.querySelector('button[aria-label="Download"]')
            || document.querySelector('[data-icon="ic-download"]')?.closest('button')
            || document.querySelector('[data-icon*="download" i]')?.closest('button, [role="button"]')
            || document.querySelector('[aria-label*="ndir"]')
            || document.querySelector('[aria-label*="ownload"]');
    }



    // ============================================================
    // Sohbette PDF baloncuğuna tıklayınca otomatik aç
    // ============================================================
    let autoPending = false;
    let autoTimer = null;

    function closePreview() {
        const closeBtn =
            document.querySelector('[data-icon="x-viewer"]')?.closest('button, [role="button"]') ||
            document.querySelector('button[aria-label="Kapat"]') ||
            document.querySelector('[role="button"][aria-label="Kapat"]') ||
            document.querySelector('button[aria-label="Close"]');
        if (closeBtn) {
            closeBtn.click();
        } else {
            const ev = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
            document.dispatchEvent(new KeyboardEvent('keydown', ev));
            document.dispatchEvent(new KeyboardEvent('keyup', ev));
        }
    }
    window.__prClosePreview = closePreview;

    function isPdfBubble(target) {
        if (!target || !target.closest) return false;
        if (target.closest('#pr-pdf-viewer')) return false;
        const row = target.closest('[data-id]');
        if (!row) return false;
        if (row.querySelector('[data-icon*="pdf" i]')) return true;
        const titles = row.querySelectorAll('span[title], div[title]');
        for (const t of titles) {
            if (/\.pdf\s*$/i.test(t.getAttribute('title') || '')) return true;
        }
        return false;
    }

    function startAutoOpen() {
        if (autoPending) return;
        autoPending = true;
        const startedAt = Date.now();

        showLoading();

        clearInterval(autoTimer);
        autoTimer = setInterval(() => {
            if (Date.now() - startedAt > 10000) {
                clearInterval(autoTimer);
                autoPending = false;
                if (!currentUrl) hideViewer();
                return;
            }
            const dl = findDownloadButton();
            const previewOpen = document.querySelector('[data-icon="x-viewer"]')
                || document.querySelector('button[aria-label="Kapat"]')
                || document.querySelector('button[aria-label="Close"]');
            if (dl && previewOpen) {
                clearInterval(autoTimer);
                setTimeout(() => {
                    dl.click();
                    autoPending = false;
                }, 150);
            }
        }, 150);
    }

    document.addEventListener('click', function (e) {
        if (!e.isTrusted) return;
        if (isPdfBubble(e.target)) startAutoOpen();
    }, true);

    // ============================================================
    // RESİMLER: sohbetteki resme tıklayınca kendi önizlememizde aç
    // (yazdır / indir / yeni sekmede aç). Tıklayınca WhatsApp'ın kendi
    // görüntüleyicisi açılır, resmi oradan alıp kendi önizlememize koyarız.
    // Kapatmak için: IMAGE_PREVIEW = false
    // ============================================================
    const IMAGE_PREVIEW = true;

    let imgPending = false;
    let imgTimer = null;

    // Tıklanan yerde, mesaj balonu içinde, yeterince büyük bir resim var mı?
    function findClickedImage(e) {
        const t = e.target;
        if (!t || !t.closest || t.closest('#pr-pdf-viewer')) return null;
        const row = t.closest('[data-id]');
        if (!row) return null;
        // video / gif balonlarına dokunma
        if (row.querySelector('[data-icon*="play" i], [data-icon*="video" i], [data-icon*="gif" i]')) return null;
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        for (const el of els) {
            if (el.tagName !== 'IMG' || !row.contains(el)) continue;
            if (!/^(blob:|data:)/.test(el.src || '')) continue;
            const r = el.getBoundingClientRect();
            if (r.width >= 120 && r.height >= 120) return el;
        }
        return null;
    }

    // WhatsApp'ın tam ekran medya görüntüleyicisinin kök elemanı
    function waViewerRoot() {
        const btn = document.querySelector('[data-icon="x-viewer"]')
            || document.querySelector('button[aria-label="Kapat"]')
            || document.querySelector('button[aria-label="Close"]');
        if (!btn) return null;
        let el = btn.parentElement;
        while (el && el !== document.body && el !== document.documentElement) {
            if (el.querySelector('#pane-side, [data-id]')) return null;   // sohbet ekranına kadar çıktık, görüntüleyici değil
            const r = el.getBoundingClientRect();
            if (r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9) return el;
            el = el.parentElement;
        }
        return null;
    }

    function pickViewerImage(root, blobOnly) {
        let best = null, bestArea = 0;
        for (const im of root.querySelectorAll('img')) {
            const src = im.src || '';
            if (!(src.startsWith('blob:') || (!blobOnly && src.startsWith('data:')))) continue;
            if (!im.complete || !im.naturalWidth) continue;
            const r = im.getBoundingClientRect();
            if (r.width < 150 || r.height < 150) continue;
            const area = r.width * r.height;
            if (area > bestArea) { best = im; bestArea = area; }
        }
        return best;
    }

    function openImageInViewer(src) {
        showLoading('image');
        const token = ++renderToken;
        currentOrigHref = src;
        viewerTitle.textContent = '🖼️ Resim yükleniyor...';

        fetch(src)
            .then(r => r.blob())
            .then(b => {
                if (token !== renderToken) return;
                showImageBlob(b, token, null, true);
            })
            .catch(err => {
                console.log('[PDF-ROKET] Resim önizleme hatası:', err);
                if (token === renderToken) {
                    viewerMsg.style.display = 'block';
                    viewerMsg.textContent = 'Resim gösterilemedi.';
                }
            });
    }

    // Resim baytlarını önizlemeye koyar. fixedName verilirse dosya adı o olur; closeWa: WhatsApp'ın kendi görüntüleyicisini kapat.
    function showImageBlob(b, token, fixedName, closeWa) {
        const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[b.type] || 'jpg';
        if (fixedName) {
            currentName = fixedName;
        } else {
            const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
            currentName = 'WhatsApp-Resim-' + stamp + '.' + ext;
        }
        revokeCurrent();
        currentUrl = URL.createObjectURL(b);

        const img = document.createElement('img');
        Object.assign(img.style, {
            display: 'block',
            margin: '0 auto',
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 110px)',
            background: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            borderRadius: '2px',
            cursor: 'zoom-in'
        });
        let zoomed = false;
        img.addEventListener('click', () => {   // tıkla: yakınlaş / uzaklaş
            zoomed = !zoomed;
            img.style.maxWidth = zoomed ? 'none' : '100%';
            img.style.maxHeight = zoomed ? 'none' : 'calc(100vh - 110px)';
            img.style.cursor = zoomed ? 'zoom-out' : 'zoom-in';
        });
        img.onload = () => {
            if (token !== renderToken) return;
            pdfReady = true;                      // Yazdır düğmesi hazır
            viewerMsg.style.display = 'none';
        };
        img.onerror = () => {
            if (token !== renderToken) return;
            viewerMsg.style.display = 'block';
            viewerMsg.textContent = 'Resim gösterilemedi.';
        };
        viewerPages.textContent = '';
        viewerPages.appendChild(img);
        img.src = currentUrl;
        viewerTitle.textContent = '🖼️ ' + currentName;

        // WhatsApp'ın kendi görüntüleyicisini kapat (resmi zaten aldık)
        if (closeWa && typeof window.__prClosePreview === 'function') {
            setTimeout(window.__prClosePreview, 150);
        }
    }

    function startImageOpen() {
        if (imgPending) return;
        imgPending = true;
        const startedAt = Date.now();
        let rootSeenAt = 0;
        const stop = () => { clearInterval(imgTimer); imgPending = false; };

        clearInterval(imgTimer);
        imgTimer = setInterval(() => {
            const now = Date.now();
            if (now - startedAt > 8000) { stop(); return; }   // görüntüleyici hiç açılmadı (çıkartma vb.)
            const root = waViewerRoot();
            if (!root) return;
            if (!rootSeenAt) rootSeenAt = now;
            if (root.querySelector('video')) { stop(); return; }   // video: WhatsApp'ın kendi oynatıcısı kalsın
            let im = pickViewerImage(root, true);
            if (!im && now - rootSeenAt > 3500) im = pickViewerImage(root, false);
            if (!im) return;
            stop();
            openImageInViewer(im.src);
        }, 120);
    }

    document.addEventListener('click', function (e) {
        if (!IMAGE_PREVIEW || !e.isTrusted) return;
        if (findClickedImage(e)) startImageOpen();
    }, true);

    // Ayrı PDF penceresi: veriyi ana süreçten alıp doğrudan göster
    if (STANDALONE) {
        const go = function () {
            if (!window.__prPdf || typeof window.__prPdf.getData !== 'function') return;
            window.__prPdf.getData().then(function (d) {
                if (!d || !d.bytes) return;
                openBytesInViewer(d.bytes, d.name);
            }).catch(function (e) { console.log('[PDF-ROKET] PDF verisi alınamadı:', e); });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
        else go();
    }
})();
