// Stable code established by migration 013; never depend on UUIDs or list order.
export const DEFAULT_INNOVATION_CENTER_CODE = 'CI_JOINVILLE';

export function selectInnovationCenterId(centers, ...preferredIds) {
  for (const id of preferredIds) {
    if (id && centers.some((center) => center.id === id)) return id;
  }
  return centers.find((center) => center.code === DEFAULT_INNOVATION_CENTER_CODE)?.id || '';
}
