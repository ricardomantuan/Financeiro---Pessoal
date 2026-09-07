import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './App.css'

const TOKEN_KEY = 'finance-auth-token'

type User = {
  id: number
  name: string
  email: string
}

const apiRequest = async <T,>(path: string, options: RequestInit = {}) => {
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const body = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(body?.error || 'Não foi possível concluir a operação.')
  return body as T
}

type Transaction = {
  id: number
  name: string
  category: string
  amount: number
  date: string
  type: 'expense' | 'income'
}

type FixedExpense = {
  id: number
  name: string
  category: string
  value: number
  dueDay: number
  paid: boolean
}

type Income = {
  id: number
  name: string
  value: number
  date: string
}

type Goal = {
  id: number
  name: string
  value: number
  spent: number
  color: string
}

const navItems = ['Resumo do mês', 'Transações', 'Gastos fixos', 'Entradas', 'Relatórios', 'Metas']

const initialTransactions: Transaction[] = [
  { id: 1, name: 'Mercado São Luiz', category: 'Comida', amount: 214, date: '2026-08-15', type: 'expense' },
  { id: 2, name: 'Cinema', category: 'Lazer', amount: 46, date: '2026-08-16', type: 'expense' },
  { id: 3, name: 'Uber', category: 'Transporte', amount: 23, date: '2026-08-17', type: 'expense' },
  { id: 4, name: 'Salário', category: 'Salário', amount: 6500, date: '2026-08-01', type: 'income' },
  { id: 5, name: 'Freela', category: 'Freela', amount: 900, date: '2026-08-12', type: 'income' },
]

const initialFixedExpenses: FixedExpense[] = [
  { id: 1, name: 'Aluguel', category: 'Casa', value: 1700, dueDay: 5, paid: true },
  { id: 2, name: 'Internet', category: 'Casa', value: 120, dueDay: 10, paid: true },
  { id: 3, name: 'Academia', category: 'Saúde', value: 130, dueDay: 30, paid: false },
  { id: 4, name: 'Spotify + Netflix', category: 'Assinaturas', value: 79, dueDay: 15, paid: true },
]

const initialIncomes: Income[] = [
  { id: 1, name: 'Salário', value: 6500, date: '2026-08-01' },
  { id: 2, name: 'Freela', value: 900, date: '2026-08-12' },
]

const initialGoals: Goal[] = [
  { id: 1, name: 'Comida', value: 900, spent: 780, color: '#d76d4d' },
  { id: 2, name: 'Lazer', value: 700, spent: 520, color: '#b7b1aa' },
  { id: 3, name: 'Guardar R$ 800/mês', value: 800, spent: 500, color: '#8eb6a9' },
]

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatMonth = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))

