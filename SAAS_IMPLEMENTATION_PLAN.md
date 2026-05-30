# 🎵 LouveSync - Plano de Transformação em SaaS

## 🎯 Objetivo Final
Gerar **R$20.000/mês** com modelo de assinatura recorrente para músicos, bandas e setlistadores.

---

## 📊 Modelo de Negócio

### ✅ Estratégia B2B (Organization-Based Pricing)

**O LouveSync é vendido POR ORGANIZAÇÃO, não por usuário individual:**
- 1 Igreja = 1 Organização (múltiplos ministérios podem compartilhar)
- 1 Escola de Música = 1 Organização (múltiplos alunos/turmas)
- 1 Banda/Grupo = 1 Organização (múltiplos membros colaboram)

### Estratégia de Preços (B2B)
```
FREE TIER (Prova de conceito):
- Até 50 músicas
- Até 3 usuários/organização
- Setlists básicas
- Sem colaboração em tempo real
- Sem suporte prioritário

PRO ($349/mês ou $3.490/ano - Padrão para igrejas/escolas):
- Músicas ilimitadas
- Até 15 usuários (cobr todos os ministérios)
- Setlists ilimitadas
- ✨ Colaboração em tempo real (CORE FEATURE)
- PDF export customizado (com logo da organização)
- Analytics de ensaios/setlists
- Suporte email prioritário
- Chat integrado no app

ENTERPRISE ($799+/mês - Para redes/dioceses/cadeias):
- Tudo do PRO
- Usuários ilimitados
- Múltiplas organizações (ex: 3 igrejas da mesma rede)
- API pública (integração com sistemas paroquiais)
- Custom branding (cor, logo)
- Single Sign-On (SSO) via directory corporativo
- Webhooks para integrações
- Suporte 24/7 via WhatsApp/Zoom
- Account manager dedicado
```

**Cenários de Receita:**
```
Conservador:  50 orgs PRO @ R$349 = R$17.450/mês
Realista:     60 orgs PRO @ R$349 + 3 Enterprise @ R$1.000 = R$23.950/mês ← ALVO
Agressivo:   100 orgs PRO @ R$349 + 10 Enterprise @ R$1.200 = R$46.900/mês

Estimativa de Churn:
- Fase inicial: 5-10% ao mês (natural)
- Pós-estabilização: 2-3% ao mês (produto bom, lock-in alto)
- Para manter 60 ativas: adicionar ~5-6 novas por mês
```

---

## 🏗️ Fases de Implementação

### **FASE 1: Arquitetura Multi-Tenant B2B (Semanas 1-4)**

#### 1.1 Schema Supabase (Organização-cêntrico)
```sql
-- Tabela de organizações (igrejas, escolas, bandas)
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT,
  logo_url TEXT,
  subscription_tier TEXT ('FREE', 'PRO', 'ENTERPRISE'),
  subscription_status TEXT ('active', 'trialing', 'canceled'),
  max_users INT (3 for FREE, 15 for PRO, unlimited for ENTERPRISE),
  created_at TIMESTAMP,
  stripe_customer_id TEXT UNIQUE
);

-- Usuários com associação à organização
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT,
  organization_id UUID REFERENCES organizations(id),
  role TEXT ('admin', 'editor', 'viewer'),
  created_at TIMESTAMP
);

-- Músicas com org_id
ALTER TABLE songs ADD COLUMN organization_id UUID REFERENCES organizations(id);
CREATE INDEX songs_org_idx ON songs(organization_id);

-- Setlists com org_id + real-time presence
ALTER TABLE setlists ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE setlists ADD COLUMN last_modified_by UUID REFERENCES users(id);
ALTER TABLE setlists ADD COLUMN last_modified_at TIMESTAMP;

-- Presença em tempo real (quem está vendo/editando)
CREATE TABLE setlist_presence (
  id UUID PRIMARY KEY,
  setlist_id UUID REFERENCES setlists(id),
  user_id UUID REFERENCES users(id),
  active_at TIMESTAMP,
  editing_section TEXT
);

-- Logs de auditoria
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  action TEXT ('created_song', 'edited_setlist', 'exported_pdf', 'invited_user'),
  created_at TIMESTAMP
);
```

