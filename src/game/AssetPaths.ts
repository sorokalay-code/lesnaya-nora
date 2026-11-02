/** Единый путь к ресурсам: учитывает подкаталог сайта и версию содержимого public. */
export function assetUrl(path: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const version = typeof __ASSET_VERSION__ === 'undefined' ? 'dev' : __ASSET_VERSION__;
  return `${base}${path.replace(/^\/+/, '')}?v=${version}`;
}
