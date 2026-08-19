/**
 * db.js - Sistema de Banco de Dados Local e Autenticação
 * Fornece persistência em LocalStorage com suporte a múltiplos usuários,
 * criptografia SHA-256, Carteira de FIIs e Módulo de Carros de Leilão com Planilha de Gastos estilo Excel.
 */

class Database {
    constructor() {
        this.STORAGE_KEYS = {
            USERS: 'fiimaster_users',
            INVESTMENTS: 'fiimaster_investments',
            CARS: 'fiimaster_auction_cars',
            CURRENT_USER: 'fiimaster_current_session'
        };
        this.init();
    }

    init() {
        if (!localStorage.getItem(this.STORAGE_KEYS.USERS)) {
            localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify([]));
        }
        if (!localStorage.getItem(this.STORAGE_KEYS.INVESTMENTS)) {
            localStorage.setItem(this.STORAGE_KEYS.INVESTMENTS, JSON.stringify([]));
        }
        if (!localStorage.getItem(this.STORAGE_KEYS.CARS)) {
            localStorage.setItem(this.STORAGE_KEYS.CARS, JSON.stringify([]));
        }
    }

    // Hash de senha usando Web Crypto API nativa (SHA-256)
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Gerador de IDs únicos
    generateId() {
        return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
    }

    // --- MÉTODOS DE USUÁRIO / AUTENTICAÇÃO ---

    getUsers() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS)) || [];
        } catch (e) {
            console.error('Erro ao ler usuários:', e);
            return [];
        }
    }

    async registerUser(name, email, password) {
        const cleanEmail = email.trim().toLowerCase();
        const users = this.getUsers();

        if (users.some(u => u.email === cleanEmail)) {
            throw new Error('Já existe uma conta cadastrada com este e-mail.');
        }

        const passwordHash = await this.hashPassword(password);
        const newUser = {
            id: this.generateId(),
            name: name.trim(),
            email: cleanEmail,
            passwordHash: passwordHash,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));

        this.setCurrentUser(newUser);
        return newUser;
    }

    async loginUser(email, password) {
        const cleanEmail = email.trim().toLowerCase();
        const users = this.getUsers();
        const user = users.find(u => u.email === cleanEmail);

        if (!user) {
            throw new Error('E-mail não encontrado.');
        }

        const passwordHash = await this.hashPassword(password);
        if (user.passwordHash !== passwordHash) {
            throw new Error('Senha incorreta.');
        }

        this.setCurrentUser(user);
        return user;
    }

    setCurrentUser(user) {
        const sessionData = {
            id: user.id,
            name: user.name,
            email: user.email
        };
        localStorage.setItem(this.STORAGE_KEYS.CURRENT_USER, JSON.stringify(sessionData));
    }

    getCurrentUser() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEYS.CURRENT_USER);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    logout() {
        localStorage.removeItem(this.STORAGE_KEYS.CURRENT_USER);
    }

    // Conta de Demonstração
    async createOrLoginDemoUser() {
        const demoEmail = 'investidor.demo@negocios.com';
        let users = this.getUsers();
        let demoUser = users.find(u => u.email === demoEmail);

        if (!demoUser) {
            const passwordHash = await this.hashPassword('demo1234');
            demoUser = {
                id: 'user_demo_default',
                name: 'Gestor de Negócios',
                email: demoEmail,
                passwordHash: passwordHash,
                createdAt: new Date().toISOString()
            };
            users.push(demoUser);
            localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));

            // Carteira Demo de FIIs
            const initialInvestments = [
                { id: this.generateId(), userId: demoUser.id, ticker: 'SNAG11', segment: 'Fiagro', shares: 200, avgPrice: 9.92, lastDividend: 0.12, notes: 'Suno Agro', updatedAt: new Date().toISOString() },
                { id: this.generateId(), userId: demoUser.id, ticker: 'KNSC11', segment: 'Papel/CRI', shares: 120, avgPrice: 8.92, lastDividend: 0.10, notes: 'Kinea Securities', updatedAt: new Date().toISOString() },
                { id: this.generateId(), userId: demoUser.id, ticker: 'GARE11', segment: 'Híbrido', shares: 150, avgPrice: 8.08, lastDividend: 0.083, notes: 'Guardian Real Estate', updatedAt: new Date().toISOString() },
                { id: this.generateId(), userId: demoUser.id, ticker: 'BTCI11', segment: 'Papel/CRI', shares: 100, avgPrice: 9.00, lastDividend: 0.103, notes: 'BTG Pactual Crédito', updatedAt: new Date().toISOString() },
                { id: this.generateId(), userId: demoUser.id, ticker: 'MXRF11', segment: 'Papel/CRI', shares: 300, avgPrice: 9.30, lastDividend: 0.10, notes: 'Maxi Renda FII', updatedAt: new Date().toISOString() }
            ];

            const allInvestments = this.getAllInvestmentsRaw();
            allInvestments.push(...initialInvestments);
            localStorage.setItem(this.STORAGE_KEYS.INVESTMENTS, JSON.stringify(allInvestments));

            // Carros Demo com Planilha de Gastos
            const initialCars = [
                {
                    id: this.generateId(),
                    userId: demoUser.id,
                    model: 'Honda Civic EXL 2.0 Flex',
                    year: '2020/2020',
                    plate: 'BRA2E19',
                    auctioneer: 'Sodré Santoro',
                    bidAmount: 68000,
                    purchaseDate: '2026-06-10',
                    status: 'À Venda',
                    salePrice: 94000,
                    saleDate: '',
                    fipeValue: 105000,
                    notes: 'Recuperado de financiamento. Excelente estado de mecânica.',
                    expenses: [
                        { id: 'exp_1', date: '2026-06-11', category: 'Taxa Leiloeiro', description: 'Comissão 5% + taxa administrativa', supplier: 'Sodré Santoro', amount: 3900 },
                        { id: 'exp_2', date: '2026-06-14', category: 'Guincho', description: 'Frete pátio Guarulhos até oficina', supplier: 'Guincho 24 Horas', amount: 400 },
                        { id: 'exp_3', date: '2026-06-18', category: 'Mecânica', description: 'Revisão geral: troca de óleo 0W20, filtros e velas', supplier: 'Auto Mecânica Paulista', amount: 950 },
                        { id: 'exp_4', date: '2026-06-25', category: 'Funilaria / Pintura', description: 'Pintura do para-choque traseiro e polimento cristalizado', supplier: 'Oficina do Carlinhos', amount: 1200 },
                        { id: 'exp_5', date: '2026-07-02', category: 'Documentação', description: 'Transferência + IPVA proporcional + Laudo Inmetro', supplier: 'Despachante São Paulo', amount: 1450 }
                    ],
                    updatedAt: new Date().toISOString()
                },
                {
                    id: this.generateId(),
                    userId: demoUser.id,
                    model: 'Toyota Corolla XEi 2.0 Automático',
                    year: '2019/2019',
                    plate: 'RJG8A44',
                    auctioneer: 'Freitas Leiloeiro',
                    bidAmount: 58000,
                    purchaseDate: '2026-04-15',
                    status: 'Vendido',
                    salePrice: 86500,
                    saleDate: '2026-07-20',
                    fipeValue: 98000,
                    notes: 'Pequena monta, vendido com ótimo lucro para cliente particular.',
                    expenses: [
                        { id: 'exp_6', date: '2026-04-16', category: 'Taxa Leiloeiro', description: 'Comissão 5% + Pátio', supplier: 'Freitas Leiloeiro', amount: 3600 },
                        { id: 'exp_7', date: '2026-04-22', category: 'Peças & Lataria', description: 'Farol dianteiro direito original + grade', supplier: 'Auto Peças Renascer', amount: 1800 },
                        { id: 'exp_8', date: '2026-05-05', category: 'Funilaria / Pintura', description: 'Alinhamento do para-lama e pintura', supplier: 'Centro Automotivo Elite', amount: 1600 },
                        { id: 'exp_9', date: '2026-05-18', category: 'Documentação', description: 'Desbloqueio de sinistro e laudo CSV', supplier: 'Despachante Rápido', amount: 1200 },
                        { id: 'exp_10', date: '2026-06-01', category: 'Higienização', description: 'Lavagem técnica detalhada e higienização dos bancos', supplier: 'Lava Rápido Prime', amount: 350 }
                    ],
                    updatedAt: new Date().toISOString()
                },
                {
                    id: this.generateId(),
                    userId: demoUser.id,
                    model: 'Volkswagen Polo TSI 1.0 Comfortline',
                    year: '2022/2023',
                    plate: 'SPX3C88',
                    auctioneer: 'Copart Leilões',
                    bidAmount: 51000,
                    purchaseDate: '2026-08-01',
                    status: 'Em Reforma',
                    salePrice: 76000,
                    saleDate: '',
                    fipeValue: 82000,
                    notes: 'Desativação de frota de locadora, pequenos detalhes estéticos.',
                    expenses: [
                        { id: 'exp_11', date: '2026-08-02', category: 'Taxa Leiloeiro', description: 'Comissão leiloeiro + taxa de emissão de nota', supplier: 'Copart', amount: 3100 },
                        { id: 'exp_12', date: '2026-08-06', category: 'Mecânica', description: 'Pastilhas de freio dianteiras e alinhamento', supplier: 'Oficina Ponto Certo', amount: 650 },
                        { id: 'exp_13', date: '2026-08-10', category: 'Pneus', description: '2 Pneus novos aro 16 Pirelli', supplier: 'Pneus e Cia', amount: 1100 }
                    ],
                    updatedAt: new Date().toISOString()
                }
            ];

            const allCars = this.getAllCarsRaw();
            allCars.push(...initialCars);
            localStorage.setItem(this.STORAGE_KEYS.CARS, JSON.stringify(allCars));
        }

        this.setCurrentUser(demoUser);
        return demoUser;
    }

    // --- MÉTODOS DE INVESTIMENTOS (FIIs) ---

    getAllInvestmentsRaw() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEYS.INVESTMENTS)) || [];
        } catch (e) {
            console.error('Erro ao ler investimentos:', e);
            return [];
        }
    }

    getUserInvestments(userId) {
        if (!userId) return [];
        const all = this.getAllInvestmentsRaw();
        return all.filter(inv => inv.userId === userId);
    }

    saveInvestment(investmentData) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) throw new Error('Você precisa estar logado para salvar seus investimentos.');

        let all = this.getAllInvestmentsRaw();

        if (investmentData.id) {
            const index = all.findIndex(inv => inv.id === investmentData.id && inv.userId === currentUser.id);
            if (index !== -1) {
                all[index] = {
                    ...all[index],
                    ...investmentData,
                    ticker: investmentData.ticker.toUpperCase().trim(),
                    shares: parseInt(investmentData.shares),
                    avgPrice: parseFloat(investmentData.avgPrice),
                    lastDividend: parseFloat(investmentData.lastDividend),
                    updatedAt: new Date().toISOString()
                };
            } else {
                throw new Error('Investimento não encontrado para edição.');
            }
        } else {
            const newInv = {
                id: this.generateId(),
                userId: currentUser.id,
                ticker: investmentData.ticker.toUpperCase().trim(),
                segment: investmentData.segment || 'Outro',
                shares: parseInt(investmentData.shares) || 0,
                avgPrice: parseFloat(investmentData.avgPrice) || 0,
                lastDividend: parseFloat(investmentData.lastDividend) || 0,
                notes: investmentData.notes ? investmentData.notes.trim() : '',
                updatedAt: new Date().toISOString()
            };
            all.push(newInv);
        }

        localStorage.setItem(this.STORAGE_KEYS.INVESTMENTS, JSON.stringify(all));
        return this.getUserInvestments(currentUser.id);
    }

    buyMoreShares(investmentId, additionalShares, purchasePrice, newLastDividend = null) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) throw new Error('Você precisa estar logado.');

        const addShares = parseInt(additionalShares);
        const price = parseFloat(purchasePrice);

        if (isNaN(addShares) || addShares <= 0) throw new Error('A quantidade de novas cotas deve ser maior que zero.');
        if (isNaN(price) || price <= 0) throw new Error('O preço pago por cota deve ser maior que zero.');

        let all = this.getAllInvestmentsRaw();
        const index = all.findIndex(inv => inv.id === investmentId && inv.userId === currentUser.id);

        if (index === -1) throw new Error('Investimento não encontrado.');

        const current = all[index];
        const currentShares = parseInt(current.shares) || 0;
        const currentAvgPrice = parseFloat(current.avgPrice) || 0;

        const currentTotalCost = currentShares * currentAvgPrice;
        const additionalCost = addShares * price;
        const totalNewShares = currentShares + addShares;
        const calculatedNewAvgPrice = (currentTotalCost + additionalCost) / totalNewShares;

        all[index] = {
            ...current,
            shares: totalNewShares,
            avgPrice: parseFloat(calculatedNewAvgPrice.toFixed(4)),
            lastDividend: (newLastDividend !== null && !isNaN(parseFloat(newLastDividend)) && parseFloat(newLastDividend) >= 0) 
                ? parseFloat(newLastDividend) 
                : current.lastDividend,
            updatedAt: new Date().toISOString()
        };

        localStorage.setItem(this.STORAGE_KEYS.INVESTMENTS, JSON.stringify(all));
        return all[index];
    }

    deleteInvestment(investmentId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) throw new Error('Você precisa estar logado.');

        let all = this.getAllInvestmentsRaw();
        all = all.filter(inv => !(inv.id === investmentId && inv.userId === currentUser.id));
        localStorage.setItem(this.STORAGE_KEYS.INVESTMENTS, JSON.stringify(all));
        return this.getUserInvestments(currentUser.id);
    }

    // --- MÉTODOS DE NEGÓCIOS DE CARROS DE LEILÃO ---

    getAllCarsRaw() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEYS.CARS)) || [];
        } catch (e) {
            console.error('Erro ao ler carros de leilão:', e);
            return [];
        }
    }

    getUserCars(userId) {
        if (!userId) return [];
        const all = this.getAllCarsRaw();
        return all.filter(car => car.userId === userId);
    }

    getCarById(carId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return null;
        const all = this.getAllCarsRaw();
        return all.find(c => c.id === carId && c.userId === currentUser.id) || null;
    }

    saveCar(carData) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) throw new Error('Você precisa estar logado para gerenciar seus carros de leilão.');

        let all = this.getAllCarsRaw();

        const cleanCar = {
            userId: currentUser.id,
            model: (carData.model || '').trim(),
            year: (carData.year || '').trim(),
            plate: (carData.plate || '').toUpperCase().trim(),
            auctioneer: (carData.auctioneer || '').trim(),
            bidAmount: parseFloat(carData.bidAmount) || 0,
            purchaseDate: carData.purchaseDate || new Date().toISOString().split('T')[0],
            status: carData.status || 'Em Reforma', // 'Em Reforma', 'À Venda', 'Vendido'
            salePrice: parseFloat(carData.salePrice) || 0,
            saleDate: carData.saleDate || '',
            fipeValue: parseFloat(carData.fipeValue) || 0,
            notes: (carData.notes || '').trim(),
            updatedAt: new Date().toISOString()
        };

        if (carData.id) {
            const index = all.findIndex(c => c.id === carData.id && c.userId === currentUser.id);
            if (index !== -1) {
                // Preserva a lista de despesas existente
                const existingExpenses = all[index].expenses || [];
                all[index] = { 
                    ...all[index], 
                    ...cleanCar, 
                    id: carData.id,
                    expenses: carData.expenses !== undefined ? carData.expenses : existingExpenses
                };
            } else {
                throw new Error('Veículo não encontrado para edição.');
            }
        } else {
            cleanCar.id = this.generateId();
            cleanCar.expenses = carData.expenses || [];
            cleanCar.createdAt = new Date().toISOString();
            all.push(cleanCar);
        }

        localStorage.setItem(this.STORAGE_KEYS.CARS, JSON.stringify(all));
        return this.getUserCars(currentUser.id);
    }

    // Adiciona uma linha de gasto / serviço na planilha do carro
    addCarExpense(carId, expenseData) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) throw new Error('Você precisa estar logado.');

        let all = this.getAllCarsRaw();
        const index = all.findIndex(c => c.id === carId && c.userId === currentUser.id);

        if (index === -1) throw new Error('Veículo não encontrado.');

        const newExpense = {
            id: this.generateId(),
            date: expenseData.date || new Date().toISOString().split('T')[0],
            category: expenseData.category || 'Mecânica',
            description: (expenseData.description || '').trim(),
            supplier: (expenseData.supplier || '').trim(),
            amount: parseFloat(expenseData.amount) || 0,
            createdAt: new Date().toISOString()
        };

        if (!all[index].expenses) all[index].expenses = [];
        all[index].expenses.push(newExpense);
        all[index].updatedAt = new Date().toISOString();

        localStorage.setItem(this.STORAGE_KEYS.CARS, JSON.stringify(all));
        return all[index];
    }

    // Exclui uma linha de gasto da planilha
    deleteCarExpense(carId, expenseId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) throw new Error('Você precisa estar logado.');

        let all = this.getAllCarsRaw();
        const index = all.findIndex(c => c.id === carId && c.userId === currentUser.id);

        if (index === -1) throw new Error('Veículo não encontrado.');

        all[index].expenses = (all[index].expenses || []).filter(e => e.id !== expenseId);
        all[index].updatedAt = new Date().toISOString();

        localStorage.setItem(this.STORAGE_KEYS.CARS, JSON.stringify(all));
        return all[index];
    }

    deleteCar(carId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) throw new Error('Você precisa estar logado.');

        let all = this.getAllCarsRaw();
        all = all.filter(car => !(car.id === carId && car.userId === currentUser.id));
        localStorage.setItem(this.STORAGE_KEYS.CARS, JSON.stringify(all));
        return this.getUserCars(currentUser.id);
    }
}

// Instância global do Banco de Dados
window.db = new Database();
