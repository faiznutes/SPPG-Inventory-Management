import { readFile } from 'node:fs/promises'
import path from 'node:path'

type Check = {
  label: string
  test: (content: string) => boolean
}

type FileCheck = {
  file: string
  checks: Check[]
}

const fileChecks: FileCheck[] = [
  {
    file: 'prisma/schema.prisma',
    checks: [
      { label: 'PurchaseRequest has tenantId field', test: (c) => /tenantId\s+String\s+@map\("tenant_id"\)/.test(c) },
      { label: 'PurchaseRequest has tenant relation', test: (c) => /tenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\]/.test(c) },
      { label: 'PurchaseRequest tenant index exists', test: (c) => /@@index\(\[tenantId, createdAt\(sort: Desc\)\]\)/.test(c) },
    ],
  },
  {
    file: 'src/modules/purchase-requests/purchase-requests.service.ts',
    checks: [
      {
        label: 'PR list scoped by tenantId with fallback support',
        test: (c) => /hasTenantColumn[\s\S]*tenantId:\s*scope\.tenant\.id/.test(c),
      },
      { label: 'PR create persists tenantId', test: (c) => /prNumber,\s*tenantId:\s*scope\.tenant\.id/s.test(c) },
      {
        label: 'PR detail checks tenant ownership (with fallback)',
        test: (c) =>
          /row\.tenantId !== scope\.tenant\.id/.test(c) && /scope\.userIds\.includes\(row\.requested_by\)/.test(c),
      },
    ],
  },
  {
    file: 'src/modules/categories/categories.service.ts',
    checks: [
      { label: 'Categories list scoped by tenant suffix', test: (c) => /name:\s*\{\s*endsWith:\s*suffix/s.test(c) },
      { label: 'Categories seeded per tenant', test: (c) => /ensureTenantCategoriesSeeded\(/.test(c) },
      { label: 'Category edit checks tenant suffix ownership', test: (c) => /if \(!existing\.name\.endsWith\(tenantItemSuffix\(requiredTenantId\)\)\)/.test(c) },
    ],
  },
]

async function run() {
  const root = process.cwd()
  const failures: string[] = []

  for (const fileCheck of fileChecks) {
    const fullPath = path.join(root, fileCheck.file)
    const content = await readFile(fullPath, 'utf8')
    for (const check of fileCheck.checks) {
      if (!check.test(content)) {
        failures.push(`${fileCheck.file}: ${check.label}`)
      }
    }
  }

  if (failures.length) {
    for (const failure of failures) {
      console.error(`FAILED - ${failure}`)
    }
    process.exit(1)
  }

  console.log('Phase-final checks passed.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
