import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard as CardIcon,
  Users,
  PlusCircle,
  FileText,
  Home,
  LogOut,
  Plus,
  Trash2,
  Check,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  ArrowLeft,
  Edit
} from 'lucide-react';
import { supabase, isSupabaseConfigured, CreditCard, Friend, Purchase, Installment, InstallmentFriend } from './lib/supabase';

// Mock Data inicial para o Modo offline/demonstração
const INITIAL_CARDS: CreditCard[] = [
  { id: 'c1', user_id: 'guest', name: 'Nubank Violeta', limit: 5000, due_day: 10, closing_day: 3, color: 'from-purple-600 to-indigo-700' },
  { id: 'c2', user_id: 'guest', name: 'XP Infinite', limit: 12000, due_day: 25, closing_day: 15, color: 'from-zinc-800 via-zinc-900 to-black' }
];

const INITIAL_FRIENDS: Friend[] = [
  { id: 'f1', user_id: 'guest', name: 'Carlos' },
  { id: 'f2', user_id: 'guest', name: 'Mariana' },
  { id: 'f3', user_id: 'guest', name: 'Beatriz' }
];

const INITIAL_PURCHASES: Purchase[] = [
  { id: 'p1', user_id: 'guest', card_id: 'c1', description: 'Notebook de Trabalho', total_amount: 3600, installments_count: 12, purchase_date: '2026-05-10', category: 'Tecnologia', friend_ids: ['f1', 'f3'] },
  { id: 'p2', user_id: 'guest', card_id: 'c2', description: 'Jantar Compartilhado', total_amount: 300, installments_count: 1, purchase_date: '2026-06-08', category: 'Alimentação', friend_ids: ['f1', 'f2'] }
];

// Gera as parcelas correspondentes às compras iniciais
const generateInitialInstallments = (): Installment[] => {
  const installments: Installment[] = [];

  // Notebook (c1) - R$ 3600 em 12x de R$ 300. Compra em 10/05/2026. Parcelas vencem em Junho/2026 até Maio/2027
  // Primeira parcela vence em 10/06/2026 (Devido ao dia de vencimento ser 10)
  for (let i = 1; i <= 12; i++) {
    const dueMonth = 5 + i; // Começa em Junho (mês 6)
    const year = dueMonth > 12 ? 2027 : 2026;
    const monthStr = String(dueMonth > 12 ? dueMonth - 12 : dueMonth).padStart(2, '0');
    installments.push({
      id: `inst-p1-${i}`,
      purchase_id: 'p1',
      installment_number: i,
      amount: 300,
      due_date: `${year}-${monthStr}-10`,
      status: i === 1 ? 'paid' : 'pending' // primeira já paga como teste
    });
  }

  // Jantar (c2) - R$ 300 em 1x. Compra em 08/06/2026. Vence em 25/06/2026
  installments.push({
    id: `inst-p2-1`,
    purchase_id: 'p2',
    installment_number: 1,
    amount: 300,
    due_date: '2026-06-25',
    status: 'pending'
  });

  return installments;
};

// Gera as divisões entre os amigos
const generateInitialInstallmentFriends = (): InstallmentFriend[] => {
  const instFriends: InstallmentFriend[] = [];

  // Notebook (p1): Carlos (f1) e Beatriz (f3) pagam R$ 100 cada. Você (guest) paga R$ 100.
  // Geramos divisões para as 12 parcelas
  for (let i = 1; i <= 12; i++) {
    instFriends.push({
      id: `if-p1-f1-${i}`,
      installment_id: `inst-p1-${i}`,
      friend_id: 'f1',
      amount: 100,
      status: i === 1 ? 'paid' : 'pending'
    });
    instFriends.push({
      id: `if-p1-f3-${i}`,
      installment_id: `inst-p1-${i}`,
      friend_id: 'f3',
      amount: 100,
      status: i === 1 ? 'paid' : 'pending'
    });
  }

  // Jantar (p2): R$ 300 dividido igualmente entre Você, Carlos (f1) e Mariana (f2). Cada um paga R$ 100.
  instFriends.push({
    id: `if-p2-f1-1`,
    installment_id: `inst-p2-1`,
    friend_id: 'f1',
    amount: 100,
    status: 'pending'
  });
  instFriends.push({
    id: `if-p2-f2-1`,
    installment_id: `inst-p2-1`,
    friend_id: 'f2',
    amount: 100,
    status: 'pending'
  });

  return instFriends;
};

// Helpers para compras recorrentes
const isPurchaseRecurrent = (purchase: Purchase): boolean => {
  return (purchase as any).is_recurrent === true || !!(purchase.description && purchase.description.includes('[Recorrente]'));
};

const cleanPurchaseDescription = (desc: string): string => {
  if (!desc) return '';
  return desc.replace(' [Recorrente]', '');
};

