/**
 * Plain-language message for a server start-up error, or null when the error is not a known one.
 * The usual cause in development is a second copy of the API that is still running on the same port.
 */
export function describeListenError(error, port) {
  if (error?.code === 'EADDRINUSE') {
    return (
      `Port ${port} is already in use: another copy of the API is probably still running. ` +
      'Close it (or find it with: Get-NetTCPConnection -LocalPort ' +
      `${port}), or set a different PORT in backend/.env, then start again.`
    );
  }
  if (error?.code === 'EACCES') {
    return `The API may not listen on port ${port} (permission denied). Set a different PORT in backend/.env.`;
  }
  return null;
}
