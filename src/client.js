'use strict';

(() => {
	const input = /** @type {HTMLInputElement | null} */ (document.getElementById('speccy-q'));
	const count = document.getElementById('speccy-count');
	const toastEl = document.getElementById('speccy-toast');
	/** @type {HTMLElement[]} */
	const cells = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.cell')));
	const grids = Array.from(document.querySelectorAll('.grid'));

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

	applyFilter();
})();
