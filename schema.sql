-- =====================================================================
-- FATURAX - SCHEMA DO BANCO DE DADOS SUPABASE
-- Execute este script no editor SQL do seu projeto no Supabase
-- =====================================================================

-- 1. Habilitar UUID-OSSP se não estiver habilitado
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Cartões (cards)
CREATE TABLE IF NOT EXISTS public.cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL DEFAULT auth.uid(),
    name TEXT NOT NULL,
    "limit" NUMERIC(12, 2) NOT NULL,
    due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
    closing_day INTEGER NOT NULL CHECK (closing_day >= 1 AND closing_day <= 31),
    color TEXT NOT NULL DEFAULT 'from-indigo-600 to-purple-600',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Amigos/Pessoas (friends)
CREATE TABLE IF NOT EXISTS public.friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL DEFAULT auth.uid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela de Compras (purchases)
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL DEFAULT auth.uid(),
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    installments_count INTEGER NOT NULL DEFAULT 1 CHECK (installments_count >= 1),
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabela de Parcelas (installments)
CREATE TABLE IF NOT EXISTS public.installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
    amount NUMERIC(12, 2) NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Tabela de Divisão de Parcelas com Amigos (installment_friends)
CREATE TABLE IF NOT EXISTS public.installment_friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    installment_id UUID NOT NULL REFERENCES public.installments(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.friends(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================================
-- CONFIGURAÇÕES DE ROW LEVEL SECURITY (RLS)
-- =====================================================================

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
-- Como installments e installment_friends estão vinculados a purchases e friends (que pertencem ao user),
-- controlamos o acesso via subqueries para garantir que apenas o dono do registro consiga acessá-los.
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_friends ENABLE ROW LEVEL SECURITY;

-- Políticas para CARDS
CREATE POLICY "Usuários podem gerenciar seus próprios cartões" ON public.cards
    FOR ALL USING (auth.uid() = user_id);

-- Políticas para FRIENDS
CREATE POLICY "Usuários podem gerenciar seus próprios amigos" ON public.friends
    FOR ALL USING (auth.uid() = user_id);

-- Políticas para PURCHASES
CREATE POLICY "Usuários podem gerenciar suas próprias compras" ON public.purchases
    FOR ALL USING (auth.uid() = user_id);

-- Políticas para INSTALLMENTS
CREATE POLICY "Usuários podem gerenciar parcelas de suas compras" ON public.installments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.purchases
            WHERE public.purchases.id = public.installments.purchase_id
            AND public.purchases.user_id = auth.uid()
        )
    );

-- Políticas para INSTALLMENT_FRIENDS
CREATE POLICY "Usuários podem gerenciar rateio das parcelas de suas compras" ON public.installment_friends
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.installments
            JOIN public.purchases ON public.purchases.id = public.installments.purchase_id
            WHERE public.installments.id = public.installment_friends.installment_id
            AND public.purchases.user_id = auth.uid()
        )
    );
