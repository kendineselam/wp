// ==UserScript==
// @name         WhatsApp Numara Kopyalama (+90 Hariç)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  WhatsApp'taki +90 ile başlayan numaraları (mesaj, başlık, kişi bilgisi vb.) butona çevirir, tıklayınca +90 olmadan kopyalar
// @author       ChatGPT
// @match        https://web.whatsapp.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Stil
    const style = document.createElement('style');
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
    document.head.appendChild(style);

    const PHONE_SPLIT = /(\+90\s*\d[\d\s-]{8,})/g;   // split için (capture group)
    const PHONE_TEST  = /\+90\s*\d[\d\s-]{8,}/;      // test için (global değil, lastIndex sorunu yok)

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
                if (n.isConnected) processNode(n);
            });
        }, 150);
    }

    // İlk yükleme
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

    // Tıklayınca kopyala
    document.addEventListener('click', async e => {

        const btn = e.target.closest('.tm-numara-btn');
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

})();
