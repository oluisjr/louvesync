# LouveSync — Roadmap de Evolução do Produto
### Revisado com feedbacks em 26/05/2026

---

## ✅ Confirmação: Setlist Automático JÁ implementado e corrigido

> [!NOTE]
> O algoritmo em `src/lib/setlist.js` implementa corretamente a ordem litúrgica:
>
> **Domingo:** `Júbilo → Hinário → Hinário → Adoração → Oferta → [Pedidos/Avisos]`
> - **1º Domingo do mês:** `Corinho` adicionado no início
> - **2º Domingo do mês:** `Ceia` adicionada no final (Santa Ceia)
>
> **Quinta-feira:** `Júbilo → Hinário → Adoração → Oferta → [Pedidos/Avisos]`
>
> Evita repetição dos últimos 3 eventos. Respeita disponibilidade de vocais por dia (Kassya e Lídia somente aos domingos). A seleção de cantor agora prioriza o vocal cuja `vocal_category` bate com a categoria da música.

> [!IMPORTANT]
> **Bug corrigido (commit 7a47662):** `s.category` → `s.cat` — o setlist agora funciona com músicas do banco real.

---

## 📊 Visão Geral por Prioridade

| Fase | Foco | Impacto | Esforço |
|------|------|---------|---------|
| **1 — Quick Wins** | Ferramentas de uso diário no palco | 🔴 Crítico | 🟢 Baixo |
| **2 — Engajamento** | Comunicação e cultura da equipe | 🟠 Alto | 🟡 Médio |
| **3 — Gestão** | Dados e controle administrativo | 🟡 Médio | 🟠 Alto |
| **4 — Inovação** | Diferenciais competitivos únicos | 🟢 Estratégico | 🔴 Alto |

---

## Fase 1 — Quick Wins

### 🎵 1.1 — Player de Referência Integrado na Cifra

**Solução:** Mini-player recolhível usando o `ytUrl` já salvo na música — extrai `videoId` da URL e monta `youtube.com/embed/[id]`. Sem API adicional.

> [!NOTE]
> YouTube Data API v3 apenas nas abas **Devocional e Treinamento** para conteúdo dinâmico de estudo.

**Arquivos afetados:** `src/App.jsx` — componente `Cifra`

---

### 🎸 1.2 — Afinador Cromático via Microfone

**Solução:** Seção "Afinador" na aba Treinamento. `getUserMedia()` + Web Audio API (FFT) para detectar frequência + nota com indicador de desvio em cents. 100% client-side.

**Arquivos afetados:** `src/App.jsx` — componente `Treinamento`

---

### 📄 1.3 — Exportar Cifra em PDF

**Solução:** Botão "Imprimir" usando `window.print()` com `@media print` CSS. Zero dependência externa.

**Arquivos afetados:** `src/App.jsx`, `src/index.css`

---

### 📲 1.4 — QR Code de Convite

**Solução:** Admin gera QR via `api.qrserver.com` com a URL do app. Imprimível para colar no estúdio.

**Arquivos afetados:** `src/App.jsx` — PainelAdmin/Membros

---

### 🦶 1.5 — Suporte a Pedal Bluetooth

**Solução:** `useEffect` de `keydown` (PageDown/PageUp/seta/espaço) na tela de Cifra. Pedais Bluetooth emulam teclado.

**Arquivos afetados:** `src/App.jsx` — componente `Cifra`

---

## Fase 2 — Engajamento

### 📢 2.1 — Mural de Comunicados (Feed Interno)

**Solução:** Aba "Mural" com feed de posts do admin. Membros podem:
- 💬 **Comentar** em posts
- 👍 **Reagir** com emojis (👍 🙏 🎵 🔥)
- 🔖 **Salvar** posts para referência

Realtime via Supabase.

**Arquivos afetados:** `src/App.jsx`, `src/lib/supabase.js`
**Supabase:** tabelas `announcements`, `announcement_comments`, `announcement_reactions`, `announcement_saves`

---

### 🔔 2.2 — Push Notifications Nativas (Web Push)

**Solução:** SW dedicado (`sw-push.js`), endpoint `api/push.js` com `web-push`, botão "Ativar Notificações" no perfil.
**Triggers:** novo evento, 72h antes sem confirmação, novo post no Mural.

> [!IMPORTANT]
> Gerar VAPID keys: `npx web-push generate-vapid-keys` → adicionar no Vercel como `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`. **Gratuito — sem custo adicional.**

---

### 🎯 2.3 — Música da Semana / Foco de Estudo

