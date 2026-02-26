import crypto from 'node:crypto'
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken'
import { env } from '../config/env.js'

type JwtPayload = {
  sub: string
  role: string
  username: string
  tenantId?: string
}

function signToken(payload: JwtPayload, secret: Secret, expiresIn: SignOptions['expiresIn']) {
  return jwt.sign(payload, secret, { expiresIn })
}

export function generateAccessToken(payload: JwtPayload) {
  return signToken(payload, env.JWT_SECRET, env.ACCESS_TOKEN_EXPIRES as SignOptions['expiresIn'])
}

export function generateRefreshToken(payload: JwtPayload) {
  const expiresIn = `${env.REFRESH_TOKEN_EXPIRES_DAYS}d`
  return signToken(payload, env.JWT_REFRESH_SECRET, expiresIn as SignOptions['expiresIn'])
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}