#### 1.2 Row Level Security (RLS) - Isolamento Total
```sql
-- Usuários só veem sua organização
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view songs from their organization"
  ON songs FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Mesma lógica para setlists, users, etc
ALTER TABLE setlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view setlists from their organization"
  ON setlists FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
```

#### 1.3 Permissões por Role
```javascript
// Roles dentro de uma organização:
ADMIN:    criar/editar/deletar tudo, gerenciar usuários
EDITOR:   criar/editar/deletar songs & setlists próprios
VIEWER:   visualizar apenas, sem editar

// Middleware de autorização
async function canEditSetlist(userId, setlistId) {
  const user = await getUser(userId);
  const setlist = await getSetlist(setlistId);
  
  // Mesma org?
  if (user.organization_id !== setlist.organization_id) {
    throw new Error('Unauthorized');
  }
  
  // Tem permissão de role?
  return ['admin', 'editor'].includes(user.role);
}
```

#### 1.4 Real-Time Collaboration (Supabase Realtime)
```javascript
// Presença em tempo real
import { RealtimeChannel } from '@supabase/supabase-js';

const channel = supabase.channel(`setlist:${setlistId}`);

channel.on('presence', { event: 'sync' }, (presence) => {
  // Mostra quem está editando agora
  console.log('Editando agora:', presence);
}).subscribe();

// Broadcast de mudanças
channel.send({
  type: 'broadcast',
  event: 'song_added',
  payload: newSong
});
```

**Tasks:**
- [ ] Migrar schema Supabase para org-cêntrico
- [ ] Implementar RLS policies
- [ ] Criar tabela de presence/activity
- [ ] Setup Realtime no frontend
- [ ] Testes de isolamento (uma org não vê dados da outra)

#### 1.2 Autenticação Profissional (B2B Flow)
```
Implementar:
1. Email + Password
2. Magic Links (passwordless)
3. Organization Invite Link (admin envia link, novos usuários entram)
4. SSO via Google/Microsoft (para Enterprise)

Flow de novo usuário:
- Admin cria organização (trial 7 dias)
- Admin gera invite link ou manual email
- Novo usuário clica link, entra automático na org
- Admin aprova ou adiciona automático conforme role
```

---

### **FASE 2: Pagamento & Entitlements B2B (Semanas 5-7)**

#### 2.1 Stripe Organization-Based Billing
```javascript
// 1 organização = 1 Stripe customer
// Pagamento mensal/anual da organização inteira

Webhook listeners:
- customer.subscription.created (nova assinatura)
- customer.subscription.updated (downgrade/upgrade)
- customer.subscription.deleted (cancelamento)
- invoice.payment_succeeded (pagamento confirmado)
- invoice.payment_failed (falha de pagamento)

// Ao atualizar subscription:
customer_subscription.metadata = {
  organization_id: "uuid-xxx",
  max_users: 15,
  tier: "pro"
}
```

**Implementar:**
- [ ] Stripe customer criado ao criar organização
- [ ] Webhook listeners para subscription events
- [ ] Billing portal (Stripe Hosted) - upgrade/downgrade/cancelar
- [ ] Upgrade flow (admin vê "Upgrade para PRO" in-app)
- [ ] Auto-cancel ao expirar card (ou resgate manual)

#### 2.2 Entitlement Engine (Por Organização)
```javascript
// Verificar permissões da ORGANIZAÇÃO
async function canAddUser(organizationId) {
  const org = await getOrganization(organizationId);
  const userCount = await countUsersInOrganization(organizationId);
  
  if (org.tier === 'FREE') {
    return userCount < 3;
  } else if (org.tier === 'PRO') {
    return userCount < 15;
  } else if (org.tier === 'ENTERPRISE') {
    return true; // unlimited
  }
}

// Verificar permissão de FEATURE
async function canExportPDF(organizationId) {
  const org = await getOrganization(organizationId);
  return org.tier !== 'FREE'; // PRO e ENTERPRISE podem
}

// Verificar permissão de USUÁRIO
async function canEditSetlist(userId, setlistId) {
  const user = await getUser(userId);
  const setlist = await getSetlist(setlistId);
  
  // Mesma organização?
  if (user.organization_id !== setlist.organization_id) {
    return false;
  }
  
  // Tem role?
  return ['admin', 'editor'].includes(user.role);
}
```

**Dependências:**
```json
"stripe": "^14.0.0",
"@stripe/react-stripe-js": "^2.0.0"
```