**Solução:** Admin seleciona uma música como foco com observação. Badge "📌 Estudar" na Home de todos. Push ao publicar.

---

### 📅 2.4 — Lembretes Automáticos de Confirmação

**Solução:** Supabase Edge Function (pg_cron) toda terça às 18h. **Depende de 2.2.**

---

### ⭐ 2.5 — Coleções / Playlists Temáticas

**Solução:** Coleções com nome, emoji e cor (🕊️ Santa Ceia, 🎄 Natal...). Atalho "Adicionar da Coleção" na criação de evento.

**Supabase:** tabelas `collections` e `song_collections`

---

## Fase 3 — Gestão e Dados

### 📊 3.1 — Dashboard Admin com Gráficos

Presença por evento, ranking de ministração, taxa de confirmação. SVG manual ou `recharts`.

---

### 📋 3.2 — Histórico de Escalas e Frequência

Tab "Histórico" na Escala + filtro por membro + exportar CSV.

---

### 🔗 3.3 — Setlist Público Compartilhável (sem login)

Endpoint `api/setlist.js` → link sem login para telão. Útil para operador de datashow.

---

### 🎹 3.4 — Tom Individual por Vocal em Cada Música

Cada vocal escalado tem seu próprio tom por música (Vocal 1 = Sol, Vocal 2 = Mi...).
A estrutura `vocal_keys` já existe no banco. Falta a UI no `EvSheet` para gerenciar por vocal.

---

### 🏛️ 3.5 — Controle de Patrimônio / Equipamentos

Seção no PainelAdmin com custódia de equipamentos e histórico de responsáveis.

> [!NOTE]
> O **Operador de Datashow** é um cargo da equipe criado aqui. Permissão de acesso à Escala e ao Setlist Público (3.3). Não exibe letras no app (há outro sistema).
>
> **Corrigido (commit 7a47662):** campo `role` agora tem default `'Membro'` — perfis novos não violam mais o NOT NULL do banco.

**Supabase:** tabela `equipment`

---

## Fase 4 — Inovação

### 🤖 4.1 — Setlist Algorítmico na UI

Botão "✨ Sugerir Setlist" no CreateEvent que chama `generateSetlist()` e pré-popula os campos. Lógica já existe e foi corrigida.

---

### 🎙️ 4.2 — Modo Ensaio Colaborativo com Gravação

> [!IMPORTANT]
> **Regra:** O ensaio usa **exatamente as músicas do culto de domingo 18h** da mesma semana. Vínculo automático entre eventos.

Sessão Realtime compartilhada com: timer por música, anotações sincronizadas, estilo musical (Reggae/Blues/Jazz/Worship/Clássico/Pop), gravação de áudio via `MediaRecorder API` salvo no Supabase Storage.

**Supabase:** tabelas `rehearsal_sessions`, `rehearsal_notes`; bucket `rehearsal-audio`

---

### 📱 4.3 — Onboarding PWA + Controle de Versão

**A) Onboarding:** Bottom sheet pós-login. `deferredPrompt.prompt()`. Não repete por 14 dias.

**B) Anti-cache:** `api/version.js` retorna versão atual. App compara com `ls_app_version`. Se diferente: toast "✨ Nova versão" + botão `location.reload(true)`.

---

### 🌐 4.4 — Modo Offline Total (IndexedDB + Sync Queue)

SW de dados separado. Baixa repertório + próximo evento para IndexedDB. Sincroniza mutações pendentes ao reconectar.

---

## 🏢 Arquitetura Multi-Tenant — IMWAL e Futuro SaaS

### Modelo organizacional

```
Organização (Igreja compradora)
└── IMWAL — Igreja Metodista Wesleyana
    ├── Unidade Água Limpa      ← seus dados atuais
    ├── Unidade Centro          ← dados isolados
    └── Unidade Nova Esperança  ← dados isolados
```

Cada unidade tem seu próprio: repertório, membros, eventos, escalas e patrimônio. Mas a organização-mãe pode ter uma visão consolidada de todas as unidades.

### Schema necessário

```sql
-- Organizações (igrejas compradoras)
organizations (id, name, slug, plan, owner_email, created_at)

-- Unidades / Sedes
units (id, org_id, name, city, created_at)

-- Todas as tabelas recebem unit_id
members   (... unit_id uuid REFERENCES units(id))
songs     (... unit_id uuid REFERENCES units(id))
events    (... unit_id uuid REFERENCES units(id))
equipment (... unit_id uuid REFERENCES units(id))
```

### RLS por unidade

