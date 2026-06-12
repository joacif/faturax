# FaturaX 💳

O **FaturaX** é um gerenciador financeiro moderno de cartões de crédito e rateio de compras desenvolvido com React, TypeScript, TailwindCSS e Supabase (com suporte a banco local off-line). Ele foi desenhado especialmente para quem divide contas recorrentes de cartão com amigos, colegas de quarto ou familiares de forma justa e dinâmica.

---

## 🚀 Funcionalidades Principais

### 1. Fatura Aberta Dinâmica (Baseada no Fechamento)
- A visualização do faturamento dos seus cartões e despesas de pessoas foca estritamente no ciclo em aberto (`pending`).
- O sistema calcula automaticamente o ciclo ativo com base no dia de fechamento (`closing_day`) de cada cartão e na parcela pendente mais antiga encontrada no banco de dados.
- Uma compra feita no dia do fechamento (ou após) é lançada na fatura do mês seguinte automaticamente.

### 2. Quitação de Fatura com Avanço Automático
- O botão **"Marcar Fatura como Paga"** nos detalhes do cartão permite dar baixa de forma síncrona em todas as parcelas pendentes daquele ciclo (e nos rateios dos amigos associados).
- Assim que o ciclo atual é quitado, o aplicativo calcula reativamente a próxima fatura pendente e avança a exibição do cartão de forma automática.

### 3. Divisão de Compras Inteligente e Independente
- O valor da compra e de suas parcelas é dividido estritamente entre as pessoas marcadas na listagem do formulário (incluindo a opção de se incluir na divisão ou não).
- Se apenas 1 pessoa for marcada, a parcela vai 100% para ela.
- Se nenhuma for marcada, o sistema presume que a compra é 100% do dono do cartão.
- O sistema calcula e distribui de forma cirúrgica as frações de centavos resultantes de dízimas de divisões ímpares.

### 4. Perfil Virtual "Você" & Detalhes de Amigos
- **Painel de Pessoas colapsável**: exibe a lista de amigos e o perfil virtual **Você** (`owner_profile`) fixado no topo.
- **Detalhamento Multi-Cartão**: exibe individualmente os rateios de cada pessoa agrupados por cartão de crédito e associados à fatura ativa de cada um.
- **Rótulos Dinâmicos**: indica de forma visual se os gastos referem-se à `"Fatura Atual"` (ciclo vigente) ou à `"Próxima Fatura"`.
- **Fração de Parcelas**: exibe de forma clara e visível o progresso de parcelas em frações (ex: `3/10`).

---

## 🛠️ Tecnologias Utilizadas

- **Framework**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Linguagem**: [TypeScript](https://www.typescriptlang.org/)
- **Estilização**: [TailwindCSS](https://tailwindcss.com/)
- **Banco de Dados**: [Supabase](https://supabase.com/) (Banco na nuvem com autenticação e PostgreSQL)
- **Modo Guest**: [LocalStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) (Modo off-line de demonstração instantânea)
- **Ícones**: [Lucide React](https://lucide.dev/)

---

## ⚙️ Instalação e Configuração

### Pré-requisitos
Certifique-se de ter o [Node.js](https://nodejs.org/) instalado em sua máquina.

### Passos para rodar localmente

1. Clone o repositório do projeto:
   ```bash
   git clone https://github.com/joacif/faturax.git
   cd faturax
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente (Opcional - para habilitar nuvem com Supabase):
   Crie um arquivo `.env.local` na raiz do projeto e insira as credenciais do seu projeto Supabase:
   ```env
   VITE_SUPABASE_URL=sua-url-do-supabase
   VITE_SUPABASE_ANON_KEY=sua-chave-anonima-do-supabase
   ```
   *Nota: Caso as chaves não sejam fornecidas ou configuradas, o sistema funcionará no **Modo Convidado (Off-line)** salvando seus cartões e compras localmente no navegador.*

4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

5. Abra o navegador no endereço indicado (normalmente `http://localhost:5173`).

---

## 🏗️ Build de Produção

Para gerar o bundle otimizado de produção, execute:
```bash
npm run build
```
O build compilará o código TypeScript e gerará os arquivos estáticos prontos para deploy na pasta `/dist`.
