import prismaPkg from '@prisma/client'
import type * as PrismaTypes from '@prisma/client'

const prismaClient = prismaPkg as unknown as typeof PrismaTypes

export const PrismaClient = prismaClient.PrismaClient
export const Prisma = prismaClient.Prisma

export const UserRole = prismaClient.UserRole
export const ItemType = prismaClient.ItemType
export const TransactionType = prismaClient.TransactionType
export const ChecklistSchedule = prismaClient.ChecklistSchedule
export const ChecklistRunStatus = prismaClient.ChecklistRunStatus
export const ChecklistResult = prismaClient.ChecklistResult
export const PurchaseRequestStatus = prismaClient.PurchaseRequestStatus
