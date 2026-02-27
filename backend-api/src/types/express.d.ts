declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: string
        username: string
        tenantId?: string
        activeLocationId?: string
        isSuperAdmin?: boolean
      }
    }
  }
}

export {}
