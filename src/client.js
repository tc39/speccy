'use strict';

(() => {
	const input = /** @type {HTMLInputElement | null} */ (document.getElementById('speccy-q'));
	const count = document.getElementById('speccy-count');
	const toastEl = document.getElementById('speccy-toast');
	/** @type {HTMLElement[]} */
	const cells = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.cell')));
	const grids = Array.from(document.querySelectorAll('.grid'));
	const platformSel = /** @type {HTMLSelectElement | null} */ (document.getElementById('speccy-platform'));

	/** @type {Record<'mac' | 'win', Record<number, string>>} */
	const KEYSTROKES = {
		mac: {
			0x2013: '⌥ -', 0x2014: '⌥ ⇧ -', 0x2018: '⌥ ]', 0x2019: '⌥ ⇧ ]',
			0x201C: '⌥ [', 0x201D: '⌥ ⇧ [', 0x2026: '⌥ ;', 0x00AB: '⌥ \\',
			0x00BB: '⌥ ⇧ \\', 0x00F7: '⌥ /', 0x00B1: '⌥ ⇧ =', 0x2260: '⌥ =',
			0x2264: '⌥ ,', 0x2265: '⌥ .', 0x221E: '⌥ 5', 0x03C0: '⌥ p',
			0x2248: '⌥ x', 0x221A: '⌥ v',
		},
		win: {
			0x2013: 'Alt + 0150', 0x2014: 'Alt + 0151', 0x2018: 'Alt + 0145',
			0x2019: 'Alt + 0146', 0x201C: 'Alt + 0147', 0x201D: 'Alt + 0148',
			0x2026: 'Alt + 0133', 0x00AB: 'Alt + 0171', 0x00BB: 'Alt + 0187',
			0x00D7: 'Alt + 0215', 0x00F7: 'Alt + 0247', 0x00B1: 'Alt + 0177',
		},
	};

	/**
	 * Generic per-platform Unicode entry for a code point with no dedicated combo.
	 * @param {'mac' | 'win' | 'linux'} platform
	 * @param {number} cp
	 * @returns {string}
	 */
	function genericKeystroke(platform, cp) {
		if (platform !== 'linux') {
			return '';
		}
		const hex = cp.toString(16).toUpperCase().padStart(4, '0');
		return `Ctrl ⇧ U ${hex} ⏎`;
	}

	/**
	 * @param {'mac' | 'win' | 'linux'} platform
	 * @param {number[]} cps
	 * @returns {string}
	 */
	function keystrokeFor(platform, cps) {
		if (platform !== 'linux' && cps.length === 1) {
			const combo = KEYSTROKES[platform][cps[0]];
			if (combo) { return combo; }
		}
		return cps.map((cp) => genericKeystroke(platform, cp)).filter(Boolean).join(' , ');
	}

	/** @returns {'mac' | 'win' | 'linux'} */
	function detectPlatform() {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes('mac') || ua.includes('iphone') || ua.includes('ipad')) { return 'mac'; }
		if (ua.includes('win')) { return 'win'; }
		return 'linux';
	}

	/**
	 * @param {string} platform
	 * @returns {void}
	 */
	function renderKeystrokes(platform) {
		const p = platform === 'mac' || platform === 'win' ? platform : 'linux';
		cells.forEach((c) => {
			const cps = (c.dataset.h ?? '').split(' ').map((h) => parseInt(h, 16)).filter((n) => !Number.isNaN(n));
			let el = c.querySelector('.keys');
			if (!el) {
				el = document.createElement('span');
				el.className = 'keys';
				c.appendChild(el);
			}
			const ks = cps.length ? keystrokeFor(p, cps) : '';
			el.textContent = ks ? `⌨ ${ks}` : '';
		});
	}

	/**
	 * @param {Element} grid
	 * @returns {Element}
	 */
	function sectionOf(grid) {
		return grid.closest('emu-clause') ?? /** @type {Element} */ (grid.parentElement);
	}

	/** @returns {void} */
	function applyFilter() {
		const q = (input?.value ?? '').trim().toLowerCase();
		let shown = 0;
		cells.forEach((c) => {
			const show = !q || (c.dataset.s ?? '').includes(q);
			c.classList.toggle('speccy-hidden', !show);
			if (show) { shown += 1; }
		});
		grids.forEach((g) => {
			sectionOf(g).classList.toggle('speccy-hidden', !g.querySelector('.cell:not(.speccy-hidden)'));
		});
		if (count) {
			count.textContent = `${shown} ${shown === 1 ? 'character' : 'characters'}${q ? ` match “${q}”` : ''}`;
		}
	}

	/**
	 * Copy via a hidden textarea, for browsers without an async clipboard API.
	 * @param {string} text
	 * @returns {boolean}
	 */
	function legacyCopy(text) {
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.top = '-1000px';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand('copy');
			ta.remove();
			return ok;
		} catch {
			return false;
		}
	}

	/**
	 * @param {string} text
	 * @returns {Promise<boolean>}
	 */
	function copyText(text) {
		if (navigator.clipboard && window.isSecureContext) {
			return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
		}
		return Promise.resolve(legacyCopy(text));
	}

	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let toastTimer;
	/**
	 * @param {string} msg
	 * @param {boolean} ok
	 * @returns {void}
	 */
	function toast(msg, ok) {
		if (!toastEl) { return; }
		const el = toastEl;
		el.textContent = msg;
		el.classList.toggle('err', !ok);
		el.classList.add('show');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { el.classList.remove('show'); }, 1400);
	}

	if (input) { input.addEventListener('input', applyFilter); }

	document.addEventListener('click', (e) => {
		const target = /** @type {Element | null} */ (e.target);
		if (!target?.closest) { return; }
		const cell = /** @type {HTMLElement | null} */ (target.closest('.cell'));
		if (!cell) { return; }
		const text = target.closest('.ent') ? cell.dataset.e : cell.dataset.c;
		if (!text) { return; }
		copyText(text).then((ok) => {
			toast(ok ? `Copied  ${text}` : 'Copy failed - select it manually', ok);
			if (ok) {
				cell.classList.add('copied');
				setTimeout(() => { cell.classList.remove('copied'); }, 220);
			}
		});
	});

	/** @returns {'' | 'mac' | 'win' | 'linux'} */
	function platformFromUrl() {
		const v = new URLSearchParams(window.location.search).get('platform');
		return v === 'mac' || v === 'win' || v === 'linux' ? v : '';
	}

	/**
	 * @param {string} value
	 * @returns {'mac' | 'win' | 'linux'}
	 */
	function resolvePlatform(value) {
		return value === 'mac' || value === 'win' || value === 'linux' ? value : detectPlatform();
	}

	if (platformSel) {
		const sel = platformSel;
		const labels = { mac: 'macOS', win: 'Windows', linux: 'Linux' };
		const autoOption = sel.querySelector('option[value="auto"]');
		if (autoOption) { autoOption.textContent = `Auto (${labels[detectPlatform()]})`; }
		sel.value = platformFromUrl() || 'auto';
		renderKeystrokes(resolvePlatform(sel.value));
		sel.addEventListener('change', () => {
			renderKeystrokes(resolvePlatform(sel.value));
			const url = new URL(window.location.href);
			if (sel.value === 'auto') {
				url.searchParams.delete('platform');
			} else {
				url.searchParams.set('platform', sel.value);
			}
			window.history.pushState({ platform: sel.value }, '', url);
		});
		window.addEventListener('popstate', () => {
			sel.value = platformFromUrl() || 'auto';
			renderKeystrokes(resolvePlatform(sel.value));
		});
	} else {
		renderKeystrokes(detectPlatform());
	}

	applyFilter();
})();
