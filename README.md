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

Os dados ainda são armazenados no navegador. O login é local e não valida usuários em um servidor. Backend, banco de dados e autenticação real ficam para a próxima etapa.

## Estrutura principal

- src/App.tsx: interface do dashboard
- src/App.css: estilos do layout e componentes
- src/index.css: base visual e reset
