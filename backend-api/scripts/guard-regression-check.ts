import { readFile } from 'node:fs/promises'
import path from 'node:path'

type Rule = {
  file: string
  checks: Array<{ name: string; pattern: RegExp }>
}

const rules: Rule[] = [
  {
    file: 'src/modules/transactions/transactions.service.ts',
    checks: [
      { name: 'tenant location set resolver exists', pattern: /resolveTenantLocationSet\(/ },
      { name: 'createTransaction validates tenant locations', pattern: /ensureLocationInTenant\(input\.fromLocationId, tenantLocationIds\)/ },
      { name: 'bulk adjust validates tenant locations', pattern: /for \(const locationId of locationIds\)\s*\{\s*ensureLocationInTenant\(locationId, tenantLocationIds\)/s },
    ],
  },
  {
    file: 'src/modules/checklists/checklists.service.ts',
    checks: [
      { name: 'submit checklist checks active location', pattern: /if \(activeLocationId && run\.locationId !== activeLocationId\)/ },
      { name: 'telegram export checks template scope', pattern: /if \(run\.template\.name !== templateScopeName\)/ },
    ],
  },
  {
    file: 'src/modules/purchase-requests/purchase-requests.service.ts',
    checks: [
      {
        name: 'list PR scoped by tenantId (or fallback requester scope)',
        pattern: /hasTenantColumn[\s\S]*tenantId:\s*scope\.tenant\.id/,
      },
      { name: 'create PR writes tenantId', pattern: /tenantId:\s*scope\.tenant\.id/ },
      { name: 'create PR validates tenant item ids', pattern: /Item pada PR tidak tersedia untuk tenant aktif ini/ },
    ],
  },
]

async function run() {
  const base = process.cwd()
  const failures: string[] = []

  for (const rule of rules) {
    const filePath = path.join(base, rule.file)
    const content = await readFile(filePath, 'utf8')
    for (const check of rule.checks) {
      if (!check.pattern.test(content)) {
        failures.push(`${rule.file}: missing check -> ${check.name}`)
      }
    }
  }

  if (failures.length) {
    for (const failure of failures) {
      console.error(failure)
    }
    process.exit(1)
  }

  console.log('Guard regression checks passed.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
