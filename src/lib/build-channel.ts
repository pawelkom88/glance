export type BuildChannel = 'paid' | 'product_hunt';

export function getBuildChannel(): BuildChannel {
  return import.meta.env.VITE_GLANCE_BUILD_CHANNEL === 'product_hunt'
    ? 'product_hunt'
    : 'paid';
}

export function isProductHuntBuild(): boolean {
  return getBuildChannel() === 'product_hunt';
}

export function getAppDisplayName(): string {
  return isProductHuntBuild() ? 'Glance Trial' : 'Glance';
}
