import bcrypt from 'bcryptjs'
import express from 'express'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import { randomBytes, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { Pool } = pg
const app = express()
const port = Number(process.env.PORT || 4173)
const jwtSecret = process.env.JWT_SECRET || 'local-development-secret-change-me'
const databaseUrl = process.env.DATABASE_URL
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

if (!databaseUrl) {
  console.warn('DATABASE_URL não configurada. Configure PostgreSQL antes de usar a API.')
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
})

const defaultData = { selectedTab: 'Resumo do mês', selectedMonth: '2026-08', transactions: [], fixedExpenses: [], incomes: [], goals: [] }

const issueToken = (user) => jwt.sign({ sub: user.id, email: user.email, name: user.name }, jwtSecret, { expiresIn: '7d' })

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Sessão não encontrada.' })
    req.user = jwt.verify(token, jwtSecret)
    next()
  } catch {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' })
  }
}

const initDatabase = async () => {
  if (!databaseUrl) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS finance_data (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `)
}

app.use(express.json({ limit: '2mb' }))

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(normalizedEmail) || String(password || '').length < 8) {
      return res.status(400).json({ error: 'Informe nome, e-mail válido e senha com pelo menos 8 caracteres.' })
    }
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await pool.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email', [name.trim(), normalizedEmail, passwordHash])
    await pool.query('INSERT INTO finance_data (user_id, data) VALUES ($1, $2)', [result.rows[0].id, JSON.stringify(defaultData)])
    res.status(201).json({ user: result.rows[0], token: issueToken(result.rows[0]) })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este e-mail já está cadastrado.' })
    res.status(500).json({ error: 'Não foi possível criar a conta.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' })
    }
    const publicUser = { id: user.id, name: user.name, email: user.email }
    res.json({ user: publicUser, token: issueToken(publicUser) })
  } catch {
    res.status(500).json({ error: 'Não foi possível entrar agora.' })
  }
})

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.sub])
  if (!result.rows[0]) return res.status(401).json({ error: 'Usuário não encontrado.' })
  res.json({ user: result.rows[0] })
})

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const result = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (result.rows[0]) {
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [result.rows[0].id])
    await pool.query("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')", [tokenHash, result.rows[0].id])
    if (process.env.RESET_URL) console.log(`Link de recuperação disponível para envio por e-mail: ${process.env.RESET_URL}?token=${rawToken}`)
  }
  res.json({ message: 'Se o e-mail existir, enviaremos as instruções de recuperação.' })
})

app.get('/api/data', auth, async (req, res) => {
  const result = await pool.query('SELECT data FROM finance_data WHERE user_id = $1', [req.user.sub])
  res.json(result.rows[0]?.data || defaultData)
})

app.put('/api/data', auth, async (req, res) => {
  const data = req.body
  if (!Array.isArray(data.transactions) || !Array.isArray(data.fixedExpenses) || !Array.isArray(data.incomes) || !Array.isArray(data.goals)) {
    return res.status(400).json({ error: 'Formato de dados financeiros inválido.' })
  }
  await pool.query('INSERT INTO finance_data (user_id, data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()', [req.user.sub, JSON.stringify(data)])
  res.status(204).end()
})

app.use(express.static(path.join(projectRoot, 'dist')))
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota não encontrada.' })
  res.sendFile(path.join(projectRoot, 'dist', 'index.html'))
})

initDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => console.log(`Servidor financeiro iniciado na porta ${port}`))
}).catch((error) => {
  console.error('Falha ao iniciar banco de dados:', error)
  process.exit(1)
})