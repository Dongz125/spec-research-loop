import {
	createHmac,
	randomBytes,
	scrypt as scryptCallback,
	timingSafeEqual,
} from 'crypto'
import { promisify } from 'util'
import type { NextFunction, Request, Response } from 'express'

const scrypt = promisify(scryptCallback)
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

interface TokenPayload {
	sub: string
	exp: number
}

function authSecret() {
	const secret = process.env.AUTH_SECRET
	if (!secret || secret.length < 32) {
		throw new Error('AUTH_SECRET phải có ít nhất 32 ký tự')
	}
	return secret
}

function encode(value: object | string) {
	const input = typeof value === 'string' ? value : JSON.stringify(value)
	return Buffer.from(input).toString('base64url')
}

function signature(input: string) {
	return createHmac('sha256', authSecret()).update(input).digest('base64url')
}

export function createAccessToken(userId: string) {
	const header = encode({ alg: 'HS256', typ: 'JWT' })
	const payload = encode({
		sub: userId,
		exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
	} satisfies TokenPayload)
	const unsignedToken = `${header}.${payload}`
	return `${unsignedToken}.${signature(unsignedToken)}`
}

export function verifyAccessToken(token: string) {
	const [header, payload, suppliedSignature, extra] = token.split('.')
	if (!header || !payload || !suppliedSignature || extra) {
		throw new Error('Token không hợp lệ')
	}

	const expectedSignature = signature(`${header}.${payload}`)
	const supplied = Buffer.from(suppliedSignature)
	const expected = Buffer.from(expectedSignature)
	if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
		throw new Error('Token không hợp lệ')
	}

	const parsed = JSON.parse(
		Buffer.from(payload, 'base64url').toString('utf8'),
	) as TokenPayload
	if (!parsed.sub || !parsed.exp || parsed.exp <= Math.floor(Date.now() / 1000)) {
		throw new Error('Token đã hết hạn')
	}
	return parsed
}

export async function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex')
	const derivedKey = (await scrypt(password, salt, 64)) as Buffer
	return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string) {
	const [algorithm, salt, keyHex, extra] = storedHash.split('$')
	if (algorithm !== 'scrypt' || !salt || !keyHex || extra) return false

	const storedKey = Buffer.from(keyHex, 'hex')
	const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer
	return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey)
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
	const authorization = req.headers.authorization
	if (!authorization?.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Vui lòng đăng nhập' })
	}

	try {
		const payload = verifyAccessToken(authorization.slice(7))
		;(req as any).userId = payload.sub
		next()
	} catch {
		res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' })
	}
}