export default function App() {
  // Estado de Autenticação
  const [session, setSession] = useState<{ user: { id: string; email: string } } | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Estados dos Dados da Aplicação
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentFriends, setInstallmentFriends] = useState<InstallmentFriend[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Navegação
  const [activeTab, setActiveTab] = useState<'home' | 'cards' | 'friends' | 'purchases' | 'reports'>('home');

  // Reseta seleção de cartão ao mudar de aba
  useEffect(() => {
    if (activeTab !== 'cards') {
      setSelectedCardId(null);
    }
  }, [activeTab]);

  // Controle de Mês/Ano selecionado no Relatório
  const [selectedMonth, setSelectedMonth] = useState<number>(6); // Junho
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedReportCardId, setSelectedReportCardId] = useState<string>('all');

  // Estados dos Formulários
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardLimit, setCardLimit] = useState('');
  const [cardDueDay, setCardDueDay] = useState('10');
  const [cardClosingDay, setCardClosingDay] = useState('3');
  const [cardColor, setCardColor] = useState('from-indigo-600 to-purple-600');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);

  const [showAddFriendForm, setShowAddFriendForm] = useState(false);
  const [friendName, setFriendName] = useState('');

  const [purchaseDesc, setPurchaseDesc] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseInstallments, setPurchaseInstallments] = useState('1');
  const [purchaseCard, setPurchaseCard] = useState('');
  const [purchaseCategory, setPurchaseCategory] = useState('Geral');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFriendsForDivision, setSelectedFriendsForDivision] = useState<string[]>([]);
  const [purchaseIsRecurrent, setPurchaseIsRecurrent] = useState(false);

  // Alertas
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cores de cartões pré-definidas para o design premium
  const CARD_COLORS = [
    { label: 'Indigo Violeta', value: 'from-indigo-600 to-purple-600' },
    { label: 'Esmeralda Teal', value: 'from-emerald-600 to-teal-700' },
    { label: 'Rose Gold', value: 'from-rose-500 via-pink-600 to-purple-600' },
    { label: 'Carbon Dark', value: 'from-zinc-800 via-zinc-900 to-black' },
    { label: 'Ocean Blue', value: 'from-blue-600 to-cyan-500' },
    { label: 'Amber Orange', value: 'from-amber-500 to-orange-600' }
  ];

  const CATEGORIES = ['Alimentação', 'Lazer', 'Tecnologia', 'Serviços', 'Supermercado', 'Transporte', 'Geral'];

  // Notificação temporária
  const triggerNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Monitora alterações de sessão do Supabase (se configurado)
  useEffect(() => {
    if (supabase) {
      // Pega sessão inicial
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSession({ user: { id: session.user.id, email: session.user.email || '' } });
          setIsGuest(false);
        }
        setSessionLoaded(true);
      }).catch(() => {
        setSessionLoaded(true);
      });

      // Escuta mudanças
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setSession({ user: { id: session.user.id, email: session.user.email || '' } });
          setIsGuest(false);
        } else {
          setSession(null);
        }
        setSessionLoaded(true);
      });

      return () => subscription.unsubscribe();
    } else {
      setSessionLoaded(true);
    }
  }, []);

  // Carrega os dados quando autenticado ou no modo guest
  useEffect(() => {
    if (session || isGuest) {
      loadAllData();
    }
  }, [session, isGuest]);

  // Sincroniza dados locais (gerados como guest) com o Supabase após login
  const syncLocalDataWithSupabase = async (loggedInUserId: string) => {
    try {
      // Regra 1: Desativa a sincronização automática de dados locais do guest para o Supabase
      // Limpa os dados do guest locais para iniciar o banco online limpo do zero
      localStorage.removeItem(`fx_cards_guest`);
      localStorage.removeItem(`fx_friends_guest`);
      localStorage.removeItem(`fx_purchases_guest`);
      localStorage.removeItem(`fx_installments_guest`);
      localStorage.removeItem(`fx_inst_friends_guest`);
      console.log('Dados locais do guest limpos. Inicializando banco online do zero para o usuário:', loggedInUserId);
    } catch (err: any) {
      console.warn('Erro ao limpar dados locais do guest:', err.message);
    }
  };

  // Função para carregar todos os dados (Supabase ou LocalStorage)
  const loadAllData = async () => {
    setLoadingData(true);
    const userId = session?.user.id || 'guest';

    if (isGuest || !supabase) {
      // Modo LocalStorage
      const localCards = localStorage.getItem(`fx_cards_${userId}`);
      const localFriends = localStorage.getItem(`fx_friends_${userId}`);
      const localPurchases = localStorage.getItem(`fx_purchases_${userId}`);
      const localInstallments = localStorage.getItem(`fx_installments_${userId}`);
      const localInstFriends = localStorage.getItem(`fx_inst_friends_${userId}`);

      if (localCards && localFriends) {
        setCards(JSON.parse(localCards));
        setFriends(JSON.parse(localFriends));
        setPurchases(JSON.parse(localPurchases || '[]'));
        setInstallments(JSON.parse(localInstallments || '[]'));
        setInstallmentFriends(JSON.parse(localInstFriends || '[]'));
      } else {
        // Popula com dados mockados na primeira execução
        localStorage.setItem(`fx_cards_${userId}`, JSON.stringify(INITIAL_CARDS));
        localStorage.setItem(`fx_friends_${userId}`, JSON.stringify(INITIAL_FRIENDS));
        localStorage.setItem(`fx_purchases_${userId}`, JSON.stringify(INITIAL_PURCHASES));

        const insts = generateInitialInstallments();
        const instFrs = generateInitialInstallmentFriends();
        localStorage.setItem(`fx_installments_${userId}`, JSON.stringify(insts));
        localStorage.setItem(`fx_inst_friends_${userId}`, JSON.stringify(instFrs));

        setCards(INITIAL_CARDS);
        setFriends(INITIAL_FRIENDS);
        setPurchases(INITIAL_PURCHASES);
        setInstallments(insts);
        setInstallmentFriends(instFrs);
      }
      setLoadingData(false);
    } else {
      // Modo Supabase
      try {
        // Limpa apenas dados locais do guest se existirem
        await syncLocalDataWithSupabase(userId);

        // Carrega Cartões selecionando as colunas explicitamente, com "limit" entre aspas duplas por ser palavra reservada
        const { data: cardsData, error: cardsErr } = await supabase
          .from('cards')
          .select('id, user_id, name, "limit", due_day, closing_day, color')
          .order('name');

        if (cardsErr) {
          console.warn('Erro ao carregar cartões (banco pode estar vazio):', cardsErr.message);
          setCards([]);
        } else {
          const mappedCards = cardsData || [];
          setCards(mappedCards);
          if (mappedCards.length > 0) {
            setPurchaseCard(mappedCards[0].id);
          }
        }

        // Carrega Amigos
        const { data: friendsData, error: friendsErr } = await supabase
          .from('friends')
          .select('*')
          .order('name');

        if (friendsErr) {
          console.warn('Erro ao carregar amigos:', friendsErr.message);
          setFriends([]);
        } else {
          setFriends(friendsData || []);
        }

        // Carrega Compras
        const { data: purchasesData, error: purchasesErr } = await supabase
          .from('purchases')
          .select('*')
          .order('purchase_date', { ascending: false });

        let installmentsData: Installment[] = [];
        let instFriendsData: InstallmentFriend[] = [];

        if (purchasesErr) {
          console.warn('Erro ao carregar compras:', purchasesErr.message);
          setPurchases([]);
        } else {
          setPurchases(purchasesData || []);

          if (purchasesData && purchasesData.length > 0) {
            const purchaseIds = purchasesData.map(p => p.id);

            const { data: instData, error: instErr } = await supabase
              .from('installments')
              .select('*')
              .in('purchase_id', purchaseIds)
              .order('due_date');

            if (instErr) {
              console.warn('Erro ao carregar parcelas:', instErr.message);
            } else {
              installmentsData = instData || [];

              if (installmentsData.length > 0) {
                const installmentIds = installmentsData.map(i => i.id);
                const { data: instFrData, error: instFrErr } = await supabase
                  .from('installment_friends')
                  .select('*')
                  .in('installment_id', installmentIds);
                if (!instFrErr && instFrData) {
                  instFriendsData = instFrData;
                }
              }
            }
          }
        }

        setInstallments(installmentsData);
        setInstallmentFriends(instFriendsData);


      } catch (err: any) {
        console.error('Erro crítico de conexão com o Supabase:', err.message);
        triggerNotification('Erro crítico de conexão com o Supabase. Utilizando modo local.', 'error');
        setIsGuest(true);
      } finally {
        setLoadingData(false);
      }
    }
  };

  // Define cartão padrão no formulário ao carregar cartões de forma segura e dinâmica
  useEffect(() => {
    if (cards.length > 0) {
      const exists = cards.some(c => c.id === purchaseCard);
      if (!exists) {
        setPurchaseCard(cards[0].id);
      }
    } else {
      setPurchaseCard('');
    }
  }, [cards, purchaseCard]);

  // Auxiliar para salvar no LocalStorage (Modo offline)
  const saveOfflineData = (keySuffix: string, data: any) => {
    const userId = session?.user.id || 'guest';
    localStorage.setItem(`fx_${keySuffix}_${userId}`, JSON.stringify(data));
  };

  // LOGIN / CADASTRO COM SUPABASE
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!isSupabaseConfigured) {
      setErrorMessage('O Supabase não está configurado. Use o modo Convidado para testar.');
      return;
    }

    if (!authEmail || !authPassword) {
      setErrorMessage('Preencha todos os campos.');
      return;
    }

    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        const { error } = await supabase!.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        triggerNotification('Login realizado com sucesso!');
      } else {
        const { error } = await supabase!.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setSuccessMessage('Cadastro realizado! Confirme o e-mail se necessário.');
        triggerNotification('Cadastro realizado!');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro na autenticação.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (supabase && !isGuest) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setIsGuest(false);
    setCards([]);
    setFriends([]);
    setPurchases([]);
    setInstallments([]);
    setInstallmentFriends([]);
    setActiveTab('home');
    triggerNotification('Sessão encerrada.');
  };

  // --- MÓDULO DE CARTÕES ---
  const startEditCard = (card: CreditCard) => {
    setEditingCardId(card.id);
    setCardName(card.name);
    setCardLimit(card.limit.toString());
    setCardDueDay(card.due_day.toString());
    setCardClosingDay(card.closing_day.toString());
    setCardColor(card.color);
    setShowAddCardForm(true);
  };

  const clearCardForm = () => {
    setCardName('');
    setCardLimit('');
    setCardDueDay('10');
    setCardClosingDay('3');
    setCardColor('from-indigo-600 to-purple-600');
    setEditingCardId(null);
    setShowAddCardForm(false);
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName || !cardLimit) return;

    const newCardData = {
      name: cardName,
      limit: parseFloat(cardLimit),
      due_day: parseInt(cardDueDay),
      closing_day: parseInt(cardClosingDay),
      color: cardColor,
    };

    if (isGuest || !supabase) {
      // Offline
      if (editingCardId) {
        // Editando
        const updated = cards.map(c => c.id === editingCardId ? { ...c, ...newCardData } : c);
        setCards(updated);
        saveOfflineData('cards', updated);
        triggerNotification('Cartão atualizado localmente!');
      } else {
        // Criando novo
        const newCard: CreditCard = {
          id: 'c-' + Date.now(),
          user_id: 'guest',
          ...newCardData
        };
        const updated = [...cards, newCard];
        setCards(updated);
        saveOfflineData('cards', updated);
        triggerNotification('Cartão cadastrado localmente!');
      }
    } else {
      // Online
      try {
        const { data: { user }, error: userError } = await supabase!.auth.getUser();
        if (userError || !user) {
          triggerNotification('Não foi possível verificar o utilizador. Faça login novamente.', 'error');
          return;
        }

        if (editingCardId) {
          // Editando no Supabase
          const { data, error } = await supabase!
            .from('cards')
            .update({
              name: cardName,
              limit: parseFloat(cardLimit),
              due_day: parseInt(cardDueDay),
              closing_day: parseInt(cardClosingDay),
              color: cardColor,
            })
            .eq('id', editingCardId)
            .select('id, user_id, name, "limit", due_day, closing_day, color');

          if (error) throw error;
          if (data) {
            setCards(cards.map(c => c.id === editingCardId ? data[0] : c));
          }
          triggerNotification('Cartão atualizado com sucesso!');
        } else {
          // Criando no Supabase
          const { data, error } = await supabase!
            .from('cards')
            .insert([{
              name: cardName,
              limit: parseFloat(cardLimit),
              due_day: parseInt(cardDueDay),
              closing_day: parseInt(cardClosingDay),
              color: cardColor,
              user_id: user.id
            }])
            .select('id, user_id, name, "limit", due_day, closing_day, color');
          if (error) throw error;
          if (data) setCards([...cards, data[0]]);
          triggerNotification('Cartão cadastrado com sucesso!');
        }
      } catch (err: any) {
        triggerNotification('Erro ao salvar cartão: ' + err.message, 'error');
      }
    }

    // Limpa form
    clearCardForm();
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm('Deseja realmente deletar este cartão? Todas as compras associadas serão excluídas.')) return;

    if (isGuest || !supabase) {
      // Offline
      const updatedCards = cards.filter(c => c.id !== id);
      const updatedPurchases = purchases.filter(p => p.card_id !== id);
      const purchaseIds = purchases.filter(p => p.card_id === id).map(p => p.id);
      const updatedInstallments = installments.filter(inst => !purchaseIds.includes(inst.purchase_id));
      const installmentIds = installments.filter(inst => purchaseIds.includes(inst.purchase_id)).map(inst => inst.id);
      const updatedInstFriends = installmentFriends.filter(ifriend => !installmentIds.includes(ifriend.installment_id));

      setCards(updatedCards);
      setPurchases(updatedPurchases);
      setInstallments(updatedInstallments);
      setInstallmentFriends(updatedInstFriends);

      saveOfflineData('cards', updatedCards);
      saveOfflineData('purchases', updatedPurchases);
      saveOfflineData('installments', updatedInstallments);
      saveOfflineData('inst_friends', updatedInstFriends);
      triggerNotification('Cartão removido localmente.');
    } else {
      // Online
      try {
        const { error } = await supabase.from('cards').delete().eq('id', id);
        if (error) throw error;
        setCards(cards.filter(c => c.id !== id));
        // Recarrega todos os dados para limpar referências apagadas em cascata
        await loadAllData();
        triggerNotification('Cartão removido.');
      } catch (err: any) {
        triggerNotification('Erro ao remover: ' + err.message, 'error');
      }
    }
  };

  const handlePayCardInvoice = async (cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    const cycle = cardActiveBillCycles[cardId];
    if (!cycle) return;

    if (!confirm(`Deseja realmente marcar como paga a fatura de ${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][cycle.month - 1]}/${cycle.year} deste cartão?`)) {
      return;
    }

    // Identificar compras deste cartão
    const cardPurchases = purchases.filter(p => p.card_id === cardId);
    const cardPurchaseIds = cardPurchases.map(p => p.id);

    // Filtrar parcelas pendentes deste ciclo
    const targetInstallments = installments.filter(inst => {
      if (inst.status !== 'pending' || !cardPurchaseIds.includes(inst.purchase_id)) return false;
      const parts = inst.due_date.split('-');
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        return month === cycle.month && year === cycle.year;
      }
      return false;
    });

    const targetInstallmentIds = targetInstallments.map(i => i.id);

    if (targetInstallmentIds.length === 0) {
      triggerNotification('Nenhuma parcela pendente nesta fatura.', 'error');
      return;
    }

    if (isGuest || !supabase) {
      // Offline LocalStorage
      const updatedInstallments = installments.map(inst => 
        targetInstallmentIds.includes(inst.id) ? { ...inst, status: 'paid' as const } : inst
      );
      const updatedInstFriends = installmentFriends.map(ifriend => 
        targetInstallmentIds.includes(ifriend.installment_id) ? { ...ifriend, status: 'paid' as const } : ifriend
      );

      setInstallments(updatedInstallments);
      setInstallmentFriends(updatedInstFriends);

      saveOfflineData('installments', updatedInstallments);
      saveOfflineData('inst_friends', updatedInstFriends);
      triggerNotification('Fatura marcada como paga localmente!');
    } else {
      // Online Supabase
      try {
        // Atualizar installments
        const { error: instErr } = await supabase
          .from('installments')
          .update({ status: 'paid' })
          .in('id', targetInstallmentIds);

        if (instErr) throw instErr;

        // Atualizar installment_friends
        const { error: instFrErr } = await supabase
          .from('installment_friends')
          .update({ status: 'paid' })
          .in('installment_id', targetInstallmentIds);

        if (instFrErr) throw instFrErr;

        await loadAllData();
        triggerNotification('Fatura marcada como paga com sucesso!');
      } catch (err: any) {
        triggerNotification('Erro ao pagar fatura: ' + err.message, 'error');
      }
    }
  };

  // --- MÓDULO DE AMIGOS ---
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendName) return;

    if (isGuest || !supabase) {
      // Offline
      const newFriend: Friend = {
        id: 'f-' + Date.now(),
        user_id: 'guest',
        name: friendName
      };
      const updated = [...friends, newFriend];
      setFriends(updated);
      saveOfflineData('friends', updated);
      triggerNotification('Amigo adicionado localmente!');
    } else {
      // Online
      try {
        const { data: { user }, error: userError } = await supabase!.auth.getUser();
        if (userError || !user) {
          triggerNotification('Não foi possível verificar o utilizador. Faça login novamente.', 'error');
          return;
        }

        const { data, error } = await supabase!
          .from('friends')
          .insert([{ name: friendName, user_id: user.id }])
          .select();
        if (error) throw error;
        if (data) setFriends([...friends, data[0]]);
        triggerNotification('Amigo adicionado com sucesso!');
      } catch (err: any) {
        triggerNotification('Erro ao salvar amigo: ' + err.message, 'error');
      }
    }

    setFriendName('');
    setShowAddFriendForm(false);
  };

  const handleDeleteFriend = async (id: string) => {
    if (!confirm('Deseja realmente remover este amigo? Os rateios vinculados a ele serão excluídos.')) return;

    if (isGuest || !supabase) {
      const updatedFriends = friends.filter(f => f.id !== id);
      const updatedInstFriends = installmentFriends.filter(ifriend => ifriend.friend_id !== id);

      setFriends(updatedFriends);
      setInstallmentFriends(updatedInstFriends);

      saveOfflineData('friends', updatedFriends);
      saveOfflineData('inst_friends', updatedInstFriends);
      triggerNotification('Amigo removido localmente.');
    } else {
      try {
        const { error } = await supabase.from('friends').delete().eq('id', id);
        if (error) throw error;
        setFriends(friends.filter(f => f.id !== id));
        await loadAllData();
        triggerNotification('Amigo removido.');
      } catch (err: any) {
        triggerNotification('Erro ao remover amigo: ' + err.message, 'error');
      }
    }
  };

  // --- MÓDULO DE COMPRAS / PARCELAS ---
  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseDesc || !purchaseAmount || !purchaseCard) {
      triggerNotification('Preencha os campos obrigatórios', 'error');
      return;
    }

    const amount = parseFloat(purchaseAmount);
    const instCount = purchaseIsRecurrent ? 60 : parseInt(purchaseInstallments);
    const selectedCard = cards.find(c => c.id === purchaseCard);
    if (!selectedCard) return;

    // Gerar as parcelas e datas de vencimento com base no dia do vencimento do cartão
    const generatedInstallmentsList: { installment_number: number; amount: number; due_date: string; status: 'paid' | 'pending' }[] = [];
    const baseDate = new Date(purchaseDate + 'T12:00:00'); // Evita timezone offset

    const purchaseMonth = baseDate.getMonth();
    const purchaseYear = baseDate.getFullYear();
    const purchaseDay = baseDate.getDate();

    for (let i = 1; i <= instCount; i++) {
      // Lógica de fechamento / melhor dia de compra.
      // Se a compra for feita ANTES ou NO dia do fechamento da fatura, ela vence na fatura do mesmo mês (se o dia da compra < dia vencimento), ou no mês seguinte.
      // Simplificando lógica padrão de faturamento de cartão:
      // Se comprar após o fechamento, joga 1 mês pra frente.
      let dueMonthOffset = i - 1;

      if (purchaseDay >= selectedCard.closing_day) {
        // Comprou após o fechamento, joga a primeira parcela para o próximo mês
        dueMonthOffset += 1;
      }

      const instDate = new Date(purchaseYear, purchaseMonth + dueMonthOffset, selectedCard.due_day);
      const formattedDate = instDate.toISOString().split('T')[0];
      const instAmount = parseFloat((amount / instCount).toFixed(2));

      // Ajuste na última parcela para evitar perda de centavos por dízima
      const finalAmount = i === instCount
        ? parseFloat((amount - (instAmount * (instCount - 1))).toFixed(2))
        : instAmount;

      const parts = formattedDate.split('-');
      let status: 'paid' | 'pending' = 'pending';
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (year < 2026 || (year === 2026 && month < 6)) {
          status = 'paid';
        }
      }

      generatedInstallmentsList.push({
        installment_number: i,
        amount: finalAmount,
        due_date: formattedDate,
        status
      });
    }

    if (isGuest || !supabase) {
      // OFFLINE
      const purchaseId = 'p-' + Date.now();
      const newPurchase: Purchase = {
        id: purchaseId,
        user_id: 'guest',
        card_id: purchaseCard,
        description: purchaseIsRecurrent ? purchaseDesc + ' [Recorrente]' : purchaseDesc,
        total_amount: amount,
        installments_count: instCount,
        purchase_date: purchaseDate,
        category: purchaseCategory,
        friend_ids: selectedFriendsForDivision,
        is_recurrent: purchaseIsRecurrent
      };

      const newInsts: Installment[] = generatedInstallmentsList.map((inst, index) => ({
        id: `inst-${purchaseId}-${index + 1}`,
        purchase_id: purchaseId,
        installment_number: inst.installment_number,
        amount: inst.amount,
        due_date: inst.due_date,
        status: inst.status
      }));

      const newInstFriends: InstallmentFriend[] = [];

      if (selectedFriendsForDivision.length > 0) {
        const divisor = selectedFriendsForDivision.length;
        const hasUser = selectedFriendsForDivision.includes('user');
        const realFriendsSelected = selectedFriendsForDivision.filter(id => id !== 'user');

        newInsts.forEach(inst => {
          const splitAmount = parseFloat((inst.amount / divisor).toFixed(2));
          realFriendsSelected.forEach((friendId, fIdx) => {
            let finalFriendAmount = splitAmount;
            
            // Se o dono não está na partilha, o último amigo selecionado absorve a diferença dos centavos
            if (!hasUser && fIdx === realFriendsSelected.length - 1) {
              finalFriendAmount = parseFloat((inst.amount - (splitAmount * (realFriendsSelected.length - 1))).toFixed(2));
            }

            newInstFriends.push({
              id: `if-${inst.id}-${friendId}`,
              installment_id: inst.id,
              friend_id: friendId,
              amount: finalFriendAmount,
              status: inst.status
            });
          });
        });
      }

      const updatedPurchases = [newPurchase, ...purchases];
      const updatedInstallments = [...installments, ...newInsts];
      const updatedInstFriends = [...installmentFriends, ...newInstFriends];

      setPurchases(updatedPurchases);
      setInstallments(updatedInstallments);
      setInstallmentFriends(updatedInstFriends);

      saveOfflineData('purchases', updatedPurchases);
      saveOfflineData('installments', updatedInstallments);
      saveOfflineData('inst_friends', updatedInstFriends);
      triggerNotification('Compra e parcelas cadastradas localmente!');
    } else {
      // ONLINE SUPABASE
      try {
        const { data: { user }, error: userError } = await supabase!.auth.getUser();
        if (userError || !user) {
          triggerNotification('Não foi possível verificar o utilizador. Faça login novamente.', 'error');
          return;
        }

        // 1. Cadastra a Compra com user_id e is_recurrent
        let insertData: any = {
          card_id: purchaseCard,
          description: purchaseIsRecurrent ? purchaseDesc + ' [Recorrente]' : purchaseDesc,
          total_amount: amount,
          installments_count: instCount,
          purchase_date: purchaseDate,
          category: purchaseCategory,
          user_id: user.id,
          is_recurrent: purchaseIsRecurrent
        };

        let { data: pData, error: pError } = await supabase!
          .from('purchases')
          .insert([insertData])
          .select();

        if (pError) {
          // Fallback se a coluna não existir no banco do Supabase ou outro erro relacionado
          const { is_recurrent, ...fallbackData } = insertData;
          const res = await supabase!
            .from('purchases')
            .insert([fallbackData])
            .select();
          if (res.error) throw res.error;
          pData = res.data;
        }

        const purchase = pData![0];

        // 2. Cadastra as parcelas
        const installmentsToInsert = generatedInstallmentsList.map(inst => ({
          purchase_id: purchase.id,
          installment_number: inst.installment_number,
          amount: inst.amount,
          due_date: inst.due_date,
          status: inst.status
        }));

        const { data: iData, error: iError } = await supabase
          .from('installments')
          .insert(installmentsToInsert)
          .select();

        if (iError) throw iError;

        // 3. Cadastra a divisão com amigos (se houver)
        if (selectedFriendsForDivision.length > 0 && iData) {
          const divisor = selectedFriendsForDivision.length;
          const hasUser = selectedFriendsForDivision.includes('user');
          const realFriendsSelected = selectedFriendsForDivision.filter(id => id !== 'user');
          const instFriendsToInsert: any[] = [];

          iData.forEach(inst => {
            const splitAmount = parseFloat((inst.amount / divisor).toFixed(2));
            realFriendsSelected.forEach((friendId, fIdx) => {
              let finalFriendAmount = splitAmount;
              
              if (!hasUser && fIdx === realFriendsSelected.length - 1) {
                finalFriendAmount = parseFloat((inst.amount - (splitAmount * (realFriendsSelected.length - 1))).toFixed(2));
              }

              instFriendsToInsert.push({
                installment_id: inst.id,
                friend_id: friendId,
                amount: finalFriendAmount,
                status: inst.status
              });
            });
          });

          if (instFriendsToInsert.length > 0) {
            const { error: ifError } = await supabase
              .from('installment_friends')
              .insert(instFriendsToInsert);

            if (ifError) throw ifError;
          }
        }

        await loadAllData();
        triggerNotification('Compra e parcelamento salvos no Supabase!');
      } catch (err: any) {
        triggerNotification('Erro ao salvar compra: ' + err.message, 'error');
      }
    }

    // Limpa campos
    setPurchaseDesc('');
    setPurchaseAmount('');
    setPurchaseInstallments('1');
    setSelectedFriendsForDivision([]);
    setPurchaseCategory('Geral');
    setPurchaseIsRecurrent(false);
    setActiveTab('home'); // Redireciona para o início
  };

  const handleDeletePurchase = async (id: string) => {
    if (!confirm('Deseja excluir esta compra e todas as suas parcelas?')) return;

    if (isGuest || !supabase) {
      const updatedPurchases = purchases.filter(p => p.id !== id);
      const updatedInstallments = installments.filter(inst => inst.purchase_id !== id);
      const installmentIds = installments.filter(inst => inst.purchase_id === id).map(inst => inst.id);
      const updatedInstFriends = installmentFriends.filter(ifriend => !installmentIds.includes(ifriend.installment_id));

      setPurchases(updatedPurchases);
      setInstallments(updatedInstallments);
      setInstallmentFriends(updatedInstFriends);

      saveOfflineData('purchases', updatedPurchases);
      saveOfflineData('installments', updatedInstallments);
      saveOfflineData('inst_friends', updatedInstFriends);
      triggerNotification('Compra excluída localmente.');
    } else {
      try {
        const { error } = await supabase.from('purchases').delete().eq('id', id);
        if (error) throw error;
        await loadAllData();
        triggerNotification('Compra excluída.');
      } catch (err: any) {
        triggerNotification('Erro ao excluir: ' + err.message, 'error');
      }
    }
  };

  const handleDeactivateRecurrence = async (purchaseId: string) => {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) return;

    if (!confirm('Deseja realmente desativar esta recorrência? Todas as parcelas futuras além da fatura aberta atual serão excluídas.')) return;

    // Achar o ciclo ativo do cartão desta compra
    const cycle = cardActiveBillCycles[purchase.card_id] || { month: 6, year: 2026 };

    // Filtrar parcelas desta compra que estão estritamente depois da fatura aberta atual
    const targetInstallments = installments.filter(inst => {
      if (inst.purchase_id !== purchaseId) return false;
      const parts = inst.due_date.split('-');
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        return year > cycle.year || (year === cycle.year && month > cycle.month);
      }
      return false;
    });

    const targetInstallmentIds = targetInstallments.map(i => i.id);

    if (isGuest || !supabase) {
      // Offline
      const updatedInstallments = installments.filter(inst => !targetInstallmentIds.includes(inst.id));
      const updatedInstFriends = installmentFriends.filter(ifriend => !targetInstallmentIds.includes(ifriend.installment_id));
      
      setInstallments(updatedInstallments);
      setInstallmentFriends(updatedInstFriends);

      saveOfflineData('installments', updatedInstallments);
      saveOfflineData('inst_friends', updatedInstFriends);
      triggerNotification('Recorrência desativada localmente!');
    } else {
      // Online
      try {
        if (targetInstallmentIds.length > 0) {
          const { error } = await supabase
            .from('installments')
            .delete()
            .in('id', targetInstallmentIds);
          if (error) throw error;
        }

        await loadAllData();
        triggerNotification('Recorrência desativada com sucesso!');
      } catch (err: any) {
        triggerNotification('Erro ao desativar recorrência: ' + err.message, 'error');
      }
    }
  };

  // Alterna o status de pagamento de um amigo em uma parcela específica ("Tá Pago")
  const toggleFriendPaidStatus = async (instFriendId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';

    if (isGuest || !supabase) {
      // Offline
      const updated = installmentFriends.map(item => {
        if (item.id === instFriendId) {
          return { ...item, status: newStatus as 'pending' | 'paid' };
        }
        return item;
      });
      setInstallmentFriends(updated);
      saveOfflineData('inst_friends', updated);
      triggerNotification(newStatus === 'paid' ? 'Marcado como pago!' : 'Pagamento cancelado.');
    } else {
      // Online
      try {
        const { error } = await supabase
          .from('installment_friends')
          .update({ status: newStatus })
          .eq('id', instFriendId);

        if (error) throw error;

        setInstallmentFriends(installmentFriends.map(item =>
          item.id === instFriendId ? { ...item, status: newStatus as 'pending' | 'paid' } : item
        ));

        triggerNotification(newStatus === 'paid' ? 'Marcado como pago!' : 'Pagamento cancelado.');
      } catch (err: any) {
        triggerNotification('Erro ao alterar status: ' + err.message, 'error');
      }
    }
  };

  // Alterna o status da parcela inteira
  const toggleInstallmentStatus = async (installmentId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';

    if (isGuest || !supabase) {
      const updated = installments.map(item => {
        if (item.id === installmentId) {
          return { ...item, status: newStatus as 'pending' | 'paid' };
        }
        return item;
      });
      setInstallments(updated);
      saveOfflineData('installments', updated);
      triggerNotification(newStatus === 'paid' ? 'Parcela marcada como paga!' : 'Parcela marcada como pendente.');
    } else {
      try {
        const { error } = await supabase
          .from('installments')
          .update({ status: newStatus })
          .eq('id', installmentId);

        if (error) throw error;

        setInstallments(installments.map(item =>
          item.id === installmentId ? { ...item, status: newStatus as 'pending' | 'paid' } : item
        ));

        triggerNotification(newStatus === 'paid' ? 'Parcela marcada como paga!' : 'Parcela marcada como pendente.');
      } catch (err: any) {
        triggerNotification('Erro ao alterar parcela: ' + err.message, 'error');
      }
    }
  };

  // --- COMPUTAÇÕES ANALÍTICAS (DASHBOARD & RELATÓRIOS) ---

  // Retorna as compras com seus respectivos cartões
  const purchasesWithDetails = useMemo(() => {
    return purchases.map(p => {
      const card = cards.find(c => c.id === p.card_id);
      const isRecurrent = isPurchaseRecurrent(p);
      const cleanDesc = cleanPurchaseDescription(p.description);
      return {
        ...p,
        description: cleanDesc,
        cardName: card ? card.name : 'Cartão Excluído',
        cardColor: card ? card.color : 'from-gray-600 to-gray-800',
        isRecurrent
      };
    });
  }, [purchases, cards]);

  // Retorna para cada cardId o mês e ano da fatura pendente mais antiga
  const cardActiveBillCycles = useMemo(() => {
    const cycles: { [cardId: string]: { month: number; year: number } } = {};
    
    cards.forEach(card => {
      // Filtra parcelas pendentes de compras deste cartão
      const cardPurchases = purchases.filter(p => p.card_id === card.id);
      const cardPurchaseIds = cardPurchases.map(p => p.id);
      const cardPendingInstallments = installments.filter(inst => 
        inst.status === 'pending' && cardPurchaseIds.includes(inst.purchase_id)
      );
      
      if (cardPendingInstallments.length > 0) {
        // Encontra a com data de vencimento mais antiga
        let oldestInst = cardPendingInstallments[0];
        cardPendingInstallments.forEach(inst => {
          if (new Date(inst.due_date).getTime() < new Date(oldestInst.due_date).getTime()) {
            oldestInst = inst;
          }
        });
        
        const parts = oldestInst.due_date.split('-');
        cycles[card.id] = {
          month: parseInt(parts[1], 10),
          year: parseInt(parts[0], 10)
        };
      } else {
        // Se não houver pendentes, assume o mês e ano de referência padrão (Junho 2026)
        cycles[card.id] = {
          month: 6,
          year: 2026
        };
      }
    });
    
    return cycles;
  }, [cards, purchases, installments]);

  // Resumo de gastos por pessoa para o cartão selecionado no ciclo ativo aberto
  const cardPersonGastos = useMemo(() => {
    if (!selectedCardId) return [];

    const cycle = cardActiveBillCycles[selectedCardId] || { month: 6, year: 2026 };
    const targetMonth = cycle.month;
    const targetYear = cycle.year;

    // Filtra compras deste cartão
    const cardPurchases = purchases.filter(p => p.card_id === selectedCardId);
    const cardPurchaseIds = cardPurchases.map(p => p.id);

    // Parcelas deste cartão no ciclo alvo
    const cardMonthInstallments = installments.filter(inst => {
      if (!cardPurchaseIds.includes(inst.purchase_id)) return false;
      const parts = inst.due_date.split('-');
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        return month === targetMonth && year === targetYear;
      }
      return false;
    });

    const personMap: { [name: string]: number } = {};

    cardMonthInstallments.forEach(inst => {
      const friendsAssigned = installmentFriends.filter(ifriend => ifriend.installment_id === inst.id);

      if (friendsAssigned.length > 0) {
        // Amigos participando do rateio
        friendsAssigned.forEach(fa => {
          const friend = friends.find(f => f.id === fa.friend_id);
          const name = friend ? friend.name : 'Amigo Excluído';
          personMap[name] = (personMap[name] || 0) + fa.amount;
        });

        // E a sua parte (Você)
        const friendsSum = friendsAssigned.reduce((sum, curr) => sum + curr.amount, 0);
        const ownerShare = Math.max(0, inst.amount - friendsSum);
        if (ownerShare > 0) {
          personMap['Você'] = (personMap['Você'] || 0) + ownerShare;
        }
      } else {
        // Apenas Você (proprietário) gastou
        personMap['Você'] = (personMap['Você'] || 0) + inst.amount;
      }
    });

    return Object.entries(personMap).map(([name, amount]) => ({ name, amount }));
  }, [selectedCardId, purchases, installments, installmentFriends, friends, cardActiveBillCycles]);

  // Histórico de parcelas da fatura do mês ativo para o cartão selecionado
  const cardDetailedPurchases = useMemo(() => {
    if (!selectedCardId) return [];

    const cycle = cardActiveBillCycles[selectedCardId] || { month: 6, year: 2026 };
    const targetMonth = cycle.month;
    const targetYear = cycle.year;

    const cardPurchases = purchases.filter(p => p.card_id === selectedCardId);
    const cardPurchaseIds = cardPurchases.map(p => p.id);

    // Parcelas deste cartão no ciclo alvo
    const cardMonthInstallments = installments.filter(inst => {
      if (!cardPurchaseIds.includes(inst.purchase_id)) return false;
      const parts = inst.due_date.split('-');
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        return month === targetMonth && year === targetYear;
      }
      return false;
    });

    return cardMonthInstallments.map(inst => {
      const purchase = purchases.find(p => p.id === inst.purchase_id);
      if (!purchase) return null;

      const friendsAssigned = installmentFriends.filter(ifriend => ifriend.installment_id === inst.id);

      let ownerNames = 'Você';
      if (friendsAssigned.length > 0) {
        const friendNames = friendsAssigned
          .map(fa => friends.find(f => f.id === fa.friend_id)?.name || 'Amigo')
          .join(', ');
        ownerNames = `Dividido com ${friendNames}`;
      }

      const isRecurrent = isPurchaseRecurrent(purchase);
      const cleanDesc = cleanPurchaseDescription(purchase.description);

      return {
        id: inst.id,
        purchaseId: purchase.id,
        description: cleanDesc,
        purchaseDate: purchase.purchase_date,
        installmentNumber: inst.installment_number,
        totalInstallments: purchase.installments_count,
        amount: inst.amount,
        owners: ownerNames,
        category: purchase.category,
        isRecurrent
      };
    }).filter(Boolean);
  }, [selectedCardId, purchases, installments, installmentFriends, friends, cardActiveBillCycles]);

  // Parcelas do mês e ano selecionados
  const selectedMonthInstallments = useMemo(() => {
    return installments.filter(inst => {
      const parts = inst.due_date.split('-');
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const matchesMonth = month === selectedMonth && year === selectedYear;
        if (!matchesMonth) return false;

        if (selectedReportCardId && selectedReportCardId !== 'all') {
          const purchase = purchases.find(p => p.id === inst.purchase_id);
          return purchase?.card_id === selectedReportCardId;
        }
        return true;
      }
      return false;
    });
  }, [installments, selectedMonth, selectedYear, selectedReportCardId, purchases]);

  // Limite estimado do cartão selecionado no mês escolhido
  const estimatedReportCardLimit = useMemo(() => {
    if (!selectedReportCardId || selectedReportCardId === 'all') return null;
    const card = cards.find(c => c.id === selectedReportCardId);
    if (!card) return null;

    const futurePendingTotal = installments
      .filter(inst => {
        if (inst.status !== 'pending') return false;
        const purchase = purchases.find(p => p.id === inst.purchase_id);
        if (purchase?.card_id !== card.id) return false;

        const parts = inst.due_date.split('-');
        if (parts.length >= 2) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          return year > selectedYear || (year === selectedYear && month >= selectedMonth);
        }
        return false;
      })
      .reduce((sum, inst) => sum + inst.amount, 0);

    return Math.max(0, card.limit - futurePendingTotal);
  }, [cards, selectedReportCardId, installments, purchases, selectedMonth, selectedYear]);

  // Detalhes completos das parcelas do mês atual (Incluindo descrição da compra, cartão, etc.)
  const enrichedMonthInstallments = useMemo(() => {
    return selectedMonthInstallments.map(inst => {
      const purchase = purchases.find(p => p.id === inst.purchase_id);
      const card = purchase ? cards.find(c => c.id === purchase.card_id) : null;
      const friendsAssigned = installmentFriends.filter(ifriend => ifriend.installment_id === inst.id);

      // Calcula a fatia do dono (total da parcela menos a soma do que os amigos devem)
      const friendsTotal = friendsAssigned.reduce((acc, curr) => acc + curr.amount, 0);
      const ownerShare = Math.max(0, inst.amount - friendsTotal);

      const isRecurrent = purchase ? isPurchaseRecurrent(purchase) : false;
      const purchaseDesc = purchase ? cleanPurchaseDescription(purchase.description) : 'Compra Excluída';

      return {
        ...inst,
        purchaseDesc,
        category: purchase ? purchase.category : 'Outros',
        totalInstallments: purchase ? purchase.installments_count : 1,
        cardName: card ? card.name : 'Desconhecido',
        cardColor: card ? card.color : 'from-gray-700 to-gray-900',
        cardId: card ? card.id : '',
        friendsAssigned,
        ownerShare,
        friendsTotal,
        isRecurrent
      };
    });
  }, [selectedMonthInstallments, purchases, cards, installmentFriends]);

  // Rateio consolidado de quanto cada pessoa (amigos e Você) representa no mês/cartão selecionado
  const reportsPersonShares = useMemo(() => {
    const shares: { name: string; amount: number; isOwner: boolean }[] = [];

    // Amigos
    friends.forEach(f => {
      const totalFriend = enrichedMonthInstallments.reduce((acc, inst) => {
        const assigned = inst.friendsAssigned.find(fa => fa.friend_id === f.id);
        return acc + (assigned ? assigned.amount : 0);
      }, 0);
      if (totalFriend > 0) {
        shares.push({ name: f.name, amount: totalFriend, isOwner: false });
      }
    });

    // Você
    const totalOwner = enrichedMonthInstallments.reduce((acc, inst) => acc + inst.ownerShare, 0);
    if (totalOwner > 0) {
      shares.push({ name: 'Você', amount: totalOwner, isOwner: true });
    }

    return shares;
  }, [friends, enrichedMonthInstallments]);

  // Total acumulado de gastos na fatura do mês (Soma das parcelas que vencem neste mês)
  const totalFaturasMese = useMemo(() => {
    return enrichedMonthInstallments.reduce((acc, curr) => acc + curr.amount, 0);
  }, [enrichedMonthInstallments]);

  // O quanto você (dono) deve pagar sozinho na fatura deste mês
  const ownerShareTotal = useMemo(() => {
    return enrichedMonthInstallments.reduce((acc, curr) => acc + curr.ownerShare, 0);
  }, [enrichedMonthInstallments]);

  // O quanto você tem a receber de amigos neste mês
  const friendsShareTotal = useMemo(() => {
    return enrichedMonthInstallments.reduce((acc, curr) => acc + curr.friendsTotal, 0);
  }, [enrichedMonthInstallments]);

  // O quanto já foi recebido/pago pelos amigos neste mês
  const friendsReceivedTotal = useMemo(() => {
    return enrichedMonthInstallments.reduce((acc, inst) => {
      const paidFriends = inst.friendsAssigned
        .filter(f => f.status === 'paid')
        .reduce((sum, curr) => sum + curr.amount, 0);
      return acc + paidFriends;
    }, 0);
  }, [enrichedMonthInstallments]);

  // Gastos consolidados por categoria para o gráfico/métrica do mês
  const categoryStats = useMemo(() => {
    const stats: { [key: string]: number } = {};
    enrichedMonthInstallments.forEach(inst => {
      const cat = inst.category || 'Geral';
      stats[cat] = (stats[cat] || 0) + inst.amount;
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [enrichedMonthInstallments]);

  // Gastos a receber detalhados por amigo no mês selecionado
  const friendsDebtsForMonth = useMemo(() => {
    const debts: { [friendId: string]: { name: string; toReceive: number; received: number } } = {};

    // Inicializa amigos
    friends.forEach(f => {
      debts[f.id] = { name: f.name, toReceive: 0, received: 0 };
    });

    enrichedMonthInstallments.forEach(inst => {
      inst.friendsAssigned.forEach(fAssigned => {
        if (debts[fAssigned.friend_id]) {
          debts[fAssigned.friend_id].toReceive += fAssigned.amount;
          if (fAssigned.status === 'paid') {
            debts[fAssigned.friend_id].received += fAssigned.amount;
          }
        }
      });
    });

    return Object.entries(debts)
      .map(([id, info]) => ({ id, ...info }))
      .filter(item => item.toReceive > 0);
  }, [enrichedMonthInstallments, friends]);

  // Limite total vs limite usado
  const limitStats = useMemo(() => {
    const totalLimit = cards.reduce((acc, curr) => acc + curr.limit, 0);

    // Limite usado é a soma de todas as parcelas pendentes futuras
    const pendingInstallmentsTotal = installments
      .filter(i => i.status === 'pending')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const availableLimit = Math.max(0, totalLimit - pendingInstallmentsTotal);
    const usedPercentage = totalLimit > 0 ? (pendingInstallmentsTotal / totalLimit) * 100 : 0;

    return {
      total: totalLimit,
      used: pendingInstallmentsTotal,
      available: availableLimit,
      percentage: Math.min(100, usedPercentage)
    };
  }, [cards, installments]);

  // Lista das próximas faturas/parcelas que vencem nos próximos 15 dias (a partir do dia atual fictício 10/06/2026)
  const upcomingBills = useMemo(() => {
    const today = new Date('2026-06-10');
    return installments
      .filter(inst => {
        const dueDate = new Date(inst.due_date + 'T12:00:00');
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return inst.status === 'pending' && diffDays >= 0 && diffDays <= 15;
      })
      .map(inst => {
        const purchase = purchases.find(p => p.id === inst.purchase_id);
        const card = purchase ? cards.find(c => c.id === purchase.card_id) : null;
        const isRecurrent = purchase ? isPurchaseRecurrent(purchase) : false;
        const desc = purchase ? cleanPurchaseDescription(purchase.description) : 'Compra';
        return {
          ...inst,
          desc,
          cardName: card ? card.name : 'Cartão',
          cardColor: card ? card.color : 'from-gray-700 to-gray-900',
          isRecurrent
        };
      })
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [installments, purchases, cards]);

  // Helper para verificar se uma compra tem parcelas futuras remanescentes além do ciclo ativo de seu cartão
  const hasFutureInstallments = (purchaseId: string) => {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) return false;
    const cycle = cardActiveBillCycles[purchase.card_id] || { month: 6, year: 2026 };
    return installments.some(inst => {
      if (inst.purchase_id !== purchaseId) return false;
      const parts = inst.due_date.split('-');
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        return year > cycle.year || (year === cycle.year && month > cycle.month);
      }
      return false;
    });
  };


  // RENDERIZAÇÃO DE TELAS

  // 0. CARREGAMENTO INICIAL DA SESSÃO
  if (!sessionLoaded) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin mb-4"></div>
          <p className="text-textMuted text-xs font-semibold uppercase tracking-wider">A carregar aplicação...</p>
        </div>
      </div>
    );
  }

  // 1. TELA DE AUTENTICAÇÃO
  if (!session && !isGuest) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        {/* Container principal simulando app mobile no desktop */}
        <div className="w-full max-w-md bg-card border border-border rounded-3xl p-8 shadow-premium relative overflow-hidden">
          {/* Luz de fundo decorativa */}
          <div className="absolute -top-40 -right-40 w-80 height-80 bg-accent opacity-20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 height-80 bg-indigo-500 opacity-10 rounded-full blur-3xl"></div>

          <div className="flex flex-col items-center mb-8 relative z-10">
            <div className="w-16 h-16 bg-gradient-to-tr from-accent to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
              <CardIcon className="w-9 h-9 text-white stroke-[2]" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
              Fatura<span className="text-accent">X</span>
            </h1>
            <p className="text-textMuted text-sm mt-1">Gestão inteligente de cartões e rateios</p>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-xl flex items-center gap-2 text-danger text-xs animate-slide-up">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-success/10 border border-success/30 rounded-xl flex items-center gap-2 text-success text-xs animate-slide-up">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {isSupabaseConfigured ? (
            <form onSubmit={handleAuth} className="space-y-4 relative z-10">
              <div>
                <label className="block text-xs text-textMuted font-medium mb-1.5 ml-1">E-mail</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="exemplo@faturax.com"
                  className="w-full bg-background border border-border focus:border-accent/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-textMuted font-medium mb-1.5 ml-1">Senha</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Sua senha secreta"
                  className="w-full bg-background border border-border focus:border-accent/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-all"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3.5 rounded-xl transition-all shadow-md shadow-accent/20 flex items-center justify-center"
              >
                {authLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : authMode === 'login' ? (
                  'Entrar na minha conta'
                ) : (
                  'Criar conta grátis'
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-xs text-accent hover:underline"
                >
                  {authMode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já possui conta? Faça Login'}
                </button>
              </div>
            </form>
          ) : (
            <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-center">
              <p className="text-yellow-400 text-xs leading-relaxed">
                Supabase não configurado localmente. Adicione as variáveis <strong>VITE_SUPABASE_URL</strong> e <strong>VITE_SUPABASE_ANON_KEY</strong> para habilitar banco de dados na nuvem.
              </p>
            </div>
          )}

          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
            <span className="relative bg-card px-3 text-[11px] text-textMuted uppercase tracking-wider">ou</span>
          </div>

          <button
            onClick={() => {
              setIsGuest(true);
              triggerNotification('Bem-vindo ao Modo Convidado!');
            }}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm border border-border"
          >
            <Smartphone className="w-4 h-4 text-textMuted" />
            Entrar em Modo Offline (Demonstração)
          </button>
        </div>
      </div>
    );
  }

  // --- APP PRINCIPAL ---
  return (
    <div className="min-h-screen bg-neutral-950 flex justify-center text-slate-100 font-sans pb-24">
      {/* Container Responsivo simulando tela de smartphone premium centralizado */}
      <div className="w-full max-w-md bg-background min-h-screen flex flex-col relative border-x border-border shadow-2xl">

        {/* Banner de Modo Convidado */}
        {isGuest && (
          <div className="bg-gradient-to-r from-yellow-600/30 to-amber-700/20 border-b border-yellow-500/20 py-1.5 px-4 text-center text-[10px] text-yellow-300 font-medium tracking-wide flex justify-center items-center gap-1">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Modo Offline: Dados salvos localmente neste navegador.</span>
          </div>
        )}

        {/* TOP BAR */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-card/40 sticky top-0 z-40 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg tracking-tight text-white">
              Fatura<span className="text-accent">X</span>
            </span>
            {loadingData && (
              <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin ml-1.5" />
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full border border-border flex items-center gap-1 font-medium">
              <UserIcon className="w-3 h-3 text-accent" />
              {isGuest ? 'Convidado' : session?.user.email?.split('@')[0]}
            </span>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-zinc-800 rounded-full transition-all text-textMuted hover:text-danger"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* NOTIFICAÇÃO TOAST */}
        {notification && (
          <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-xs font-semibold shadow-premium-sm border transition-all animate-slide-up flex items-center gap-2 ${notification.type === 'success'
              ? 'bg-success/15 border-success/30 text-success'
              : 'bg-danger/15 border-danger/30 text-danger'
            }`}>
            {notification.type === 'success' ? <Check className="w-4.5 h-4.5" /> : <AlertCircle className="w-4.5 h-4.5" />}
            <span>{notification.text}</span>
          </div>
        )}

        {/* PÁGINAS (CONTEÚDO DINÂMICO BASEADO NA ABA ATIVA) */}
        <main className="flex-1 p-6 overflow-y-auto">

          {/* ================= ABA: INÍCIO (DASHBOARD) ================= */}
          {activeTab === 'home' && (
            <div className="space-y-6 animate-slide-up">
              {/* Header de Boas Vindas */}
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Painel Financeiro</h2>
                <p className="text-textMuted text-xs">Visão geral do mês corrente (Junho 2026)</p>
              </div>

              {/* CARD DE FATURA TOTAL DO MÊS */}
              <div className="bg-gradient-to-br from-indigo-950/40 via-card to-card border border-border rounded-3xl p-6 shadow-premium relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl"></div>
                <p className="text-xs text-textMuted font-medium uppercase tracking-wider">Fatura Consolidada (Jun/26)</p>
                <h3 className="text-3xl font-extrabold text-white mt-1">
                  R$ {totalFaturasMese.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>

                <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-border">
                  <div>
                    <span className="text-[10px] text-textMuted uppercase block">Sua Parte</span>
                    <span className="text-sm font-bold text-white">
                      R$ {ownerShareTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-textMuted uppercase block">A Receber</span>
                    <span className="text-sm font-bold text-accent">
                      R$ {friendsShareTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Barra de Progresso de Recebimento de Amigos */}
                {friendsShareTotal > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] text-textMuted mb-1.5">
                      <span>Progresso dos rateios</span>
                      <span>
                        R$ {friendsReceivedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ {friendsShareTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-success h-full transition-all duration-500"
                        style={{ width: `${(friendsReceivedTotal / friendsShareTotal) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* MÉTROCA DE LIMITE GERAL */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <CardIcon className="w-4 h-4 text-textMuted" />
                    <span className="text-xs text-textMuted font-medium">Limite de Crédito Consolidado</span>
                  </div>
                  <span className="text-xs font-bold text-white">
                    {limitStats.percentage.toFixed(0)}% Utilizado
                  </span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden mb-3">
                  <div
                    className="bg-gradient-to-r from-accent to-purple-500 h-full transition-all duration-500"
                    style={{ width: `${limitStats.percentage}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs">
                  <div>
                    <span className="text-textMuted block text-[9px] uppercase">Disponível</span>
                    <span className="font-semibold text-emerald-400">R$ {limitStats.available.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-textMuted block text-[9px] uppercase">Total</span>
                    <span className="font-semibold text-zinc-400">R$ {limitStats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* GRÁFICO SIMPLES POR CATEGORIA */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Gastos por Categoria (Jun/26)</h4>

                {categoryStats.length === 0 ? (
                  <p className="text-xs text-textMuted text-center py-4">Nenhuma compra parcelada neste mês.</p>
                ) : (
                  <div className="space-y-2.5">
                    {categoryStats.map(stat => {
                      const percentage = totalFaturasMese > 0 ? (stat.value / totalFaturasMese) * 100 : 0;
                      return (
                        <div key={stat.name} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-medium">{stat.name}</span>
                            <span className="text-white font-bold">R$ {stat.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="w-full bg-zinc-900 rounded-full h-1">
                            <div
                              className="bg-indigo-500 h-1 rounded-full"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RATEIOS POR AMIGO RESUMO */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Quem te deve este mês</h4>
                {friendsDebtsForMonth.length === 0 ? (
                  <p className="text-xs text-textMuted text-center py-4">Tudo limpo! Ninguém te deve neste mês.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {friendsDebtsForMonth.map(friend => {
                      const allPaid = friend.received >= friend.toReceive;
                      return (
                        <div key={friend.id} className="flex justify-between items-center py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-xs font-extrabold text-accent">
                              {friend.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-xs font-semibold text-white block">{friend.name}</span>
                              <span className="text-[10px] text-textMuted">
                                {allPaid ? 'Totalmente pago' : `Pago R$ ${friend.received} de R$ ${friend.toReceive}`}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs font-bold ${allPaid ? 'text-success' : 'text-accent'}`}>
                              R$ {(friend.toReceive - friend.received).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* PRÓXIMOS VENCIMENTOS */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Próximos Vencimentos (15 dias)</h4>

                {upcomingBills.length === 0 ? (
                  <p className="text-xs text-textMuted text-center py-6 bg-card/30 border border-dashed border-border rounded-2xl">
                    Nenhuma parcela pendente nos próximos 15 dias.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {upcomingBills.map(bill => (
                      <div key={bill.id} className="bg-card border border-border hover:border-border/80 p-3.5 rounded-xl flex items-center justify-between card-hover-effect">
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-10 rounded bg-danger"></div>
                          <div>
                            <span className="text-xs font-bold text-white block">{bill.desc}</span>
                            <span className="text-[10px] text-textMuted flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${bill.cardColor}`}></span>
                              {bill.cardName} • {bill.isRecurrent ? 'Recorrente' : `Parc. ${bill.installment_number}`}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-white block">
                            R$ {bill.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[9px] text-danger font-semibold bg-danger/10 px-1.5 py-0.5 rounded uppercase">
                            Vence {new Date(bill.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= ABA: CARTÕES ================= */}
          {activeTab === 'cards' && (
            <div className="space-y-6 animate-slide-up">
              {selectedCardId ? (
                // ================= TELA DE DETALHAMENTO DO CARTÃO =================
                (() => {
                  const card = cards.find(c => c.id === selectedCardId);
                  if (!card) {
                    setSelectedCardId(null);
                    return null;
                  }

                  // Calcula limites e gastos
                  const cardUsedLimit = installments
                    .filter(i => i.status === 'pending')
                    .filter(i => {
                      const purchase = purchases.find(p => p.id === i.purchase_id);
                      return purchase?.card_id === card.id;
                    })
                    .reduce((acc, curr) => acc + curr.amount, 0);

                  const cardAvailableLimit = Math.max(0, card.limit - cardUsedLimit);
                  const selectedMonthTotalFatura = cardDetailedPurchases.reduce((acc, curr) => acc + (curr?.amount || 0), 0);
                  const cardActiveCycle = cardActiveBillCycles[card.id] || { month: 6, year: 2026 };

                  return (
                    <div className="space-y-6 animate-slide-up">
                      {/* Cabeçalho do Detalhamento */}
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setSelectedCardId(null)}
                          className="flex items-center gap-1 text-xs text-textMuted hover:text-white transition-all py-1.5 px-3 rounded-lg bg-zinc-900 border border-border"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Voltar
                        </button>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Detalhamento</h3>
                        <div className="w-16"></div> {/* Espaçador para centralizar */}
                      </div>

                      {/* Cartão físico em destaque */}
                      <div className={`relative bg-gradient-to-tr ${card.color} text-white rounded-2xl p-6 shadow-premium overflow-hidden aspect-[1.58/1]`}>
                        <div className="absolute top-6 left-6 w-10 h-8 bg-amber-400/20 border border-amber-300/30 rounded-md"></div>
                        <div className="absolute top-6 right-6 font-extrabold text-sm tracking-wide opacity-90 uppercase">
                          {card.name}
                        </div>
                        <div className="absolute top-18 right-6 rotate-90 text-white/40">
                          <span className="text-xs">)))</span>
                        </div>
                        <div className="absolute bottom-16 left-6">
                          <span className="text-[10px] uppercase tracking-wider text-white/60">Limite Disponível</span>
                          <h4 className="text-xl font-bold tracking-tight">
                            R$ {cardAvailableLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </h4>
                        </div>
                        <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center text-[10px] text-white/70">
                          <div>
                            <span className="block text-[8px] uppercase text-white/50">Limite Total</span>
                            <span className="font-semibold text-white">R$ {card.limit.toLocaleString('pt-BR')}</span>
                          </div>
                          <div className="flex gap-4">
                            <div>
                              <span className="block text-[8px] uppercase text-white/50">Melhor Dia</span>
                              <span className="font-semibold text-white">{card.closing_day}</span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase text-white/50">Vencimento</span>
                              <span className="font-semibold text-white">{card.due_day}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Resumo da Fatura */}
                      <div className="bg-card border border-border p-4.5 rounded-2xl">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-[10px] text-textMuted uppercase font-medium">
                              Fatura de {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][cardActiveCycle.month - 1]}/{cardActiveCycle.year}
                            </span>
                            <h4 className="text-2xl font-extrabold text-white mt-0.5">
                              R$ {selectedMonthTotalFatura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </h4>
                          </div>
                          <span className="text-[10px] bg-accent/10 border border-accent/20 text-accent font-bold px-3 py-1 rounded-full">
                            {cardDetailedPurchases.length} {cardDetailedPurchases.length === 1 ? 'Lançamento' : 'Lançamentos'}
                          </span>
                        </div>
                        {selectedMonthTotalFatura > 0 && (
                          <button
                            onClick={() => handlePayCardInvoice(card.id)}
                            className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Marcar Fatura como Paga
                          </button>
                        )}
                      </div>

                      {/* SEÇÃO 1: RESUMO DE GASTOS POR PESSOA */}
                      <div className="bg-card border border-border p-4.5 rounded-2xl space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-border/60">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Gastos por Pessoa</h4>
                          <span className="text-[10px] text-textMuted font-medium font-sans">Divisão no Cartão</span>
                        </div>

                        {cardPersonGastos.length === 0 ? (
                          <p className="text-xs text-textMuted text-center py-4">Sem compras parceladas para este cartão no mês selecionado.</p>
                        ) : (
                          <div className="space-y-3">
                            {cardPersonGastos.map(gasto => {
                              const percentage = selectedMonthTotalFatura > 0 ? (gasto.amount / selectedMonthTotalFatura) * 100 : 0;
                              return (
                                <div key={gasto.name} className="space-y-1">
                                  <div className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-accent/20 to-purple-600/10 border border-accent/20 flex items-center justify-center font-extrabold text-[10px] text-accent">
                                        {gasto.name.substring(0, 2).toUpperCase()}
                                      </div>
                                      <span className="text-slate-200 font-semibold">{gasto.name}</span>
                                    </div>
                                    <span className="text-white font-bold font-sans">
                                      R$ {gasto.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="bg-gradient-to-r from-accent to-indigo-500 h-full rounded-full transition-all duration-500"
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* SEÇÃO 2: HISTÓRICO DE COMPRAS DA FATURA */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Histórico de Compras da Fatura</h4>

                        {cardDetailedPurchases.length === 0 ? (
                          <p className="text-xs text-textMuted text-center py-8 bg-card/30 border border-dashed border-border rounded-2xl">
                            Nenhuma compra registrada para este cartão em {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][cardActiveCycle.month - 1]}/{cardActiveCycle.year}.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {cardDetailedPurchases.map(compra => {
                              if (!compra) return null;
                              return (
                                <div key={compra.id} className="bg-card border border-border p-3.5 rounded-xl flex items-center justify-between card-hover-effect">
                                  <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-8 rounded bg-accent"></div>
                                    <div>
                                      <span className="text-xs font-bold text-white block">{compra.description}</span>
                                      <span className="text-[10px] text-textMuted flex items-center gap-1.5 mt-0.5">
                                        <span>{new Date(compra.purchaseDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                        <span>•</span>
                                        <span className="text-accent">{compra.owners}</span>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right">
                                      <span className="text-xs font-extrabold text-white block">
                                        R$ {compra.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                      <span className="text-[9px] text-textMuted font-semibold bg-zinc-900 px-1.5 py-0.5 rounded border border-border/60">
                                        {compra.isRecurrent ? 'Recorrente' : `${compra.installmentNumber}/${compra.totalInstallments}`}
                                      </span>
                                    </div>
                                    {compra.isRecurrent && hasFutureInstallments(compra.purchaseId) && (
                                      <button
                                        onClick={() => handleDeactivateRecurrence(compra.purchaseId)}
                                        className="p-1.5 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                                        title="Desativar Recorrência"
                                      >
                                        <AlertCircle className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeletePurchase(compra.purchaseId)}
                                      className="p-1.5 text-textMuted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                      title="Excluir Compra Inteira"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                // ================= LISTAGEM DE CARTÕES NORMAL =================
                <div className="space-y-6 animate-slide-up">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">Seus Cartões</h2>
                      <p className="text-textMuted text-xs font-medium">Toque no cartão para detalhar a fatura</p>
                    </div>
                    <button
                      onClick={() => setShowAddCardForm(!showAddCardForm)}
                      className="bg-accent hover:bg-accent-hover text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Novo Cartão
                    </button>
                  </div>

                  {/* FORMULÁRIO ADICIONAR CARTÃO */}
                  {showAddCardForm && (
                    <form onSubmit={handleAddCard} className="bg-card border border-border p-5 rounded-2xl space-y-4 animate-slide-up">
                      <h3 className="text-sm font-bold text-white">
                        {editingCardId ? 'Editar Cartão' : 'Cadastrar Novo Cartão'}
                      </h3>

                      <div>
                        <label className="block text-[11px] text-textMuted font-medium mb-1">Nome do Cartão (ex: Nubank Visa)</label>
                        <input
                          type="text"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          placeholder="Nubank, XP, Inter..."
                          className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-textMuted font-medium mb-1">Limite Total (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={cardLimit}
                            onChange={(e) => setCardLimit(e.target.value)}
                            placeholder="5000"
                            className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-textMuted font-medium mb-1">Dia do Vencimento</label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={cardDueDay}
                            onChange={(e) => setCardDueDay(e.target.value)}
                            className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-textMuted font-medium mb-1">Dia do Fechamento</label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={cardClosingDay}
                            onChange={(e) => setCardClosingDay(e.target.value)}
                            className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-textMuted font-medium mb-1">Estilo Visual</label>
                          <select
                            value={cardColor}
                            onChange={(e) => setCardColor(e.target.value)}
                            className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                          >
                            {CARD_COLORS.map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="submit"
                          className="flex-1 bg-accent hover:bg-accent-hover text-white text-xs font-semibold py-2.5 rounded-xl transition-all"
                        >
                          {editingCardId ? 'Salvar Alterações' : 'Salvar Cartão'}
                        </button>
                        <button
                          type="button"
                          onClick={clearCardForm}
                          className="bg-zinc-800 hover:bg-zinc-700 text-textMuted text-xs font-semibold px-4 py-2.5 rounded-xl transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}

                  {/* LISTAGEM DE CARTÕES */}
                  {cards.length === 0 ? (
                    <div className="text-center py-12 bg-card/30 border border-dashed border-border rounded-3xl">
                      <CardIcon className="w-10 h-10 text-textMuted mx-auto mb-2 opacity-50" />
                      <p className="text-sm text-textMuted">Nenhum cartão cadastrado ainda.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {cards.map(card => {
                        // Calcula o gasto total neste cartão
                        const cardUsedLimit = installments
                          .filter(i => i.status === 'pending')
                          .filter(i => {
                            const purchase = purchases.find(p => p.id === i.purchase_id);
                            return purchase?.card_id === card.id;
                          })
                          .reduce((acc, curr) => acc + curr.amount, 0);

                        const cardAvailableLimit = Math.max(0, card.limit - cardUsedLimit);
                        const percentage = (cardUsedLimit / card.limit) * 100;

                        return (
                          <div key={card.id} className="space-y-2">
                            {/* Cartão físico premium clicável */}
                            <div
                              onClick={() => setSelectedCardId(card.id)}
                              className={`relative bg-gradient-to-tr ${card.color} text-white rounded-2xl p-6 shadow-premium overflow-hidden aspect-[1.58/1] cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all`}
                            >
                              {/* Chip / Elemento decorativo */}
                              <div className="absolute top-6 left-6 w-10 h-8 bg-amber-400/20 border border-amber-300/30 rounded-md"></div>

                              {/* Nome do cartão */}
                              <div className="absolute top-6 right-6 font-extrabold text-sm tracking-wide opacity-90 uppercase">
                                {card.name}
                              </div>

                              {/* Ícone Contactless ou decorativo */}
                              <div className="absolute top-18 right-6 rotate-90 text-white/40">
                                <span className="text-xs">)))</span>
                              </div>

                              {/* Saldo / Limite Disponível */}
                              <div className="absolute bottom-16 left-6">
                                <span className="text-[10px] uppercase tracking-wider text-white/60">Limite Disponível</span>
                                <h4 className="text-xl font-bold tracking-tight">
                                  R$ {cardAvailableLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </h4>
                              </div>

                              {/* Rodapé do cartão com Vencimento / Fechamento */}
                              <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center text-[10px] text-white/70">
                                <div>
                                  <span className="block text-[8px] uppercase text-white/50">Limite Total</span>
                                  <span className="font-semibold text-white">R$ {card.limit.toLocaleString('pt-BR')}</span>
                                </div>
                                <div className="flex gap-4">
                                  <div>
                                    <span className="block text-[8px] uppercase text-white/50">Melhor Dia</span>
                                    <span className="font-semibold text-white">{card.closing_day}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[8px] uppercase text-white/50">Vencimento</span>
                                    <span className="font-semibold text-white">{card.due_day}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Barra de progresso e botão de deletar abaixo do card */}
                            <div className="bg-card border border-border p-3.5 rounded-xl flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex justify-between text-[10px] text-textMuted mb-1">
                                  <span>Limite Usado: R$ {cardUsedLimit.toLocaleString('pt-BR')}</span>
                                  <span>{percentage.toFixed(0)}%</span>
                                </div>
                                <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                                  <div className="bg-white h-full" style={{ width: `${Math.min(100, percentage)}%` }}></div>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => startEditCard(card)}
                                  className="p-2 text-textMuted hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                  title="Editar Cartão"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCard(card.id)}
                                  className="p-2 text-textMuted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                  title="Excluir Cartão"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= ABA: AMIGOS (PESSOAS) ================= */}
          {activeTab === 'friends' && (
            <div className="space-y-6 animate-slide-up">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Pessoas & Amigos</h2>
                  <p className="text-textMuted text-xs">Divisões recorrentes e acompanhamento de quem pagou</p>
                </div>
                <button
                  onClick={() => setShowAddFriendForm(!showAddFriendForm)}
                  className="bg-accent hover:bg-accent-hover text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Novo Amigo
                </button>
              </div>

              {/* FORMULÁRIO ADICIONAR AMIGO */}
              {showAddFriendForm && (
                <form onSubmit={handleAddFriend} className="bg-card border border-border p-5 rounded-2xl space-y-4 animate-slide-up">
                  <h3 className="text-sm font-bold text-white">Adicionar Novo Amigo</h3>

                  <div>
                    <label className="block text-[11px] text-textMuted font-medium mb-1">Nome Completo ou Apelido</label>
                    <input
                      type="text"
                      value={friendName}
                      onChange={(e) => setFriendName(e.target.value)}
                      placeholder="Ex: Carlos Santos"
                      className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-accent hover:bg-accent-hover text-white text-xs font-semibold py-2.5 rounded-xl transition-all"
                    >
                      Cadastrar Amigo
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddFriendForm(false)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-textMuted text-xs font-semibold px-4 py-2.5 rounded-xl transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {/* LISTAGEM DE PESSOAS */}
              <div className="space-y-2">
                {[
                  { id: 'owner_profile', name: 'Você', isOwner: true },
                  ...friends.map(f => ({ id: f.id, name: f.name, isOwner: false }))
                ].map(person => {
                  // Calcula o valor total pendente que este amigo ou dono deve
                  const totalPendingToReceive = person.isOwner
                    ? installments
                        .filter(inst => inst.status === 'pending')
                        .reduce((acc, inst) => {
                          const friendsAssigned = installmentFriends.filter(ifriend => ifriend.installment_id === inst.id);
                          const friendsTotal = friendsAssigned.reduce((sum, curr) => sum + curr.amount, 0);
                          const ownerShare = Math.max(0, inst.amount - friendsTotal);
                          return acc + ownerShare;
                        }, 0)
                    : installmentFriends
                        .filter(ifriend => ifriend.friend_id === person.id && ifriend.status === 'pending')
                        .reduce((acc, curr) => acc + curr.amount, 0);

                  const isExpanded = expandedFriendId === person.id;

                  // Group installments of this person by card in the card's active cycle
                  const friendCardGroups = cards.map(card => {
                    const cycle = cardActiveBillCycles[card.id] || { month: 6, year: 2026 };
                    const cardPurchases = purchases.filter(p => p.card_id === card.id);
                    const cardPurchaseIds = cardPurchases.map(p => p.id);
                    
                    const activeInstallments = installments.filter(inst => {
                      if (!cardPurchaseIds.includes(inst.purchase_id)) return false;
                      const parts = inst.due_date.split('-');
                      if (parts.length >= 2) {
                        const year = parseInt(parts[0], 10);
                        const month = parseInt(parts[1], 10);
                        return month === cycle.month && year === cycle.year;
                      }
                      return false;
                    });
                    
                    const items = activeInstallments.map(inst => {
                      if (person.isOwner) {
                        const friendsAssigned = installmentFriends.filter(fa => fa.installment_id === inst.id);
                        const friendsTotal = friendsAssigned.reduce((sum, curr) => sum + curr.amount, 0);
                        const ownerShare = Math.max(0, inst.amount - friendsTotal);
                        
                        if (ownerShare <= 0) return null;
                        
                        const purchase = cardPurchases.find(p => p.id === inst.purchase_id);
                        const isRecurrent = purchase ? isPurchaseRecurrent(purchase) : false;
                        const purchaseDesc = purchase ? cleanPurchaseDescription(purchase.description) : 'Compra';
                        
                        return {
                          instId: inst.id,
                          purchaseId: purchase ? purchase.id : '',
                          purchaseDesc,
                          cardId: card.id,
                          cardName: card.name,
                          cardColor: card.color,
                          installmentNumber: inst.installment_number,
                          totalInstallments: purchase ? purchase.installments_count : 1,
                          amount: ownerShare,
                          status: inst.status,
                          instFriendId: inst.id,
                          dueDate: inst.due_date,
                          isRecurrent
                        };
                      } else {
                        const assigned = installmentFriends.find(fa => fa.friend_id === person.id && fa.installment_id === inst.id);
                        if (!assigned) return null;
                        
                        const purchase = cardPurchases.find(p => p.id === inst.purchase_id);
                        const isRecurrent = purchase ? isPurchaseRecurrent(purchase) : false;
                        const purchaseDesc = purchase ? cleanPurchaseDescription(purchase.description) : 'Compra';
                        
                        return {
                          instId: inst.id,
                          purchaseId: purchase ? purchase.id : '',
                          purchaseDesc,
                          cardId: card.id,
                          cardName: card.name,
                          cardColor: card.color,
                          installmentNumber: inst.installment_number,
                          totalInstallments: purchase ? purchase.installments_count : 1,
                          amount: assigned.amount,
                          status: assigned.status,
                          instFriendId: assigned.id,
                          dueDate: inst.due_date,
                          isRecurrent
                        };
                      }
                    }).filter(Boolean) as Array<{
                      instId: string;
                      purchaseId: string;
                      purchaseDesc: string;
                      cardId: string;
                      cardName: string;
                      cardColor: string;
                      installmentNumber: number;
                      totalInstallments: number;
                      amount: number;
                      status: 'pending' | 'paid';
                      instFriendId: string;
                      dueDate: string;
                      isRecurrent: boolean;
                    }>;
                    
                    if (items.length === 0) return null;
                    
                    const total = items.reduce((sum, item) => sum + item.amount, 0);
                    const isCurrentBill = cycle.year < 2026 || (cycle.year === 2026 && cycle.month <= 6);
                    const label = isCurrentBill ? 'Fatura Atual' : 'Próxima Fatura';
                    
                    return {
                      cardId: card.id,
                      cardName: card.name,
                      cardColor: card.color,
                      total,
                      label,
                      cycle,
                      items
                    };
                  }).filter(Boolean) as Array<{
                    cardId: string;
                    cardName: string;
                    cardColor: string;
                    total: number;
                    label: string;
                    cycle: { month: number; year: number };
                    items: Array<{
                      instId: string;
                      purchaseId: string;
                      purchaseDesc: string;
                      cardId: string;
                      cardName: string;
                      cardColor: string;
                      installmentNumber: number;
                      totalInstallments: number;
                      amount: number;
                      status: 'pending' | 'paid';
                      instFriendId: string;
                      dueDate: string;
                      isRecurrent: boolean;
                    }>;
                  }>;

                  return (
                    <div
                      key={person.id}
                      onClick={() => setExpandedFriendId(isExpanded ? null : person.id)}
                      className={`bg-card border ${
                        isExpanded ? 'border-accent/30 shadow-md shadow-accent/5' : 'border-border'
                      } rounded-xl p-4 cursor-pointer hover:border-border-hover transition-all space-y-3.5`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent/20 to-purple-600/10 border border-accent/20 flex items-center justify-center font-bold text-accent">
                            {person.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white">{person.name}</h4>
                            <span className="text-[10px] text-textMuted block">
                              {totalPendingToReceive > 0
                                ? person.isOwner 
                                  ? `Possui despesas individuais`
                                  : `Possui rateios pendentes`
                                : 'Sem pendências financeiras'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          {totalPendingToReceive > 0 ? (
                            <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-1 rounded-lg">
                              {person.isOwner ? 'A pagar: ' : 'A receber: '}R$ {totalPendingToReceive.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-success bg-success/10 px-2.5 py-1 rounded-full uppercase">
                              Tá Pago
                            </span>
                          )}
                          {!person.isOwner && (
                            <button
                              onClick={() => handleDeleteFriend(person.id)}
                              className="p-2 text-textMuted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                              title="Remover Amigo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Conteúdo Expandido */}
                      {isExpanded && (
                        <div className="border-t border-border/50 pt-3.5 space-y-3" onClick={(e) => e.stopPropagation()}>
                          {friendCardGroups.length === 0 ? (
                            <p className="text-xs text-textMuted text-center py-2">
                              Nenhuma parcela ativa para {person.name} nos ciclos vigentes dos cartões.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              <span className="text-[10px] text-textMuted font-bold uppercase tracking-wider block">
                                Dívidas Ativas por Cartão:
                              </span>
                              
                              {friendCardGroups.map(group => (
                                <div key={group.cardId} className="bg-zinc-950/60 border border-border/80 rounded-xl p-3.5 space-y-2.5">
                                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${group.cardColor}`}></span>
                                      <span className="text-xs font-bold text-white">
                                        {group.cardName}
                                      </span>
                                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                                        group.label === 'Fatura Atual'
                                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                          : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                      }`}>
                                        {group.label} ({['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][group.cycle.month - 1]}/{group.cycle.year})
                                      </span>
                                    </div>
                                    <span className="text-xs font-extrabold text-accent">
                                      Total: R$ {group.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="space-y-2">
                                    {group.items.map(item => (
                                      <div key={item.instId} className="flex justify-between items-center text-xs">
                                        <div>
                                          <span className="text-slate-300 font-medium block">{item.purchaseDesc}</span>
                                          <span className="text-[9px] text-textMuted">
                                            {item.isRecurrent ? 'Recorrente' : `Parcela ${item.installmentNumber}/${item.totalInstallments}`}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className="font-bold text-white">
                                            R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </span>
                                          {item.isRecurrent && hasFutureInstallments(item.purchaseId) && (
                                            <button
                                              onClick={() => handleDeactivateRecurrence(item.purchaseId)}
                                              className="p-1 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-all"
                                              title="Desativar Recorrência"
                                            >
                                              <AlertCircle className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                          <button
                                            onClick={() => {
                                              if (person.isOwner) {
                                                toggleInstallmentStatus(item.instId, item.status);
                                              } else {
                                                toggleFriendPaidStatus(item.instFriendId, item.status);
                                              }
                                            }}
                                            className={`px-2 py-0.75 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                              item.status === 'paid'
                                                ? 'bg-success/10 text-success border-success/30 hover:bg-success/20'
                                                : 'bg-accent/10 text-accent border-accent/25 hover:bg-accent/20'
                                            }`}
                                          >
                                            {item.status === 'paid' ? 'Pago' : 'Pendente'}
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= ABA: LANÇAR COMPRAS ================= */}
          {activeTab === 'purchases' && (
            <div className="space-y-6 animate-slide-up">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Nova Compra</h2>
                <p className="text-textMuted text-xs">Adicione uma despesa e divida as parcelas com amigos</p>
              </div>

              {cards.length === 0 ? (
                <div className="bg-card border border-border p-6 rounded-2xl text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto" />
                  <h3 className="text-sm font-bold text-white">Cadastre um cartão primeiro</h3>
                  <p className="text-xs text-textMuted">Você precisa de pelo menos um cartão de crédito ativo para registrar compras.</p>
                  <button
                    onClick={() => setActiveTab('cards')}
                    className="bg-accent hover:bg-accent-hover text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all"
                  >
                    Ir para Cartões
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAddPurchase} className="bg-card border border-border p-5 rounded-2xl space-y-4">
                  <div>
                    <label className="block text-[11px] text-textMuted font-medium mb-1">Descrição do Lançamento</label>
                    <input
                      type="text"
                      value={purchaseDesc}
                      onChange={(e) => setPurchaseDesc(e.target.value)}
                      placeholder="Ex: Compra do Supermercado, Monitor LG"
                      className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-textMuted font-medium mb-1">Valor Total (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={purchaseAmount}
                        onChange={(e) => setPurchaseAmount(e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-textMuted font-medium mb-1">Cartão de Crédito</label>
                      <select
                        value={purchaseCard}
                        onChange={(e) => setPurchaseCard(e.target.value)}
                        className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                        required
                      >
                        {cards.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      id="purchaseIsRecurrent"
                      checked={purchaseIsRecurrent}
                      onChange={(e) => setPurchaseIsRecurrent(e.target.checked)}
                      className="w-4 h-4 text-accent border-border rounded focus:ring-accent bg-background"
                    />
                    <label htmlFor="purchaseIsRecurrent" className="text-xs text-slate-200 cursor-pointer select-none font-medium">
                      Compra Recorrente (Mensalidade / Assinatura)
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {!purchaseIsRecurrent ? (
                      <div>
                        <label className="block text-[11px] text-textMuted font-medium mb-1">Número de Parcelas</label>
                        <select
                          value={purchaseInstallments}
                          onChange={(e) => setPurchaseInstallments(e.target.value)}
                          className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                        >
                          {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}x</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] text-textMuted font-medium mb-1">Número de Parcelas</label>
                        <div className="w-full bg-zinc-900 border border-border rounded-xl px-3 py-2 text-xs text-accent font-semibold flex items-center h-[34px]">
                          Recorrente (60x)
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-textMuted font-medium mb-1">Categoria</label>
                      <select
                        value={purchaseCategory}
                        onChange={(e) => setPurchaseCategory(e.target.value)}
                        className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                      >
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-textMuted font-medium mb-1">Data da Compra</label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="w-full bg-background border border-border focus:border-accent/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                      required
                    />
                  </div>

                  {/* DIVIDIR COM AMIGOS */}
                  <div className="border-t border-border pt-4 mt-2">
                    <span className="block text-xs font-bold text-white mb-2 flex items-center gap-1">
                      <Users className="w-4 h-4 text-accent" />
                      Dividir Despesa com Amigos (Opcional)
                    </span>
                    {friends.length === 0 ? (
                      <p className="text-[11px] text-textMuted bg-zinc-900/40 p-3 rounded-lg border border-border">
                        Nenhum amigo cadastrado. Cadastre pessoas na aba <strong>Amigos</strong> para habilitar o rateio.
                      </p>
                    ) : (
                      <div className="bg-zinc-950 border border-border rounded-xl p-3 max-h-40 overflow-y-auto space-y-2">
                        <p className="text-[10px] text-textMuted pb-1 border-b border-border">
                          O valor total (e cada parcela) será dividido igualmente entre as pessoas marcadas abaixo:
                        </p>
                        
                        {/* Opção fixa para "Você" (o dono) */}
                        <label
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                            selectedFriendsForDivision.includes('user') ? 'bg-accent/10 border border-accent/20' : 'hover:bg-zinc-900 border border-transparent'
                          }`}
                        >
                          <span className="text-xs font-medium text-white">Você (Dono do Cartão)</span>
                          <input
                            type="checkbox"
                            checked={selectedFriendsForDivision.includes('user')}
                            onChange={() => {
                              if (selectedFriendsForDivision.includes('user')) {
                                setSelectedFriendsForDivision(selectedFriendsForDivision.filter(id => id !== 'user'));
                              } else {
                                setSelectedFriendsForDivision([...selectedFriendsForDivision, 'user']);
                              }
                            }}
                            className="w-4 h-4 text-accent border-border rounded focus:ring-accent bg-background"
                          />
                        </label>

                        {/* Amigos cadastrados */}
                        {friends.map(friend => {
                          const isSelected = selectedFriendsForDivision.includes(friend.id);
                          return (
                            <label
                              key={friend.id}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-accent/10 border border-accent/20' : 'hover:bg-zinc-900 border border-transparent'
                                }`}
                            >
                              <span className="text-xs font-medium text-white">{friend.name}</span>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedFriendsForDivision(selectedFriendsForDivision.filter(id => id !== friend.id));
                                  } else {
                                    setSelectedFriendsForDivision([...selectedFriendsForDivision, friend.id]);
                                  }
                                }}
                                className="w-4 h-4 text-accent border-border rounded focus:ring-accent bg-background"
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Visualização de Resumo da Divisão */}
                  {purchaseAmount && (
                    <div className="bg-zinc-900 p-3.5 rounded-xl text-xs space-y-1.5 border border-border/80">
                      <span className="font-semibold text-white block">Resumo do Rateio</span>
                      <div className="flex justify-between text-textMuted text-[11px]">
                        <span>Parcela Estimada:</span>
                        <span>
                          {purchaseIsRecurrent 
                            ? `Recorrente: R$ ${parseFloat(purchaseAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês (Simulado em 60x)` 
                            : `${purchaseInstallments}x de R$ ${(parseFloat(purchaseAmount) / parseInt(purchaseInstallments)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>
                      {selectedFriendsForDivision.length > 0 && (
                        <div className="flex justify-between text-accent font-semibold text-[11px]">
                          <span>Divisão ({selectedFriendsForDivision.length} {selectedFriendsForDivision.length === 1 ? 'pessoa' : 'pessoas'}):</span>
                          <span>R$ {(parseFloat(purchaseAmount) / selectedFriendsForDivision.length).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por pessoa</span>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold py-3 rounded-xl transition-all shadow-md shadow-accent/20 flex items-center justify-center gap-1"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Registrar Compra e Parcelas
                  </button>
                </form>
              )}

              {/* LISTA DE COMPRAS RECENTES */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Histórico de Compras</h4>

                {purchases.length === 0 ? (
                  <p className="text-xs text-textMuted text-center py-6">Nenhuma compra cadastrada no histórico.</p>
                ) : (
                  <div className="space-y-2">
                    {purchasesWithDetails.map(p => (
                      <div key={p.id} className="bg-card border border-border p-3.5 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-white block">{p.description}</span>
                          <span className="text-[10px] text-textMuted flex items-center gap-2">
                            <span>{new Date(p.purchase_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                            <span>•</span>
                            <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.25 rounded text-[8px] uppercase">{p.category}</span>
                            <span>•</span>
                            <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${p.cardColor}`}></span>
                            <span>{p.cardName}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-xs font-bold text-white block">
                              R$ {p.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-[9px] text-textMuted font-semibold">
                              {p.isRecurrent 
                                ? 'Recorrente' 
                                : `${p.installments_count}x de R$ ${(p.total_amount / p.installments_count).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                            </span>
                          </div>
                          {p.isRecurrent && hasFutureInstallments(p.id) && (
                            <button
                              onClick={() => handleDeactivateRecurrence(p.id)}
                              className="p-1.5 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                              title="Desativar Recorrência"
                            >
                              <AlertCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePurchase(p.id)}
                            className="p-1.5 text-textMuted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                            title="Remover Compra"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= ABA: RELATÓRIOS ("TÁ PAGO") ================= */}
          {activeTab === 'reports' && (
            <div className="space-y-6 animate-slide-up">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Relatório "Tá Pago"</h2>
                  <p className="text-textMuted text-xs">Divisão de faturas cirúrgica por amigo e cartão</p>
                </div>
              </div>

              {/* SELETOR DE CARTÃO E MÊS / ANO */}
              <div className="bg-card border border-border p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-bold text-white">Cartão:</span>
                  <select
                    value={selectedReportCardId}
                    onChange={(e) => setSelectedReportCardId(e.target.value)}
                    className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-accent w-[200px]"
                  >
                    <option value="all">Todos os Cartões</option>
                    {cards.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-bold text-white">Filtro de Referência:</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-accent"
                    >
                      {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
                        <option key={m} value={idx + 1}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-accent"
                    >
                      {[2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* COMPOSIÇÃO DE GASTOS DO MÊS */}
              <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-border p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Fechamento do Mês</h3>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-card/80 border border-border/80 p-3 rounded-xl">
                    <span className="text-[9px] text-textMuted uppercase block">Fatura Total</span>
                    <span className="text-xs font-bold text-white block mt-1">
                      R$ {totalFaturasMese.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-card/80 border border-border/80 p-3 rounded-xl">
                    <span className="text-[9px] text-textMuted uppercase block">Sua Parte</span>
                    <span className="text-xs font-bold text-emerald-400 block mt-1">
                      R$ {ownerShareTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-card/80 border border-border/80 p-3 rounded-xl">
                    <span className="text-[9px] text-textMuted uppercase block">Amigos</span>
                    <span className="text-xs font-bold text-accent block mt-1">
                      R$ {friendsShareTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {selectedReportCardId !== 'all' && estimatedReportCardLimit !== null && (
                  <div className="bg-card/40 border border-border/60 rounded-xl p-3 flex justify-between items-center text-xs">
                    <span className="text-textMuted font-medium">Limite Disponível Estimado (deste mês em diante):</span>
                    <span className="font-bold text-emerald-400">
                      R$ {estimatedReportCardLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* RATEIO CONSOLIDADO POR PESSOA */}
              <div className="bg-card border border-border p-4.5 rounded-2xl space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Rateio Consolidado (Você e Amigos)</h3>
                {reportsPersonShares.length === 0 ? (
                  <p className="text-xs text-textMuted text-center py-4">Nenhum rateio consolidado para este período.</p>
                ) : (
                  <div className="space-y-2.5">
                    {reportsPersonShares.map(share => {
                      const percentage = totalFaturasMese > 0 ? (share.amount / totalFaturasMese) * 100 : 0;
                      return (
                        <div key={share.name} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className={`font-semibold ${share.isOwner ? 'text-emerald-400' : 'text-slate-200'}`}>
                              {share.name} {share.isOwner && '(Você)'}
                            </span>
                            <span className="text-white font-bold">
                              R$ {share.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                share.isOwner ? 'bg-emerald-500' : 'bg-accent'
                              }`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* DETALHAMENTO DE RATEIO POR AMIGO E PARCELA */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Divisão Cirúrgica por Amigo</h3>

                {enrichedMonthInstallments.filter(inst => inst.friendsAssigned.length > 0).length === 0 ? (
                  <p className="text-xs text-textMuted text-center py-8 bg-card/30 border border-dashed border-border rounded-xl">
                    Nenhum amigo tem parcelas a pagar para este mês.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {enrichedMonthInstallments.map(inst => {
                      if (inst.friendsAssigned.length === 0) return null;

                      return (
                        <div key={inst.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                          {/* Cabeçalho da Compra */}
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-bold text-white block">{inst.purchaseDesc}</span>
                              <span className="text-[10px] text-textMuted flex items-center gap-1.5 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${inst.cardColor}`}></span>
                                {inst.cardName} • {inst.isRecurrent ? 'Recorrente' : `Parc. ${inst.installment_number}/${inst.totalInstallments}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="text-xs font-extrabold text-white block">
                                  R$ {inst.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                                <span className="text-[9px] text-textMuted font-semibold">total da parcela</span>
                              </div>
                              {inst.isRecurrent && hasFutureInstallments(inst.purchase_id) && (
                                <button
                                  onClick={() => handleDeactivateRecurrence(inst.purchase_id)}
                                  className="p-1.5 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                                  title="Desativar Recorrência"
                                >
                                  <AlertCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Lista de amigos vinculados a esta parcela */}
                          <div className="border-t border-border pt-3 space-y-2">
                            {inst.friendsAssigned.map(fAssigned => {
                              const friend = friends.find(f => f.id === fAssigned.friend_id);
                              const isPaid = fAssigned.status === 'paid';

                              return (
                                <div key={fAssigned.id} className="flex justify-between items-center bg-background/50 border border-border/40 p-2.5 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${isPaid ? 'bg-success/10 text-success border border-success/20' : 'bg-accent/10 text-accent border border-accent/20'
                                      }`}>
                                      {friend?.name.substring(0, 2).toUpperCase() || 'AM'}
                                    </div>
                                    <div>
                                      <span className="text-xs font-medium text-white block">{friend?.name || 'Amigo Excluído'}</span>
                                      <span className="text-[9px] text-textMuted">
                                        Deve pagar R$ {fAssigned.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => toggleFriendPaidStatus(fAssigned.id, fAssigned.status)}
                                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 border ${isPaid
                                        ? 'bg-success/15 border-success/30 text-success hover:bg-success/20'
                                        : 'bg-zinc-800 border-border text-zinc-300 hover:bg-zinc-700'
                                      }`}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    {isPaid ? 'Pago' : 'Marcar Pago'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* LISTA COMPLETA DE PARCELAS DO MÊS PARA O PROPRIETÁRIO */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Suas Parcelas e Faturas Individuais</h3>

                {enrichedMonthInstallments.length === 0 ? (
                  <p className="text-xs text-textMuted text-center py-6">Nenhuma parcela cadastrada para vencer este mês.</p>
                ) : (
                  <div className="space-y-2">
                    {enrichedMonthInstallments.map(inst => (
                      <div key={inst.id} className="bg-card border border-border p-3.5 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => toggleInstallmentStatus(inst.id, inst.status)}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${inst.status === 'paid'
                                ? 'bg-success border-success text-white'
                                : 'border-border bg-background text-transparent hover:border-accent'
                              }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </button>
                          <div>
                            <span className={`text-xs font-bold block ${inst.status === 'paid' ? 'line-through text-textMuted' : 'text-white'}`}>
                              {inst.purchaseDesc}
                            </span>
                            <span className="text-[10px] text-textMuted flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${inst.cardColor}`}></span>
                              {inst.cardName} • {inst.isRecurrent ? 'Recorrente' : `Parc. ${inst.installment_number}/${inst.totalInstallments}`}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <span className={`text-xs font-bold block ${inst.status === 'paid' ? 'text-textMuted' : 'text-white'}`}>
                              R$ {inst.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            {inst.friendsAssigned.length > 0 && (
                              <span className="text-[9px] text-accent font-medium block">
                                Sua fatia: R$ {inst.ownerShare.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                          {inst.isRecurrent && hasFutureInstallments(inst.purchase_id) && (
                            <button
                              onClick={() => handleDeactivateRecurrence(inst.purchase_id)}
                              className="p-1.5 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                              title="Desativar Recorrência"
                            >
                              <AlertCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* BOTTOM NAVIGATION BAR (FIXA PARA MOBILE) */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bottom-nav-blur h-20 px-4 flex items-center justify-around z-40">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all ${activeTab === 'home' ? 'text-accent' : 'text-textMuted hover:text-slate-200'
              }`}
          >
            <Home className="w-5.5 h-5.5 stroke-[2]" />
            <span className="text-[10px] font-bold">Início</span>
          </button>

          <button
            onClick={() => setActiveTab('cards')}
            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all ${activeTab === 'cards' ? 'text-accent' : 'text-textMuted hover:text-slate-200'
              }`}
          >
            <CardIcon className="w-5.5 h-5.5 stroke-[2]" />
            <span className="text-[10px] font-bold">Cartões</span>
          </button>

          {/* Botão de Adição Rápida centralizado */}
          <button
            onClick={() => setActiveTab('purchases')}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tr from-accent to-indigo-700 text-white shadow-lg shadow-accent/20 hover:scale-105 transition-all -translate-y-2 border border-white/10`}
            title="Lançar Nova Compra"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>

          <button
            onClick={() => setActiveTab('friends')}
            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all ${activeTab === 'friends' ? 'text-accent' : 'text-textMuted hover:text-slate-200'
              }`}
          >
            <Users className="w-5.5 h-5.5 stroke-[2]" />
            <span className="text-[10px] font-bold">Amigos</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all ${activeTab === 'reports' ? 'text-accent' : 'text-textMuted hover:text-slate-200'
              }`}
          >
            <FileText className="w-5.5 h-5.5 stroke-[2]" />
            <span className="text-[10px] font-bold">Relatórios</span>
          </button>
        </nav>

      </div>
    </div>
  );
}
