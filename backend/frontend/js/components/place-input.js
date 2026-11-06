// Location field with Nominatim autocomplete and an optional "use my location" button.

import { searchPlaces, reverseGeocode } from '../api.js';
import { icon } from '../icons.js';
import { debounce, el, escapeHtml, toast } from '../ui.js';
import { locateUser } from '../map.js';

export function placeInput({
  id,
  label,
  placeholder = 'Search a place',
  helper = '',
  allowLocate = false,
  onChange = () => {},
}) {
  const node = el(`
    <div class="field place-field">
      <label for="${id}">${escapeHtml(label)}</label>
      <div class="row-tight" style="flex-wrap:nowrap">
        <input id="${id}" type="text" autocomplete="off" spellcheck="false"
               placeholder="${escapeHtml(placeholder)}" aria-describedby="${id}-help">
        ${allowLocate ? `<button type="button" class="icon-btn" data-locate title="Use my current location" aria-label="Use my current location">${icon('crosshair', 18)}</button>` : ''}
      </div>
      <ul class="suggestions" role="listbox" aria-label="${escapeHtml(label)} suggestions"></ul>
      <span class="helper" id="${id}-help">${escapeHtml(helper)}</span>
      <span class="error" hidden></span>
    </div>
  `);

  const input = node.querySelector('input');
  const list = node.querySelector('.suggestions');
  const errorNode = node.querySelector('.error');
  let selected = null;
  let controller = null;

  function setError(message) {
    if (message) {
      errorNode.hidden = false;
      errorNode.innerHTML = `${icon('alert', 14)} ${escapeHtml(message)}`;
      input.setAttribute('aria-invalid', 'true');
    } else {
      errorNode.hidden = true;
      errorNode.textContent = '';
      input.removeAttribute('aria-invalid');
    }
  }

  function commit(place) {
    selected = place;
    input.value = place.label;
    list.innerHTML = '';
    setError('');
    onChange(place);
  }

  const runSearch = debounce(async (query) => {
    controller?.abort();
    controller = new AbortController();
    try {
      const results = await searchPlaces(query, controller.signal);
      list.innerHTML = results
        .map(
          (place, index) => `
            <li role="option">
              <button type="button" data-index="${index}">
                <strong>${escapeHtml(place.short)}</strong><br>
                <span class="xsmall muted">${escapeHtml(place.label)}</span>
              </button>
            </li>`
        )
        .join('');
      list.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => commit(results[Number(button.dataset.index)]));
      });
    } catch (error) {
      if (error.name !== 'AbortError') list.innerHTML = '';
    }
  });

  input.addEventListener('input', () => {
    selected = null;
    if (input.value.trim().length < 3) {
      list.innerHTML = '';
      return;
    }
    runSearch(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') list.innerHTML = '';
    if (event.key === 'ArrowDown') {
      const first = list.querySelector('button');
      if (first) { event.preventDefault(); first.focus(); }
    }
  });

  document.addEventListener('click', (event) => {
    if (!node.contains(event.target)) list.innerHTML = '';
  });

  node.querySelector('[data-locate]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const [lat, lng] = await locateUser();
      const name = (await reverseGeocode(lat, lng)) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      commit({ label: name, short: name.split(',').slice(0, 2).join(','), lat, lng });
      toast('Current location set', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  return {
    node,
    get value() { return selected; },
    set value(place) { if (place) commit(place); },
    setError,
    validate(message = 'Pick a place from the suggestions') {
      if (!selected) { setError(message); return false; }
      setError('');
      return true;
    },
    focus() { input.focus(); },
    clear() { selected = null; input.value = ''; list.innerHTML = ''; setError(''); },
  };
}