---

### **FASE 3: Real-Time Collaboration & Premium Features (Semanas 8-11)**

#### 3.1 Core Premium Feature: Live Collaboration 🎯
```
O diferencial: MÚLTIPLOS ministros/alunos editando setlist SIMULTANEAMENTE

Feature Include:
- Cursor tracking (ver cursor de outro usuário com nome)
- Presença em tempo real (quem está vendo/editando agora)
- Notificações em tempo real (João adicionou música, Maria removeu, etc)
- Conflitless editing (Operational Transform ou CRDT)
- Chat integrado ("Vamos começar com A menor?")

Exemplo real em Igreja:
- Ministro A está montando setlist no domingo
- Ministro B vê em tempo real e sugere mudança de tom
- Ambos veem quando novo ministro entra na sala
- Tudo sincronizado automaticamente
```

#### 3.2 Outros Recursos Premium
- [ ] **PDF Export Profissional**: com logo, cores, formatação customizada
- [ ] **Analytics Dashboard**: 
  - Histórico de setlists (qual música mais usada?)
  - Tempo de ensaio por música
  - Estatísticas por ministério/turma
- [ ] **Transposição em Lote**: mudar key de múltiplas músicas de uma vez
- [ ] **Integração Spotify**: buscar BPM/duração automático
- [ ] **Agendador de Ensaios**: "Ensaiar esta setlist quarta às 19h"
- [ ] **Backup & Export**: histórico de setlists antigas (archive)
- [ ] **Custom Branding** (ENTERPRISE): logo, cores, domínio

#### 3.3 Admin Dashboard (Por Organização)
```
Admin vê:
- Listagem de todos os usuários (add/remove/role change)
- Plano atual + data renovação
- Histórico de atividades (quem fez o quê)
- Integrations settings (Spotify, etc)
- Billing settings (atualizar card)
- Convites pendentes
```

---

### **FASE 4: UI/UX Profissional B2B (Semanas 6-12 // paralelo)**

#### 4.1 Branding & Design
- [ ] Landing page profissional com 3 casos de uso:
  - "Para Igrejas: Coordene ministérios em tempo real"
  - "Para Escolas: Alunos colaboram em setlists"
  - "Para Bandas: Toque junto com setlist sincronizada"
- [ ] Pricing page clara (FREE / PRO / ENTERPRISE)
- [ ] Dark mode profissional
- [ ] Componentes de loading/erro melhorados
- [ ] Onboarding interativo (5-7 passos)
- [ ] Mobile responsivo (PWA otimizado)

#### 4.2 Org Switcher (Multi-Org Support)
```
Se usuário pertence a múltiplas organizações:
- Dropdown no top (ex: "Igreja Central" / "Banda X")
- Quick switch entre orgs
- Context isolado por org
- Notificações por org
```

#### 4.3 Dashboard Admin (por Org)
```
Admin Section:
- Members: listar, adicionar, remover, mudar roles
- Billing: plano atual, invoice, update payment method
- Activity: log de quem fez o quê
- Settings: org name, logo, integrations
- Invite link: gerar link para novos usuários
```

---

### **FASE 5: DevOps & Escalabilidade (Semanas 8-12)**

#### 5.1 Infraestrutura
```
Frontend:
- Vercel (deploy automático, CDN global) ✓ já em uso
- Vercel Analytics

Backend:
- Supabase (gerenciado) ✓ já em uso
- Supabase Edge Functions para webhooks

Monitoramento:
- Sentry (error tracking)
- PostHog (analytics de produto)
- Logtail (logs centralizados)
```

**Dependências:**
```json
"@sentry/react": "^7.0.0",
"posthog-js": "^1.100.0"
```

#### 5.2 Performance & Cache
- [ ] Redis cache (Supabase Redis)
- [ ] Compressão automática de PDFs
- [ ] Lazy loading de setlists
- [ ] Índices de banco de dados otimizados

---

### **FASE 6: Suporte & Onboarding (Semanas 11-ongoing)**

#### 6.1 Canais de Suporte
- [ ] Chat bot com FAQ (embed no app)
- [ ] Email support com template (Resend/SendGrid)
- [ ] Base de conhecimento (Docs site)
- [ ] Vídeos de tutorial (YouTube)
- [ ] Comunidade Discord

