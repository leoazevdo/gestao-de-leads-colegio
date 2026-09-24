const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') 
    ? { rejectUnauthorized: false } 
    : false
});

const initDb = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      nome_resp VARCHAR(255),
      nome_aluno VARCHAR(255) NOT NULL,
      telefone VARCHAR(50),
      serie VARCHAR(100),
      status VARCHAR(50) DEFAULT 'Novo Lead',
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log('Tabela "leads" verificada/criada com sucesso no PostgreSQL.');
  } catch (err) {
    console.error('Erro ao inicializar tabela no PostgreSQL:', err.message);
  }
};

initDb();

module.exports = pool;