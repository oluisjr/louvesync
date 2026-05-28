-- ── LouveSync — Script de Banco de Dados Alinhado ao Frontend (TEXT IDs) ──
-- IMPORTANTE: Apague as tabelas antigas no seu Supabase e execute este script atualizado.

-- 1. Tabela: members (Membros da equipe)
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, -- Suporte a ID gerado automática ou manualmente
    name TEXT NOT NULL,
    role TEXT,
    instrument TEXT,
    avatar TEXT,
    color TEXT,
    status TEXT DEFAULT 'ativo',
    is_admin BOOLEAN DEFAULT false,
    pin TEXT NOT NULL,
    vocal_category TEXT
);

-- 2. Tabela: songs (Repertório de Músicas)
CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, -- CRÍTICO: Gera o ID caso o frontend envie vazio (novas músicas locais)
    title TEXT NOT NULL,
    artist TEXT,
    cat TEXT,
    key TEXT,
    bpm INTEGER,
    time_signature TEXT,
    tags TEXT[],
    ytUrl TEXT,
    media_url TEXT,
    lyrics TEXT,
    vocal_keys JSONB DEFAULT '{}'::jsonb,
    created_by TEXT,
    delete_requested_by TEXT,
    featured_week BOOLEAN DEFAULT false,
    featured_note TEXT
);

-- 3. Tabela: events (Eventos e Cultos)
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, -- Gera ID padrão se omitido
    date TEXT NOT NULL,
    time TEXT,
    type TEXT,
    label TEXT,
    theme TEXT,
    santa_ceia_song TEXT,
    delete_requested_by TEXT
);

-- 4. Tabela: event_songs (Músicas vinculadas a eventos/cultos)
CREATE TABLE IF NOT EXISTS event_songs (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    song_id TEXT REFERENCES songs(id) ON DELETE SET NULL,
    item_type TEXT DEFAULT 'song',
    note_text TEXT,
    order_index INTEGER,
    singer_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
    sequence TEXT
);

-- 5. Tabela: event_members (Presença de membros em eventos)
CREATE TABLE IF NOT EXISTS event_members (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    confirmed BOOLEAN
);

-- 6. Tabela: announcements (Posts no Mural)
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, -- Suporte a ID gerado automática ou manualmente
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT REFERENCES members(id) ON DELETE SET NULL -- Nome da coluna alinhado ao frontend
);

-- 7. Tabela: announcement_comments (Comentários no Mural)
CREATE TABLE IF NOT EXISTS announcement_comments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, -- Suporte a ID gerado automática ou manualmente
    post_id TEXT REFERENCES announcements(id) ON DELETE CASCADE,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    member_name TEXT,
    text TEXT NOT NULL, -- Nome da coluna alinhado ao frontend ('text')
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabela: announcement_reactions (Reações nos Posts)
CREATE TABLE IF NOT EXISTS announcement_reactions (
    id BIGSERIAL PRIMARY KEY,
    post_id TEXT REFERENCES announcements(id) ON DELETE CASCADE,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    UNIQUE(post_id, member_id, emoji)
);

-- 9. Tabela: announcement_saves (Posts Salvos por Membros)
CREATE TABLE IF NOT EXISTS announcement_saves (
    id BIGSERIAL PRIMARY KEY,
    post_id TEXT REFERENCES announcements(id) ON DELETE CASCADE,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE(post_id, member_id)
);

-- 10. Tabela: rehearsal_sessions (Sessão Ativa do Modo Ensaio)
CREATE TABLE IF NOT EXISTS rehearsal_sessions (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    active_song_id TEXT,
    style_mode TEXT DEFAULT 'Padrão',
    timer_active BOOLEAN DEFAULT false,
    timer_seconds INTEGER DEFAULT 0
);

-- 11. Tabela: rehearsal_notes (Anotações por música do ensaio)
CREATE TABLE IF NOT EXISTS rehearsal_notes (
    song_id TEXT PRIMARY KEY,
    note_text TEXT,
    updated_by TEXT REFERENCES members(id) ON DELETE SET NULL
);

