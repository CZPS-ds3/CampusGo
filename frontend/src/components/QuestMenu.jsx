import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { copy } from '../i18n.js';
import { Icon } from './icons.jsx';

const ITEMS = [
  { id: 'map', label: copy.nav.map, href: '/map', icon: 'map' },
  { id: 'quests', label: copy.nav.quests, href: '/quests', icon: 'quests' },
  { id: 'team', label: copy.nav.team, href: '/team', icon: 'team' },
  { id: 'ranks', label: copy.nav.ranks, href: '/ranks', icon: 'ranks' },
  { id: 'profile', label: copy.nav.profile, href: '/profile', icon: 'profile' },
];

const FOCUS_DELAY_MS = 300;

/**
 * Plain round trigger at the bottom centre that opens a slanted, staggered "trail" of five stones.
 * While open the page behind is inert, Tab cycles between the trigger and the current stone, and the
 * arrow keys walk the stones (roving tabindex).
 */
export function QuestMenu() {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const { pathname } = useLocation();
  const trigger = useRef(null);
  const tiles = useRef([]);

  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);

  const openAt = useCallback((index) => {
    setFocusIndex(index);
    setOpen(true);
  }, []);

  // A navigation always closes the menu.
  useEffect(() => setOpen(false), [pathname]);

  // The page behind the menu cannot take focus or taps while it is open.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    if (open) root.setAttribute('inert', '');
    else root.removeAttribute('inert');
    return () => root.removeAttribute('inert');
  }, [open]);

  // Move focus to the chosen stone once the cascade is under way.
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => tiles.current[focusIndex]?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(id);
    // Only when opening; later focus moves are done directly by the key handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const moveTo = (index) => {
    const next = (index + ITEMS.length) % ITEMS.length;
    setFocusIndex(next);
    tiles.current[next]?.focus();
  };

  const onKeyDown = (event) => {
    if (!open) return;
    const fromTrigger = document.activeElement === trigger.current;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'ArrowUp':
      case 'ArrowRight':
        event.preventDefault();
        moveTo(fromTrigger ? activeIndex : focusIndex + 1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        event.preventDefault();
        moveTo(fromTrigger ? activeIndex : focusIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        break;
      case 'End':
        event.preventDefault();
        moveTo(ITEMS.length - 1);
        break;
      case 'Tab':
        // Two stops by design: the trigger and the current stone. Arrows walk the rest.
        event.preventDefault();
        if (fromTrigger) tiles.current[focusIndex]?.focus();
        else trigger.current?.focus();
        break;
      default: {
        const hit = ITEMS.findIndex(
          (item) => item.label[0].toLowerCase() === event.key.toLowerCase(),
        );
        if (event.key.length === 1 && hit >= 0) moveTo(hit);
      }
    }
  };

  const onTriggerKeyDown = (event) => {
    if (!open && event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(ITEMS.length - 1);
    }
  };

  return createPortal(
    <nav className={`menu${open ? ' is-open' : ''}`} aria-label="Main" onKeyDown={onKeyDown}>
      <div className="menu__scrim" onClick={() => close()} aria-hidden="true" />
      <ul id="menu-panel" className="menu__panel" role="menu" aria-label="Main menu">
        {ITEMS.map((item, index) => (
          <li key={item.id} role="none" style={{ '--i': index }}>
            <Link
              ref={(node) => {
                tiles.current[index] = node;
              }}
              role="menuitem"
              className="tile"
              to={item.href}
              tabIndex={open && focusIndex === index ? 0 : -1}
              aria-current={
                index === activeIndex && pathname.startsWith(item.href) ? 'page' : undefined
              }
              onClick={() => setOpen(false)}
            >
              <span className="tile__n" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <Icon name={item.icon} />
              <span className="tile__label">{item.label}</span>
              <span className="tile__here">{copy.nav.here}</span>
            </Link>
          </li>
        ))}
      </ul>
      <button
        ref={trigger}
        type="button"
        className="menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="menu-panel"
        aria-label={copy.nav.menu}
        onClick={() => (open ? close() : openAt(activeIndex))}
        onKeyDown={onTriggerKeyDown}
      >
        <Icon name={open ? 'close' : 'bars'} />
      </button>
    </nav>,
    document.body,
  );
}
