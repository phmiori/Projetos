const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Configuração de middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos (front-end)
app.use(express.static(path.join(__dirname, 'public')));

// Inicializa o banco de dados SQLite (em arquivo)
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Erro ao conectar com o banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        // Cria a tabela de usuários se não existir
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT
        )`);
    }
});

// ============================================
// ROTAS DE API
// ============================================

// Registrar usuário (Cadastro)
app.post('/api/register', (req, res) => {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // Usando texto puro por ser um projeto de portfólio sem dados sensíveis
    const query = `INSERT INTO users (email, password, name) VALUES (?, ?, ?)`;
    
    db.run(query, [email, password, name || ''], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'E-mail já está em uso.' });
            }
            return res.status(500).json({ error: 'Erro no servidor.' });
        }
        res.status(201).json({ message: 'Conta criada com sucesso!', userId: this.lastID });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const query = `SELECT id, email, name FROM users WHERE email = ? AND password = ?`;
    
    db.get(query, [email, password], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erro no servidor.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        }
        res.status(200).json({ message: 'Login realizado com sucesso!', user });
    });
});

// ============================================
// ROTAS DE NAVEGAÇÃO
// ============================================

// Fallback para index.html (se acessar rota não definida, manda pro home)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
