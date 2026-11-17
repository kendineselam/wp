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
                    #pr-pdf-pages canvas { display: block !important; width: 100% !important; height: auto !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; break-after: page; page-break-after: always; }
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
        bar.appendChild(viewerTitle);

        bar.appendChild(makeBtn('🖨️ Yazdır', '#25D366', printPdf));
        bar.appendChild(makeBtn('💾 İndir', '#128C7E', downloadPdf));
        bar.appendChild(makeBtn('↗ Yeni Sekmede Aç', '#34657b', openInTab));
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

    function showLoading() {
        if (!document.body) return;
        buildViewer();
        viewerTitle.textContent = 'PDF yükleniyor...';
        viewerMsg.textContent = 'PDF yükleniyor...';
        viewerMsg.style.display = 'block';
        viewerPages.textContent = '';
        pdfReady = false;
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
        revokeCurrent();
        currentOrigHref = null;
    }

    function isViewerOpen() {
        return viewerEl && viewerEl.style.display !== 'none';
    }

    async function renderPdf(arrayBuffer, token) {
        const lib = getPdfjs();
        if (!lib) throw new Error('PDF.js yüklenemedi');

        const loadingTask = lib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (token !== renderToken) return;

        const cssWidth = Math.max(300, Math.min(1000, viewerPages.clientWidth - 32));
        const outputScale = Math.max(window.devicePixelRatio || 1, 1.5);

        for (let i = 1; i <= pdf.numPages; i++) {
            if (token !== renderToken) return;
            const page = await pdf.getPage(i);
            const base = page.getViewport({ scale: 1 });
            const scale = cssWidth / base.width;
            const viewport = page.getViewport({ scale: scale * outputScale });

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            Object.assign(canvas.style, {
                display: 'block',
                width: cssWidth + 'px',
                height: (canvas.height / outputScale) + 'px',
                margin: '0 auto 16px auto',
                background: '#fff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                borderRadius: '2px'
            });

            if (token !== renderToken) return;
            viewerPages.appendChild(canvas);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            if (i === 1) {
                pdfReady = true;
                viewerMsg.style.display = 'none';
            }
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
            .catch(err => {
                console.log('[PDF-ROKET] Önizleme hatası:', err);
                if (token === renderToken) {
                    viewerMsg.style.display = 'block';
                    viewerMsg.textContent = 'PDF gösterilemedi. "Yeni Sekmede Aç" ile deneyin.';
                }
            });
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

    function openInTab() {
        const url = currentUrl || currentOrigHref;
        if (url) window.open(url, '_blank');
    }

    document.addEventListener('keydown', function (e) {
        if (!e.isTrusted) return;
        if (e.key === 'Escape' && isViewerOpen()) {
            e.stopPropagation();
            e.preventDefault();
            hideViewer();
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
})();