#### 6.2 Onboarding
```javascript
// Flow:
1. SignUp (email)
2. Email verification
3. Tutorial interativo (5 passos)
4. Import PDF primeiro (ação concreta)
5. Convite para FREE trial PRO (7 dias)
6. Upgrade prompt
```

---

## 🗓️ Timeline Sugerida (B2B)

```
MÊS 1 (Semanas 1-4):
- Semanas 1-2: Multi-tenancy + RLS no Supabase
- Semana 3: Autenticação + org invite flow
- Semana 4: Organization switcher no frontend

MÊS 2 (Semanas 5-8):
- Semana 5-6: Stripe org-based billing
- Semana 7: Entitlement engine (validar permissões)
- Semana 8: Real-time presence + Realtime channel

MÊS 3 (Semanas 9-12):
- Semana 9-10: Live collaboration (cursor + notifications)
- Semana 11-12: Admin dashboard + premium features

PRÉ-LAUNCH (2-3 semanas):
- Beta testing com 10-15 organizações piloto
- Feedback + iteração
- Landing page + sales deck

LAUNCH (Semana 16):
- Go live
- Campanha de outbound (igrejas, escolas, bandas)
```

---

## 💻 Tech Stack Recomendado

### Frontend (React + Vite → Next.js eventual)
```json
{
  "dependencies": {
    "react": "^19.2",
    "react-dom": "^19.2",
    "@supabase/supabase-js": "^2.x",
    "@stripe/react-stripe-js": "^2.0",
    "zustand": "^4.0", // state (org context, user context)
    "react-query": "^5.0", // server state (songs, setlists)
    "tailwindcss": "^4.0",
    "shadcn-ui": "latest" // ui components profissionais
  }
}
```

### Real-Time Collaboration
```
- Supabase Realtime (presente, mudanças)
- Yjs ou Automerge (conflictless editing - OPCIONAL primeira versão)
- WebSocket via Supabase (já built-in)
```

### Backend Services
```
- Supabase Auth (built-in)
- Supabase Database (PostgreSQL)
- Supabase Realtime (WebSocket)
- Stripe (billing)
- Resend ou SendGrid (email)
- Sentry (error tracking)
- PostHog (analytics)
```

### Deployment
```
- Vercel (frontend, já em uso)
- Supabase (backend, já em uso)
- Stripe (webhooks)
```

---

## 📈 KPIs para Monitorar (B2B)

```
Métricas de Negócio:
- Monthly Recurring Revenue (MRR): R$23.950/mês (meta)
- Organizations (paying): 60+ para atingir target
- Average Revenue Per Organization (ARPO): R$400
- Churn rate (organizações): meta < 3% ao mês
- Trial-to-paid conversion: meta > 25%

Métricas de Produto:
- Daily Active Organizations (DAO)
- Collaboration events (cursor moves, edits)
- Users per organization (média: 5-8)
- Setlists created per organization/mês
- PDF exports per organization (indica engagement)
- Feature adoption (% usando real-time collab)

Métricas de Saúde:
- Downtime SLA: < 0.5% (almejado)
- Support response time: < 4h
- Customer satisfaction (NPS): > 50
```

---

## 🚀 Quick Wins (Fazer Primeiro - Semanas 1-2)

Para começar a gerar receita **rapidamente** (antes de real-time collab):

1. **Landing page + Pricing página B2B** (3-5 dias)
   - 3 casos de uso (Igreja, Escola, Banda)
   - Pricing claro (FREE / PRO / ENTERPRISE)
   - CTA: "Comece Seu Trial de 7 Dias Grátis"
   - Depoimentos de 2-3 igrejas/escolas piloto

2. **Organization creation + Free trial 7 dias** (1 semana)
   - Admin cria organização (email + senha)
   - Acesso automático a FREE tier (3 users, 50 songs)
   - Aviso de trial expirando (email no dia 5)
   - Upgrade button visível em toda a app

3. **Stripe checkout org-based** (1 semana)
   - Após trial, redirecionar para checkout
   - Escolher entre PRO (R$349/mês) ou ENTERPRISE (R$799+)
   - Email de confirmação com acesso
   - Billing portal (manage subscription, update payment)

4. **Invite link para adicionar usuários** (3 dias)
   - Admin gera link único
   - Novo usuário clica, entra automático
   - Não precisa de aprovação adicional (frictionless)

