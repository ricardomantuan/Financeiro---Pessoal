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
      password_hash TEXT,
      google_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
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

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'projeto-financeiro' }))

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
  const result = await pool.query('SELECT id, name FROM users WHERE email = $1', [email])
  if (result.rows[0]) {
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [result.rows[0].id])
    await pool.query("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')", [tokenHash, result.rows[0].id])
    const resetLink = `${process.env.RESET_URL || ''}?token=${rawToken}`
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM && process.env.RESET_URL) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM,
          to: [email],
          subject: 'Redefinição de senha | Meu Dinheiro',
          html: `<p>Olá, ${result.rows[0].name}.</p><p><a href="${resetLink}">Clique aqui para criar uma nova senha</a>. O link expira em 30 minutos.</p>`,
        }),
      })
    } else {
      console.log(`Configure RESEND_API_KEY, RESEND_FROM e RESET_URL para enviar: ${resetLink}`)
    }
  }
  res.json({ message: 'Se o e-mail existir, enviaremos as instruções de recuperação.' })
})

app.post('/api/auth/reset-password', async (req, res) => {
  const tokenHash = createHash('sha256').update(String(req.body.token || '')).digest('hex')
  const password = String(req.body.password || '')
  if (password.length < 8) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' })
  const result = await pool.query('SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW()', [tokenHash])
  if (!result.rows[0]) return res.status(400).json({ error: 'Link de recuperação inválido ou expirado.' })
  const passwordHash = await bcrypt.hash(password, 12)
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, result.rows[0].user_id])
  await pool.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash])
  res.json({ message: 'Senha redefinida com sucesso.' })
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

app.use('/api/auth/google', (req, res, next) => {
  if (req.method !== 'GET' || req.path !== '/') return next()
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: process.env.GOOGLE_CALLBACK_URL || '',
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '')
    if (!code || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
      return res.redirect('/?auth_error=google_config')
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    })
    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok) return res.redirect('/?auth_error=google_token')

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileResponse.json()
    if (!profileResponse.ok || !profile.email || !profile.sub) return res.redirect('/?auth_error=google_profile')

    const existing = await pool.query('SELECT id, name, email FROM users WHERE email = $1 OR google_id = $2', [profile.email.toLowerCase(), profile.sub])
    let user = existing.rows[0]
    if (user) {
      const updated = await pool.query('UPDATE users SET google_id = $1 WHERE id = $2 RETURNING id, name, email', [profile.sub, user.id])
      user = updated.rows[0]
    } else {
      const created = await pool.query('INSERT INTO users (name, email, google_id) VALUES ($1, $2, $3) RETURNING id, name, email', [profile.name || profile.email.split('@')[0], profile.email.toLowerCase(), profile.sub])
      user = created.rows[0]
      await pool.query('INSERT INTO finance_data (user_id, data) VALUES ($1, $2)', [user.id, JSON.stringify(defaultData)])
    }

    const token = issueToken(user)
    res.redirect(`/?auth_token=${encodeURIComponent(token)}`)
  } catch {
    res.redirect('/?auth_error=google_callback')
  }
})