```sql
-- Exemplo para members:
CREATE POLICY "unit_isolation" ON members
  USING (unit_id = current_setting('app.unit_id')::uuid);
```

> [!WARNING]
> **Não implementar ainda.** Com o plano gratuito do Supabase (500MB / 50.000 req/mês), a IMWAL Água Limpa usa uma fração mínima. Adicionar multi-tenant agora complicaria o código sem benefício imediato.
>
> **Gatilho para implementar:** Quando surgir a primeira igreja interessada.

---

## 💰 Plano de Escalamento (Free → Pago)

### Tier 0 — Atual (100% gratuito)

| Serviço | Plano | Limite | Uso estimado IMWAL |
|---------|-------|--------|--------------------|
| Supabase | Free | 500MB DB, 1GB storage, 50k req/mês | ~5MB / ~500 req/mês |
| Vercel | Hobby | 100GB bandwidth, 100k invocações/mês | ~1GB / ~500/mês |
| Groq API | Free | 30 req/min, ~14.400/dia | <100/dia |
| Domínio | — | — | A definir |

**Conclusão: a IMWAL pode operar gratuitamente por anos neste tier.**

---

### Tier 1 — Primeiras igrejas clientes (~R$ 200-500/mês de receita)

| Serviço | Upgrade | Custo | Quando |
|---------|---------|-------|--------|
| Supabase | Pro | $25/mês | Ao atingir 3-5 igrejas |
| Vercel | Pro | $20/mês | Ao precisar de funções > 10s |
| Groq | Paid | ~$0.10/1M tokens | Se uso de IA crescer muito |

**Ação:** Manter o contador de uso no Supabase e criar alerta quando atingir 70% dos limites gratuitos.

---

### Tier 2 — Crescimento (10+ igrejas, ~R$ 2.000+/mês)

| Ação | Custo | Benefício |
|------|-------|-----------|
| Supabase Pro | $25/mês | 8GB DB, realtime ilimitado |
| Supabase Storage | $0.021/GB | Áudios de ensaio, fotos de patrimônio |
| Vercel Pro | $20/mês | Edge Functions, analytics |
| Domínio próprio | ~R$ 50/ano | Credibilidade para vendas |

---

### Tier 3 — SaaS maduro (50+ igrejas)

| Ação | Custo | Benefício |
|------|-------|-----------|
| Supabase Team | $599/mês | Multi-org, SSO, SLA 99.9% |
| CDN para áudios | ~$10-50/mês | Supabase Storage CDN |
| Monitoramento | Sentry Free | Rastrear erros em produção |
| Analytics | PostHog Free | Comportamento de usuários |

---

### Regras de ouro para não gerar custos inesperados

> [!CAUTION]
> 1. **Nunca usar `render=true` no ScraperAPI** sem necessidade — custa 25 créditos vs 1 do render=false
> 2. **Cache agressivo no Supabase** para cifras já buscadas (tabela `songs_cache` já existe)
> 3. **Groq só para geração de cifra** — não para análises, resumos ou funcionalidades auxiliares
> 4. **Storage do Supabase** só após migrar para Pro — no Free, 1GB se esgota rapidamente com áudios
> 5. **Monitorar mensalmente** no dashboard do Supabase: uso de storage, req/s e bandwidth

---

## 📅 Cronograma Resumido

```
AGORA (feito — commit 7a47662)
├── ✅ role:'Membro' no perfil novo
└── ✅ s.cat corrigido + vocal_category no setlist

SEMANAS 1-2
├── 1.1 Player YouTube na cifra (ytUrl já existe)
├── 1.3 Exportar PDF (window.print)
├── 1.5 Pedal Bluetooth
└── 1.4 QR Code de convite

SEMANAS 3-4
├── 4.1 Setlist algorítmico na UI (lógica pronta)
├── 3.4 Tom individual por vocal
├── 3.3 Setlist público (sem login) → operador datashow
└── 4.3B Versioning anti-cache

MÊS 2
├── 2.1 Mural (comentários + reações + salvar)
├── 3.2 Histórico de escalas + CSV
├── 3.5 Patrimônio + cargo Datashow
└── 2.3 Música da Semana

MÊS 3-4
├── 2.2 Push Notifications (VAPID)
├── 2.4 Lembretes automáticos
├── 3.1 Dashboard com gráficos
├── 2.5 Coleções temáticas
└── Início do schema multi-tenant (ao surgir 1ª cliente)

MÊS 5-6
├── 4.2 Modo Ensaio com áudio + estilo
├── 1.2 Afinador cromático
├── 4.4 Modo Offline Total
└── 4.3A Onboarding PWA
```
