const ITEM_TENANT_MARKER = '_tenant_'

export function tenantItemSuffix(tenantId?: string) {
  return tenantId ? `${ITEM_TENANT_MARKER}${tenantId}` : ''
}

export function toTenantScopedItemName(name: string, tenantId?: string) {
  const clean = name.trim()
  if (!clean) return clean
  const suffix = tenantItemSuffix(tenantId)
  return suffix ? `${clean}${suffix}` : clean
}

export function fromTenantScopedItemName(name: string) {
  const markerIndex = name.lastIndexOf(ITEM_TENANT_MARKER)
  if (markerIndex < 0) return name
  return name.slice(0, markerIndex)
}

export function isItemOwnedByTenant(name: string, tenantId?: string) {
  const suffix = tenantItemSuffix(tenantId)
  if (!suffix) return true
  return name.endsWith(suffix)
}
