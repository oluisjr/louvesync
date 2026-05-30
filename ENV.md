# 🔐 Guia de Variáveis de Ambiente (.env)

> ⚠️ **IMPORTANTE**: O arquivo `.env` contém informações sensíveis e **NUNCA deve ser commitado** para o GitHub. Está protegido pelo `.gitignore`.

## 📋 Categorias de Variáveis

### 1. **Supabase** (Frontend + Backend)
```env
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```
- ✅ Seguro expor `ANON_KEY` (é pública mesmo)
- ⚠️ `SERVICE_ROLE_KEY` é **backend-only**, nunca no frontend

### 2. **Stripe** (💰 Monetização - CONFIDENCIAL)
```env
VITE_STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...          # Backend only!
STRIPE_WEBHOOK_SECRET=whsec_...        # Backend only!

# IDs dos Planos de Preço
STRIPE_PRICE_ID_PRO_MONTHLY=price_...
STRIPE_PRICE_ID_PRO_YEARLY=price_...
```

**Por que guardar isso aqui?**
- Identifica quantos e quais planos você tem
- Evita hardcodar em código (se trocarem, atualiza só aqui)
- Facilita A/B testing de preços

### 3. **Estratégia de Preços** (🔐 Confidencial)
```env
PRO_PRICE_USD=199
PRO_PRICE_BRL=1099
MONTHLY_REVENUE_TARGET=20000
TARGET_CUSTOMER_COUNT=100
```
**Nunca publique isto - é sua estratégia de negócio!**

### 4. **Email Service** (Comunicação)
```env
RESEND_API_KEY=re_...  # ou SENDGRID_API_KEY
```
Para enviar:
- Boas-vindas aos novos clientes
- Confirmação de pagamento
- Lembretes de renovação
- Alertas de cancelamento

### 5. **Monitoring & Analytics** (Backend Only)
```env
SENTRY_DSN=https://...           # Error tracking
POSTHOG_API_KEY=phc_...          # Product analytics
```
Nunca exponha em frontend!

### 6. **OAuth** (Google Sign-in)
```env
VITE_GOOGLE_CLIENT_ID=...
VITE_GOOGLE_CLIENT_SECRET=...    # Backend only!
```

### 7. **Admin/Internal** (🔓 ULTRA SENSÍVEL)
```env
ADMIN_MASTER_KEY=sk_admin_...
INTERNAL_API_TOKEN=token_internal_...
INTERNAL_ADMIN_EMAIL=admin@louvesync.internal
```

**Só para:**
- Scripts internos (cleanup, migrations)
- Admin dashboard
- Operações críticas

**Nunca exponha para frontend ou terceiros!**

### 8. **Business Logic** (Regras de Negócio)
```env
FREEMIUM_SONG_LIMIT=50
FREEMIUM_SETLIST_LIMIT=10
PRO_FEATURES=pdf_export,collaboration,analytics,api_access,priority_support
```

---

## 🚀 Como Usar

### **Em Desenvolvimento (Local)**
1. Arquivo `.env` contém valores reais
2. Só você acessa (não compartilhe)
3. Nunca commit para Git

### **Em Produção (Vercel)**
1. Adicione secrets em: Vercel Dashboard → Settings → Environment Variables
2. Use `VITE_*` prefix para frontend, sem prefix para backend
3. Vercel injeta automaticamente na build

### **Em Staging/Testing**
1. Use arquivo `.env.staging` separado
2. Use valores de teste (ex: `pk_test_...` do Stripe)
3. Mantenha também em `.gitignore`

---

## 🔒 Segurança: Frontend vs Backend

### ✅ SEGURO expor no Frontend:
- `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PUBLIC_KEY`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_APP_ENV`, `VITE_API_BASE_URL`

### ⛔ NUNCA exponha no Frontend:
- `STRIPE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_MASTER_KEY`
- `INTERNAL_API_TOKEN`
- Qualquer chave com `SECRET` no nome

**Regra de Ouro:** Se começa com `VITE_`, é seguro no frontend. Caso contrário, é backend-only.

---

## 📝 Checklist: Antes de Fazer Deploy

- [ ] `.env` está em `.gitignore`
- [ ] Rodar `git status` e confirmar que `.env` não aparece
- [ ] Todas as `VITE_*` variáveis têm valores válidos
- [ ] `STRIPE_SECRET_KEY` e `ADMIN_MASTER_KEY` são super secretos
- [ ] Vercel tem todas as variáveis de produção
- [ ] Testar build local: `npm run build`
- [ ] Confirmar que não há valores hardcoded no código (usar `process.env` ou `import.meta.env`)

---

## 🚨 Se Vazar uma Chave

**Ação imediata:**

1. **Stripe**: Dashboard → Settings → API Keys → Regenerar `STRIPE_SECRET_KEY` + `WEBHOOK_SECRET`
2. **Supabase**: Project Settings → API Keys → Regenerar `SERVICE_ROLE_KEY`
3. **GitHub**: Varrer histórico com `git-secrets` ou `truffleHog`
4. **Vercel**: Atualizar Environment Variables

---

## 📚 Referências

- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Stripe API Keys](https://dashboard.stripe.com/apikeys)
- [Supabase Service Role](https://supabase.com/docs/guides/api/api-keys)
- [12 Factor App - Config](https://12factor.net/config)

