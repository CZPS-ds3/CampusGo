import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { t } from '../i18n.js';
import { GoBadge, Icon } from './icons.jsx';

const ITEMS = [
  { id: 'map', label: 'Map', href: '/map', icon: 'map' },
  { id: 'quests', label: 'Quests', href: '/quests', icon: 'quests' },
  { id: 'team', label: 'Team', href: '/team', icon: 'team' },
  { id: 'ranks', label: 'Ranks', href: '/ranks', icon: 'ranks' },
  { id: 'profile', label: 'Profile', href: '/profile', icon: 'profile' },
];

const CLOSE_MS = 260;
const FOCUS_DELAY_MS = 320;

/** Which menu entry a path belongs to: the map, locate and info screens all sit under "Map". */
function sectionOf(pathname) {
  const hit = ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return hit ? hit.id : 'map';
}

/**
 * The red GO badge opens five full-width bars (Map, Quests, Team, Ranks, Profile). While open the page
 * behind is inert, Tab cycles between the badge and the current bar, and the arrow keys walk the bars.
 * The badge shrinks while the page is scrolled down.
 */
export function QuestMenu() {
  const [phase, setPhase] = useState('closed');
  const [focusIndex, setFocusIndex] = useState(0);
  const [spin, setSpin] = useState(0);
  const [shrunk, setShrunk] = useState(false);
  const { pathname } = useLocation();
  const trigger = useRef(null);
  const bars = useRef([]);
  const lastY = useRef(0);
  const open = phase === 'open';

  const activeId = sectionOf(pathname);
  const activeIndex = ITEMS.findIndex((item) => item.id === activeId);

  const close = useCallback((returnFocus = true) => {
    setSpin((n) => n + 1);
    setPhase('closing');
    setTimeout(() => setPhase((current) => (current === 'closing' ? 'closed' : current)), CLOSE_MS);
    if (returnFocus) trigger.current?.focus();
  }, []);

  const openAt = useCallback((index) => {
    setFocusIndex(index);
    setSpin((n) => n + 1);
    setPhase('open');
  }, []);

  // A navigation always closes the menu and brings the badge back to full size.
  useEffect(() => {
    setPhase('closed');
    setShrunk(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY.current + 4) setShrunk(true);
      else if (y < lastY.current - 4) setShrunk(false);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The page behind the menu cannot take focus or taps while it is open.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    if (phase === 'open') root.setAttribute('inert', '');
    else root.removeAttribute('inert');
    return () => root.removeAttribute('inert');
  }, [phase]);

  // Move focus to the chosen bar once the cascade is under way.
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => bars.current[focusIndex]?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(id);
    // Only when opening; later focus moves are done directly by the key handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const moveTo = (index) => {
    const next = (index + ITEMS.length) % ITEMS.length;
    setFocusIndex(next);
    bars.current[next]?.focus();
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
        moveTo(fromTrigger ? activeIndex : focusIndex - 1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        event.preventDefault();
        moveTo(fromTrigger ? activeIndex : focusIndex + 1);
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
        // Two stops by design: the badge and the current bar. Arrows walk the rest.
        event.preventDefault();
        if (fromTrigger) bars.current[focusIndex]?.focus();
        else trigger.current?.focus();
        break;
      default: {
        const hit = ITEMS.findIndex(
          (item) => t(item.label)[0].toLowerCase() === event.key.toLowerCase(),
        );
        if (event.key.length === 1 && hit >= 0) moveTo(hit);
      }
    }
  };

  const onTriggerKeyDown = (event) => {
    if (phase === 'closed' && event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(ITEMS.length - 1);
    }
  };

  const closing = phase === 'closing';

  return createPortal(
    <div className="menu" onKeyDown={onKeyDown}>
      {phase !== 'closed' && (
        <div className="menu__layer">
          <div
            className={`scrim${closing ? ' scrim--out' : ''}`}
            onClick={() => close()}
            aria-hidden="true"
          />
          <nav className="menu__bars" aria-label={t('Main menu')}>
            <ul role="menu" aria-label={t('Main menu')}>
              {ITEMS.map((item, index) => {
                const here = item.id === activeId;
                return (
                  <li
                    key={item.id}
                    role="none"
                    className={`menu__item${closing ? ' is-out' : ''}`}
                    style={{ animationDelay: `${closing ? index * 20 : (4 - index) * 50}ms` }}
                  >
                    <Link
                      ref={(node) => {
                        bars.current[index] = node;
                      }}
                      role="menuitem"
                      className={`bar${here ? ' is-here' : ''}`}
                      to={item.href}
                      tabIndex={open && focusIndex === index ? 0 : -1}
                      aria-current={here ? 'page' : undefined}
                      onClick={(event) => {
                        if (here) {
                          event.preventDefault();
                          close();
                        }
                      }}
                    >
                      <Icon name={item.icon} size={26} />
                      <span className="bar__label">{t(item.label)}</span>
                      {here && <span className="caption">{t('You are here')}</span>}
                      <Icon name="chevron" size={20} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
      <button
        ref={trigger}
        type="button"
        className={`ball${shrunk && !open ? ' is-small' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? t('Close menu') : t('Open menu')}
        onClick={() => (open ? close() : openAt(activeIndex))}
        onKeyDown={onTriggerKeyDown}
      >
        <span key={spin} className={`ball__spin${spin ? ' anim-spin' : ''}`}>
          <GoBadge size={72} icon={open ? 'close' : 'compass'} />
        </span>
      </button>
    </div>,
    document.body,
  );
}
