import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verifica se as credenciais estão presentes
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'SEU_SUPABASE_URL');

// Cria o cliente Supabase se as credenciais existirem, caso contrário exporta nulo
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    'FaturaX: Variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontradas. O app funcionará em Modo de Demonstração Local (Offline) com persistência em LocalStorage.'
  );
}

// Interface para as entidades da aplicação
export interface Profile {
  id: string;
  email: string;
}

export interface CreditCard {
  id: string;
  user_id: string;
  name: string;
  limit: number;
  due_day: number;
  closing_day: number;
  color: string; // Ex: gradiente ou hex color para estilizar o card
}

export interface Friend {
  id: string;
  user_id: string;
  name: string;
}

export interface Purchase {
  id: string;
  user_id: string;
  card_id: string;
  description: string;
  total_amount: number;
  installments_count: number;
  purchase_date: string;
  category: string;
  friend_ids?: string[]; // IDs de amigos vinculados a esta compra
  is_recurrent?: boolean;
}

export interface Installment {
  id: string;
  purchase_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
}

export interface InstallmentFriend {
  id: string;
  installment_id: string;
  friend_id: string;
  amount: number;
  status: 'pending' | 'paid';
}