5. **Email automation** (3 dias)
   - Boas-vindas ao criar org
   - Reminder trial expirando
   - Invoice/confirmação de pagamento
   - Alerta se pagamento falhar

**Com isso, você pode começar a vender ANTES de ter real-time collab perfeit!**


---

## 💰 Estimativa de Custos Mensais (B2B)

```
INFRASTRUCTURE:
- Supabase (PostgreSQL + Auth + Realtime): $50-150
- Vercel Pro (frontend): $20
- Stripe: 2.9% + $0.30 por transação (~3-4% receita)
- Resend (emails): $20-50
- Sentry: $29
- PostHog (analytics): $0 (free tier)

MONITORING & SUPPORT:
- Uptime monitoring: $0-20
- Customer support tools: $0

TOTAL INFRAESTRUTURA: ~$150-250/mês (fixo)

MARGEM EM DIFERENTES CENÁRIOS:

50 orgs PRO @ R$349 = R$17.450
  Custos: ~$200 infra + $600 Stripe (3.4%) = $800
  Margem: 95%

60 orgs PRO + 2 Enterprise @ R$349 + R$1000 = R$21.940
  Custos: ~$250 infra + $730 Stripe (3.3%) = $980
  Margem: 95.5%

100 orgs PRO + 5 Enterprise = R$47.900
  Custos: ~$350 infra + $1.600 Stripe (3.3%) = $1.950
  Margem: 96%
```

**Em resumo: ALTÍSSIMA margem (95%+) em B2B org-based!**

---

## ⚠️ Riscos & Mitigações (B2B)

| Risco | Mitigação |
|-------|-----------|
| **Orgs em FREE forever** | Limite 3 usuários em FREE - força upgrade quando banda cresce. Email de "você atingiu limite" |
| **Churn por falta de collab** | Real-time collaboration é differentiator. Implementar antes de fazer heavy sales |
| **Sem diferenciador vs konkorrentes** | Lock-in via: dados (setlists), community, integrações paroquiais exclusivas |
| **Adoção lenta em igrejas** | Focar em "admin da banda" primeiro. Pessoa que já gerencia setlists hoje |
| **Problemas de sync/data loss** | Testes de conflitless editing. Backups automáticos. Recover histórico |
| **Support escalado** | FAQ + video tutorials reduzem suporte. Chat bot para FAQ comum |
| **Preço muito alto** | Começar com "custom pricing" até entender disposição a pagar |
| **Downtime em ensaio crítico** | 99.9% uptime SLA via Supabase. Alertas proativos |

---

## 📋 Checklist de Lançamento (B2B)

```
ARQUITETURA & SEGURANÇA:
- [ ] Multi-tenancy implementado (org_id em todas as tabelas)
- [ ] RLS policies testadas (org isolada de outra)
- [ ] Org invite link funcionando
- [ ] Organization switcher no frontend

PAGAMENTO:
- [ ] Stripe org-based billing funcionando
- [ ] Stripe webhooks mapeados (all 6 events)
- [ ] Billing portal integrado
- [ ] Free trial 7 dias automático

REAL-TIME:
- [ ] Supabase Realtime presence (quem tá editando)
- [ ] Broadcast de mudanças (live notifications)
- [ ] Testes de concorrência (2+ users simultâneos)

FEATURES MÍNIMAS PARA LAUNCH:
- [ ] PDF import (já tem)
- [ ] Setlist create/edit (já tem)
- [ ] Real-time presence (quem vê agora)
- [ ] Invite usuários (novo)
- [ ] Admin member management (novo)
- [ ] Billing dashboard (novo)

COMPLIANCE & LEGAL:
- [ ] Privacy policy (LGPD compliant se BR)
- [ ] Terms of Service
- [ ] Data processing agreement
- [ ] GDPR notice (se vender pra EU)

MARKETING:
- [ ] Landing page live
- [ ] 3 case studies de piloto (3 igrejas/escolas)
- [ ] Email templates (welcome, upgrade, invoice)
- [ ] Sales deck (PDF para vender)
- [ ] 50 orgs piloto recrutadas (beta)
```

---

## 🎬 Próximos Passos Imediatos

