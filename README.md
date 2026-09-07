# Dashboard Financeiro

Aplicação de dashboard financeiro criada com React + TypeScript + Vite, com foco em gestão de saldo, receitas, despesas, fluxo de caixa e orçamento.

## Funcionalidades

- Cards de resumo financeiro
- Login local e sessão persistida por e-mail
- Cadastro e exclusão de transações e entradas
- Cadastro, exclusão e status pago/pendente para gastos fixos
- Navegação entre meses com totais calculados pelos lançamentos
- Categorias, metas e relatórios baseados nos dados cadastrados
- Backup JSON para exportar e importar os dados
- Layout responsivo para desktop e mobile

## Requisitos

- Node.js 18+
- npm

## Instalação

```bash
npm install
```

## Execução local

```bash
npm run dev -- --host
```

A aplicação ficará disponível em http://localhost:5173.

## Build de produção

```bash
npm run build
```

## Limites atuais

O sistema agora usa API Express, PostgreSQL e autenticação JWT. As senhas são armazenadas apenas como hash bcrypt e os dados financeiros são separados por usuário.

Para ativar o envio real de recuperação de senha, configure na Railway:

- `RESEND_API_KEY`: chave da conta Resend
- `RESEND_FROM`: remetente verificado, como `Meu Dinheiro <contato@seudominio.com>`
- `RESET_URL`: URL pública do sistema

Sem essas variáveis, o pedido de recuperação continua protegido e o link fica disponível apenas nos logs do serviço para configuração inicial.

## Estrutura principal

- src/App.tsx: interface do dashboard
- src/App.css: estilos do layout e componentes
- src/index.css: base visual e reset
