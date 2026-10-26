/** Round picture, or the first letter of the name when there is no picture. */
export function Avatar({ name = '?', url, large }) {
  return (
    <span className={`avatar${large ? ' avatar--lg' : ''}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