1. **Semana 1-2:** Migrar schema para org-cêntrico (RLS, org_id)
2. **Semana 3-4:** Stripe org-based billing + checkout
3. **Semana 5:** Landing page + convide pilotos (10-15 igrejas/escolas)
4. **Semana 6+:** Real-time collaboration core

---

## 📞 Dúvidas B2B Específicas

**P: Se uma Igreja tem 15 pessoas, todos na mesma organização, qual o LTV?**
R: 
- Igreja paga R$349/mês = R$4.188/ano
- Se churn 3%/mês = vida média 33 meses
- LTV = R$349 × 33 = R$11.517 por organização
- Muito mais que modelo B2C (seria R$50-100 por usuário)

**P: Como cobro de igrejas que não querem cartão de crédito?**
R: PIX, boleto, transferência bancária são opções. Usar Stripe com processadores locais (ex: Tripe) para aceitar PIX.

**P: Devo cobrar por usuário adicional acima de 15?**
R: Não. Cobrar por organização inteira incentiva adoção (não priva pessoas de usar). E dados agregados são mais valiosos.

**P: Qual deveria ser meu foco de venda?**
R: 
1. **Mês 1-2:** Igrejas com ministério de louvor (já organizam setlists)
2. **Mês 3-4:** Escolas de música (professores colaboram)
3. **Mês 5+:** Bandas profissionais (dispostos a pagar mais)

**P: Como faço para converter FREE → PRO?**
R: Quando org atinge limite (3 users), mostrar modal:
- "Convite recusado: você atingiu 3 usuários"
- "Upgrade para PRO (R$349/mês) = 15 usuários"
- "Ver planos →" (link para upgrade)

**P: Real-time collab é realmente necessária para lançar?**
R: Para LAUNCH mínimo: não. Mas para COMPETIR: sim. Sem collab, qualquer clone B2C funciona. Collab é seu moat.

---

## 🎯 Valuation & Unit Economics (B2B Org-Based)

### Cenário Realista em 12 meses:

```
MÊS 1-3: Ramp-up (5-15 orgs)
- Foco: pilotos + refinement
- MRR: R$2-5k

MÊS 4-6: Aceleração (15-35 orgs)
- Foco: marketing + sales outreach
- MRR: R$5-12k
- Churn natural: 2-3%

MÊS 7-12: Crescimento (35-60+ orgs)
- Foco: retention + referrals
- MRR: R$12-24k
- Avg orgs paying: 60
- Avg ARPU: R$400 (mix PRO + Enterprise)
```

### Lifetime Value por Organização:

```
FREEMIUM ORG (free forever):
- LTV = R$0
- Estratégia: limite força upgrade eventual

FREE → PRO converter (30% conversion rate esperado):
- Subscription: R$349/mês
- Avg lifetime: 24-36 meses (3-5 anos comum em B2B)
- LTV = R$349 × 30 = R$10.470

ENTERPRISE (grande diocese, rede escolas):
- Subscription: R$800-2.000/mês
- Avg lifetime: 36-60 meses (lock-in alto)
- LTV = R$1.200 × 48 = R$57.600
```

### Acquisition & Profitability:

```
Custo de Aquisição (CAC):
- Outbound + landing page: ~R$0 (DIY inicial)
- Later (ads + paid marketing): ~R$100-300 por org
- Sales effort: ~5h por org x R$50/h = R$250 internamente

ROI:
- Se CAC = R$250 e LTV = R$10.470
- Payback period = 250 / 349 = 0.7 meses
- ROI = 4.184%

Profitabilidade ao atingir 60 orgs:
- Receita: R$23.940/mês (avg R$399/org)
- Custos fixos: R$200/mês
- Margem: 99.1%
```

---

## 🔐 Por que B2B > B2C para LouveSync?

```
B2B Vantagens:
✅ Pricing 5-10x maior (R$350 vs R$50)
✅ Churn muito menor (org commitment > individual)
✅ Network effect (quem canta convida mais)
✅ Lock-in automático (dados compartilhados)
✅ Upsell natural (colaboração premium, integrações)
✅ Defensibilidade (real-time collab = moat)
✅ Escalabilidade sem suporte (orgs são autogeridas)

B2C Desvantagens:
❌ Preço baixo (R$30-100/mês max)
❌ Churn alto (5-20%/mês é normal)
❌ Marketing custoso (CPA R$30-100)
❌ Commoditizado (muita concorrência)
```