function App() {
  const authToken = new URLSearchParams(window.location.search).get('auth_token')
  if (authToken) {
    localStorage.setItem(TOKEN_KEY, authToken)
    window.history.replaceState({}, '', window.location.pathname)
  }

  const [user, setUser] = useState<User | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isHydrated, setIsHydrated] = useState(false)
  const resetToken = new URLSearchParams(window.location.search).get('token')
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [keepConnected, setKeepConnected] = useState(true)
  const [loginForm, setLoginForm] = useState({ name: '', email: '', password: '' })
  const [selectedTab, setSelectedTab] = useState('Resumo do mês')
  const [selectedMonth, setSelectedMonth] = useState('2026-08')
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions)
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(initialFixedExpenses)
  const [incomes, setIncomes] = useState<Income[]>(initialIncomes)
  const [goals, setGoals] = useState<Goal[]>(initialGoals)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
    if (!token) {
      setIsCheckingSession(false)
      return
    }

    apiRequest<{ user: User }>('/auth/me')
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setIsCheckingSession(false))
  }, [])

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get('auth_error')
    if (authError) setAuthMessage('Não foi possível entrar com o Google. Confira as configurações OAuth.')
  }, [])

  useEffect(() => {
    if (!user) return

    setIsHydrated(false)
    apiRequest<{
      selectedTab?: string
      selectedMonth?: string
      transactions: Transaction[]
      fixedExpenses: FixedExpense[]
      incomes: Income[]
      goals: Goal[]
    }>('/data')
      .then((data) => {
        setSelectedTab(data.selectedTab ?? 'Resumo do mês')
        setSelectedMonth(data.selectedMonth ?? '2026-08')
        setTransactions(data.transactions ?? initialTransactions)
        setFixedExpenses(data.fixedExpenses ?? initialFixedExpenses)
        setIncomes(data.incomes ?? initialIncomes)
        setGoals(data.goals ?? initialGoals)
      })
      .finally(() => setIsHydrated(true))
  }, [user])

  useEffect(() => {
    if (!user || !isHydrated) return

    void apiRequest('/data', {
      method: 'PUT',
      body: JSON.stringify({ selectedTab, selectedMonth, transactions, fixedExpenses, incomes, goals }),
    })
  }, [user, isHydrated, selectedTab, selectedMonth, transactions, fixedExpenses, incomes, goals])

  const [transactionForm, setTransactionForm] = useState({
    name: '',
    category: 'Comida',
    amount: '',
    type: 'expense' as 'expense' | 'income',
  })

  const [fixedForm, setFixedForm] = useState({
    name: '',
    category: 'Casa',
    value: '',
    dueDay: '5',
  })

  const [incomeForm, setIncomeForm] = useState({
    name: '',
    value: '',
  })

  const monthTransactions = useMemo(
    () => transactions.filter((item) => item.date.startsWith(selectedMonth)),
    [selectedMonth, transactions],
  )

  const monthIncomes = useMemo(
    () => incomes.filter((item) => item.date.startsWith(selectedMonth)),
    [selectedMonth, incomes],
  )

  const variableIncome = monthTransactions
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0)

  const variableExpense = monthTransactions
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)

  const totalIncome = monthIncomes.reduce((sum, item) => sum + item.value, 0) + variableIncome
  const totalFixed = fixedExpenses.reduce((sum, item) => sum + item.value, 0)
  const totalExpense = totalFixed + variableExpense

  const balance = totalIncome - totalExpense

  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, number>()

    monthTransactions.forEach((item) => {
      if (item.type === 'expense') {
        categoryMap.set(item.category, (categoryMap.get(item.category) ?? 0) + item.amount)
      }
    })

    const base = [
      { name: 'Comida', total: 900, color: '#d76d4d' },
      { name: 'Lazer', total: 700, color: '#b7b1aa' },
      { name: 'Transporte', total: 500, color: '#cfcbc4' },
      { name: 'Casa', total: 400, color: '#d9d5cf' },
      { name: 'Assinaturas', total: 200, color: '#d76d4d' },
    ]

    return base.map((item) => ({
      ...item,
      value: categoryMap.get(item.name) ?? 0,
    }))
  }, [monthTransactions])

  const alerts = [
    { label: 'Fatura do cartão fecha em 3 dias', action: 'Revisar' },
    { label: 'Aluguel ainda não caiu', action: 'Marcar pago' },
  ]

  const recentTransactions = useMemo(
    () => [...monthTransactions].slice(-3).reverse(),
    [monthTransactions],
  )

  const moveMonth = (offset: number) => {
    const date = new Date(`${selectedMonth}-01T12:00:00`)
    date.setMonth(date.getMonth() + offset)
    setSelectedMonth(date.toISOString().slice(0, 7))
  }

  const handleAddTransaction = () => {
    const value = Number(transactionForm.amount)
    if (!transactionForm.name.trim() || Number.isNaN(value) || value <= 0) return

    setTransactions((current) => [
      ...current,
      {
        id: Date.now(),
        name: transactionForm.name,
        category: transactionForm.category,
        amount: value,
        date: `${selectedMonth}-01`,
        type: transactionForm.type,
      },
    ])

    setTransactionForm({
      name: '',
      category: 'Comida',
      amount: '',
      type: 'expense',
    })
  }

  const handleAddFixedExpense = () => {
    const value = Number(fixedForm.value)
    if (!fixedForm.name.trim() || Number.isNaN(value) || value <= 0) return

    setFixedExpenses((current) => [
      ...current,
      {
        id: Date.now(),
        name: fixedForm.name,
        category: fixedForm.category,
        value,
        dueDay: Number(fixedForm.dueDay),
        paid: false,
      },
    ])

    setFixedForm({
      name: '',
      category: 'Casa',
      value: '',
      dueDay: '5',
    })
  }

  const handleAddIncome = () => {
    const value = Number(incomeForm.value)
    if (!incomeForm.name.trim() || Number.isNaN(value) || value <= 0) return

    setIncomes((current) => [
      ...current,
      { id: Date.now(), name: incomeForm.name, value, date: `${selectedMonth}-01` },
    ])

    setIncomeForm({ name: '', value: '' })
  }

  const handleDeleteTransaction = (id: number) => {
    setTransactions((current) => current.filter((item) => item.id !== id))
  }

  const handleDeleteFixedExpense = (id: number) => {
    setFixedExpenses((current) => current.filter((item) => item.id !== id))
  }

  const handleToggleFixedExpense = (id: number) => {
    setFixedExpenses((current) =>
      current.map((item) => (item.id === id ? { ...item, paid: !item.paid } : item)),
    )
  }

  const handleDeleteIncome = (id: number) => {
    setIncomes((current) => current.filter((item) => item.id !== id))
  }

  const handleToggleGoal = (id: number) => {
    setGoals((current) =>
      current.map((goal) =>
        goal.id === id ? { ...goal, spent: Math.min(goal.spent + 30, goal.value) } : goal,
      ),
    )
  }

  const handleAuth = async () => {
    setAuthMessage('')
    setAuthBusy(true)
    try {
      if (authMode === 'forgot') {
        const response = await apiRequest<{ message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: loginForm.email }),
        })
        setAuthMessage(response.message)
        return
      }

      if (authMode === 'reset') {
        const response = await apiRequest<{ message: string }>('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, password: loginForm.password }),
        })
        setAuthMode('login')
        setAuthMessage(response.message)
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login'
      const response = await apiRequest<{ user: User; token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(loginForm),
      })
      if (keepConnected) {
        localStorage.setItem(TOKEN_KEY, response.token)
        sessionStorage.removeItem(TOKEN_KEY)
      } else {
        sessionStorage.setItem(TOKEN_KEY, response.token)
        localStorage.removeItem(TOKEN_KEY)
      }
      setUser(response.user)
      setLoginForm({ name: '', email: '', password: '' })
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Não foi possível concluir.')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setIsHydrated(false)
  }

  const handleExport = () => {
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      selectedTab,
      selectedMonth,
      transactions,
      fixedExpenses,
      incomes,
      goals,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `meu-dinheiro-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result))
        if (
          !Array.isArray(imported.transactions) ||
          !Array.isArray(imported.fixedExpenses) ||
          !Array.isArray(imported.incomes) ||
          !Array.isArray(imported.goals)
        ) {
          throw new Error('Formato inválido')
        }

        setSelectedTab(imported.selectedTab ?? 'Resumo do mês')
        setSelectedMonth(imported.selectedMonth ?? '2026-08')
        setTransactions(imported.transactions)
        setFixedExpenses(imported.fixedExpenses)
        setIncomes(imported.incomes)
        setGoals(imported.goals)
      } catch {
        window.alert('Não foi possível importar este arquivo.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  if (isCheckingSession) {
    return <div className="auth-view"><div className="auth-card"><p>Carregando sua sessão...</p></div></div>
  }

  if (!user) {
    return (
      <div className="auth-view">
        <div className="auth-card">
          <h1>meu dinheiro</h1>
          <p>{authMode === 'register' ? 'Crie sua conta financeira' : authMode === 'forgot' ? 'Recupere o acesso à sua conta' : authMode === 'reset' ? 'Crie uma nova senha' : 'Entre para ver seu painel financeiro'}</p>

          {authMode === 'register' && (
            <label>
              Nome
              <input
                value={loginForm.name}
                onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })}
                placeholder="Seu nome"
              />
            </label>
          )}

          {authMode !== 'reset' && <label>
            E-mail
            <input
              type="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
              placeholder="voce@email.com"
            />
          </label>}

          {authMode !== 'forgot' && (
            <label>
              Senha {authMode === 'register' && '(mínimo 8 caracteres)'}
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                placeholder="********"
              />
            </label>
          )}

          {authMessage && <p className="auth-message">{authMessage}</p>}

          {authMode === 'login' && (
            <div className="auth-options">
              <label className="remember-option">
                <input
                  type="checkbox"
                  checked={keepConnected}
                  onChange={(event) => setKeepConnected(event.target.checked)}
                />
                <span>manter conectado</span>
              </label>
              <button type="button" className="forgot-link" onClick={() => { setAuthMode('forgot'); setAuthMessage('') }}>
                esqueci a senha
              </button>
            </div>
          )}

          <button type="button" className="primary-action auth-button" onClick={handleAuth} disabled={authBusy}>
            {authBusy ? 'Aguarde...' : authMode === 'register' ? 'Criar conta' : authMode === 'forgot' ? 'Enviar instruções' : authMode === 'reset' ? 'Redefinir senha' : 'Entrar'}
          </button>

          {authMode === 'login' && (
            <>
              <div className="auth-divider"><span>ou</span></div>
              <button type="button" className="google-button" onClick={() => { window.location.href = '/api/auth/google' }}>Entrar com Google</button>
            </>
          )}

          <div className="auth-links">
            {authMode !== 'login' && authMode !== 'reset' && <button type="button" onClick={() => { setAuthMode('login'); setAuthMessage('') }}>Voltar para entrar</button>}
            {authMode === 'reset' && <button type="button" onClick={() => { setAuthMode('login'); setAuthMessage(''); window.history.replaceState({}, '', window.location.pathname) }}>Voltar para entrar</button>}
            {authMode === 'login' && <span>Não tem conta? <button type="button" onClick={() => { setAuthMode('register'); setAuthMessage('') }}>Criar agora</button></span>}
          </div>
        </div>
      </div>
    )
  }

  const renderSection = () => {
    if (selectedTab === 'Resumo do mês') {
      return (
        <>
          <div className="month-header">
            <h2>{formatMonth(selectedMonth)}</h2>
            <div className="month-actions">
              <button type="button" className="mini-button" onClick={() => moveMonth(-1)}>&lt; anterior</button>
              <button type="button" className="mini-button" onClick={() => moveMonth(1)}>próximo &gt;</button>
            </div>
          </div>

          <section className="summary-grid">
            <article className="summary-card highlight-card">
              <span className="label">Saldo do mês</span>
              <div className="amount">{formatCurrency(balance)}</div>
              <div className="mini-bar" aria-hidden="true" />
              <p>72% do mês passado · projeção fim do mês {formatCurrency(890)}</p>
            </article>

            <article className="summary-card">
              <span className="label">Entrou</span>
              <div className="amount small">{formatCurrency(totalIncome)}</div>
              <small>{monthIncomes.length + monthTransactions.filter((item) => item.type === 'income').length} lançamentos</small>
            </article>

            <article className="summary-card">
              <span className="label">Fixos</span>
              <div className="amount small">{formatCurrency(totalFixed)}</div>
              <small>{fixedExpenses.filter((item) => item.paid).length} de {fixedExpenses.length} pagos</small>
            </article>

            <article className="summary-card">
              <span className="label">Variáveis</span>
              <div className="amount small">{formatCurrency(variableExpense)}</div>
              <small>despesas variáveis</small>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel large-panel">
              <div className="panel-title-row">
                <h3>Gastos por categoria</h3>
                <button type="button" className="ghost-link">ver relatório</button>
              </div>

              <div className="category-list">
                {categoryData.map((item) => (
                  <div key={item.name} className="category-row">
                    <div className="category-name">{item.name}</div>
                    <div className="category-value">{formatCurrency(item.value)}</div>
                    <div className="category-bar-wrap">
                      <div
                        className="category-bar"
                        style={{
                          width: `${Math.min((item.value / item.total) * 100, 100)}%`,
                          background: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <p className="note-line">categorias calculadas a partir dos lançamentos do período</p>
            </article>

            <aside className="panel side-panel">
              <div className="panel-title-row">
                <h3>Precisa da sua atenção</h3>
              </div>

              <div className="alert-list">
                {alerts.map((alert) => (
                  <div key={alert.label} className="alert-item">
                    <span>{alert.label}</span>
                    <button type="button" className="inline-button">
                      {alert.action}
                    </button>
                  </div>
                ))}
              </div>

              <div className="panel-title-row recent-row">
                <h3>Últimas transações</h3>
              </div>

              <div className="recent-list">
                {recentTransactions.map((item) => (
                  <div key={item.id} className="recent-item">
                    <span className="recent-name">{item.name}</span>
                    <span className="recent-badge">{item.category}</span>
                    <span className="recent-value">
                      {item.type === 'income' ? '+' : '-'}
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          </section>
        </>
      )
    }

    if (selectedTab === 'Transações') {
      return (
        <div className="section-panel">
          <div className="section-header">
            <h3>Transações</h3>
          </div>

          <div className="form-grid">
            <input
              value={transactionForm.name}
              onChange={(event) => setTransactionForm({ ...transactionForm, name: event.target.value })}
              placeholder="Nome da transação"
            />
            <input
              value={transactionForm.amount}
              onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })}
              type="number"
              placeholder="Valor"
            />
            <select
              value={transactionForm.category}
              onChange={(event) => setTransactionForm({ ...transactionForm, category: event.target.value })}
            >
              <option>Comida</option>
              <option>Lazer</option>
              <option>Transporte</option>
              <option>Casa</option>
              <option>Assinaturas</option>
              <option>Salário</option>
            </select>
            <select
              value={transactionForm.type}
              onChange={(event) =>
                setTransactionForm({
                  ...transactionForm,
                  type: event.target.value as 'expense' | 'income',
                })
              }
            >
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
            <button type="button" onClick={handleAddTransaction} className="primary-action">
              Adicionar
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Tipo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.category}</td>
                    <td>{item.date}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{item.type === 'income' ? 'Receita' : 'Despesa'}</td>
                    <td>
                      <button type="button" className="inline-button" onClick={() => handleDeleteTransaction(item.id)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    if (selectedTab === 'Gastos fixos') {
      return (
        <div className="section-panel">
          <div className="section-header">
            <h3>Gastos fixos</h3>
          </div>

          <div className="form-grid compact-form">
            <input
              value={fixedForm.name}
              onChange={(event) => setFixedForm({ ...fixedForm, name: event.target.value })}
              placeholder="Nome"
            />
            <input
              value={fixedForm.value}
              onChange={(event) => setFixedForm({ ...fixedForm, value: event.target.value })}
              type="number"
              placeholder="Valor"
            />
            <select
              value={fixedForm.category}
              onChange={(event) => setFixedForm({ ...fixedForm, category: event.target.value })}
            >
              <option>Casa</option>
              <option>Saúde</option>
              <option>Assinaturas</option>
            </select>
            <input
              value={fixedForm.dueDay}
              onChange={(event) => setFixedForm({ ...fixedForm, dueDay: event.target.value })}
              type="number"
              placeholder="Dia"
            />
            <button type="button" onClick={handleAddFixedExpense} className="primary-action">
              + Novo fixo
            </button>
          </div>

          <div className="card-list">
            {fixedExpenses.map((item) => (
              <div key={item.id} className="card-item">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.category}</span>
                </div>
                <div>
                  <strong>{formatCurrency(item.value)}</strong>
                  <span>vencimento dia {item.dueDay}</span>
                </div>
                <button type="button" className={`status-button ${item.paid ? 'paid' : 'pending'}`} onClick={() => handleToggleFixedExpense(item.id)}>
                  {item.paid ? 'Pago' : 'Pendente'}
                </button>
                <button type="button" className="inline-button" onClick={() => handleDeleteFixedExpense(item.id)}>
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (selectedTab === 'Entradas') {
      return (
        <div className="section-panel">
          <div className="section-header">
            <h3>Entradas</h3>
          </div>

          <div className="form-grid compact-form">
            <input
              value={incomeForm.name}
              onChange={(event) => setIncomeForm({ ...incomeForm, name: event.target.value })}
              placeholder="Fonte da entrada"
            />
            <input
              value={incomeForm.value}
              onChange={(event) => setIncomeForm({ ...incomeForm, value: event.target.value })}
              type="number"
              placeholder="Valor"
            />
            <button type="button" onClick={handleAddIncome} className="primary-action">
              + Nova entrada
            </button>
          </div>

          <div className="card-list">
            {incomes.map((item) => (
              <div key={item.id} className="card-item">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.date}</span>
                </div>
                <strong>{formatCurrency(item.value)}</strong>
                <button type="button" className="inline-button" onClick={() => handleDeleteIncome(item.id)}>
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (selectedTab === 'Relatórios') {
      return (
        <div className="section-panel">
          <div className="section-header">
            <h3>Relatórios</h3>
          </div>

          <div className="report-grid">
            <div className="report-card large-report">
              <label>Gasto por categoria ao longo do tempo</label>
              <div className="report-placeholder">gráfico de linha</div>
            </div>

            <div className="report-card">
              <label>Agosto em fatias</label>
              <div className="report-placeholder">rosca</div>
            </div>
          </div>

          <div className="report-grid bottom-report-grid">
            <div className="report-card">
              <label>Categoria x média</label>
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Agosto</th>
                    <th>Média</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryData.map((item) => (
                    <tr key={item.name}>
                      <td>{item.name}</td>
                      <td>{formatCurrency(item.value)}</td>
                      <td>{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="report-card">
              <label>Metas de gasto</label>
              {goals.map((goal) => (
                <div key={goal.id} className="goal-item">
                  <div className="goal-topline">
                    <span>{goal.name}</span>
                    <span>{formatCurrency(goal.spent)}</span>
                  </div>
                  <div className="goal-bar-wrap">
                    <div
                      className="goal-bar"
                      style={{ width: `${(goal.spent / goal.value) * 100}%`, background: goal.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="section-panel">
        <div className="section-header">
          <h3>Metas</h3>
        </div>

        <div className="goal-list">
          {goals.map((goal) => (
            <div key={goal.id} className="goal-card">
              <div className="goal-head">
                <strong>{goal.name}</strong>
                <span>{formatCurrency(goal.spent)} de {formatCurrency(goal.value)}</span>
              </div>
              <div className="goal-bar-wrap">
                <div
                  className="goal-bar"
                  style={{ width: `${(goal.spent / goal.value) * 100}%`, background: goal.color }}
                />
              </div>
              <button type="button" className="secondary-button small-button" onClick={() => handleToggleGoal(goal.id)}>
                Atualizar meta
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="app-page">
      <header className="top-strip">
        <div className="status-dots" aria-label="Status">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
        <div className="top-strip-label">meu dinheiro / agosto 2026</div>
      </header>

      <div className="dashboard-shell">
        <aside className="sidebar">
          <div className="brand-row">
            <h1 className="brand">meu dinheiro</h1>
            <button type="button" className="logout-button" onClick={handleLogout}>
              Sair
            </button>
          </div>

          <div className="user-mini">Olá, {user.name}</div>

          <nav className="nav">
            {navItems.map((item) => (
              <button
                key={item}
                type="button"
                className={`nav-item ${selectedTab === item ? 'active' : ''}`}
                onClick={() => setSelectedTab(item)}
              >
                {item}
              </button>
            ))}
          </nav>

          <input ref={importInputRef} type="file" accept="application/json" hidden onChange={handleImport} />
          <button type="button" className="import-button" onClick={() => importInputRef.current?.click()}>
            + Importar backup
          </button>
          <button type="button" className="secondary-button" onClick={handleExport}>
            Baixar backup
          </button>
          <button type="button" className="secondary-button">
            + Lançar manual
          </button>
        </aside>

        <main className="main-panel">{renderSection()}</main>
      </div>
    </div>
  )
}

export default App