-- 12. Tabela: equipment (Patrimônio/Instrumentos)
CREATE TABLE IF NOT EXISTS equipment (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    brand TEXT,
    status TEXT,
    custodian_id TEXT REFERENCES members(id) ON DELETE SET NULL,
    serial_number TEXT
);

-- ─────────────────────────────────────────────────────────────
-- 🔓 DESABILITAR RLS (Row Level Security) para simplificar acesso público
-- ─────────────────────────────────────────────────────────────
ALTER TABLE members DISABLE ROW LEVEL SECURITY;
ALTER TABLE songs DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE event_songs DISABLE ROW LEVEL SECURITY;
ALTER TABLE event_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_saves DISABLE ROW LEVEL SECURITY;
ALTER TABLE rehearsal_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE rehearsal_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE equipment DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- ⚡ HABILITAR REPLICAÇÃO EM TEMPO REAL (Supabase Realtime)
-- ─────────────────────────────────────────────────────────────
-- Cria publicação padrão se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- Adiciona as tabelas na publicação do realtime para sincronização instantânea
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE announcement_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE announcement_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE rehearsal_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE rehearsal_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE event_songs;
ALTER PUBLICATION supabase_realtime ADD TABLE event_members;
ALTER PUBLICATION supabase_realtime ADD TABLE songs;

-- ─────────────────────────────────────────────────────────────
-- 👥 POPULAR MEMBROS INICIAIS DA IMWAL (Permite login via PIN)
-- ─────────────────────────────────────────────────────────────
INSERT INTO members (id, name, role, instrument, avatar, color, status, is_admin, pin, vocal_category) VALUES
('aaaa0001-0001-0001-0001-000000000001', 'Junior', 'Líder de Louvor', 'Teclado / Vocal', 'JR', '#4F46E5', 'ativo', true, 'JR01', null),
('aaaa0002-0002-0002-0002-000000000002', 'Ignacio', 'Músico', 'Baixo', 'IG', '#10B981', 'ativo', false, 'IG02', null),
('aaaa0003-0003-0003-0003-000000000003', 'Cleide', 'Vocal', 'Vocal 1', 'CL', '#EC4899', 'ativo', false, 'CL03', 'adoracao'),
('aaaa0004-0004-0004-0004-000000000004', 'Sonia', 'Vocal', 'Vocal 2', 'SO', '#F59E0B', 'ativo', false, 'SO04', 'jubilo'),
('aaaa0005-0005-0005-0005-000000000005', 'Kassya', 'Vocal', 'Vocal 4', 'KA', '#8B5CF6', 'ativo', false, 'KA05', 'adoracao'),
('aaaa0006-0006-0006-0006-000000000006', 'Maria Helena', 'Vocal', 'Back Vocal', 'MH', '#06B6D4', 'ativo', false, 'MH06', 'hinario'),
('aaaa0007-0007-0007-0007-000000000007', 'Lidia', 'Vocal', 'Vocal 5', 'LI', '#EF4444', 'ativo', false, 'LI07', 'hinario'),
('aaaa0008-0008-0008-0008-000000000008', 'Josi', 'Vocal', 'Vocal 3', 'JO', '#14B8A6', 'ativo', false, 'JO08', 'jubilo'),
('aaaa0009-0009-0009-0009-000000000009', 'Aragão', 'Músico', 'Violão', 'AR', '#F97316', 'ativo', false, 'AR09', null),
('aaaa0010-0010-0010-0010-000000000010', 'Samuel', 'Músico', 'Bateria', 'SA', '#84CC16', 'ativo', false, 'SA10', null),
('aaaa0011-0011-0011-0011-000000000011', 'Darci', 'Músico', 'Violão', 'DA', '#A855F7', 'ativo', false, 'DA11', null)
ON CONFLICT (id) DO NOTHING;
