// React Router uses this origin for URL parsing when no browser origin is available.
// Keep it non-routable without shipping a localhost URL in the production artifact.
export function routerUrlBase() {
  return {
    name: 'router-url-base',
    apply: 'build',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').includes('/node_modules/react-router/dist/')) return null;
      const updated = code.replaceAll('"http://localhost"', '"https://router.invalid"');
      return updated === code ? null : { code: updated, map: null };
    },
  };
}
