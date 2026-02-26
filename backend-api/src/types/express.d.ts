declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: string
        username: string
        tenantId?: string
      }
    }
  }
}

export {}
